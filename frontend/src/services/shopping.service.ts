import { supabase } from "@/lib/supabase"

/**
 * Servicio de «Compras del hogar».
 *
 * Tablas: household_products, household_shopping_items, household_stock_movements.
 * Funciones RPC (transaccionales, SECURITY DEFINER):
 *   household_create_product, household_adjust_stock,
 *   household_set_archived, household_confirm_purchase.
 *
 * RLS: todas filtran por auth.uid() = user_id. El user_id se envía explícito en
 * los inserts directos (líneas de la lista). La escritura de stock e historial
 * solo ocurre dentro de las funciones RPC.
 */

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  const userId = data.user?.id
  if (!userId) throw new Error("Usuario no autenticado")
  return userId
}

// --- Tipos ------------------------------------------------------------------

export type Unit =
  | "unidad"
  | "paquete"
  | "libra"
  | "kilogramo"
  | "litro"
  | "mililitro"

export type ProductStatus = "out" | "low" | "ok"
export type ItemStatus = "pending" | "purchased" | "removed"
export type MovementReason = "initial" | "adjustment" | "purchase"

export interface Product {
  id: string
  name: string
  category: string | null
  unit: string
  stock: number
  minimum: number
  target: number
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ShoppingItem {
  id: string
  productId: string
  requestedQuantity: number
  purchasedQuantity: number | null
  status: ItemStatus
  createdAt: string
  updatedAt: string
  purchasedAt: string | null
}

export interface StockMovement {
  id: string
  productId: string
  shoppingItemId: string | null
  quantityDelta: number
  stockBefore: number
  stockAfter: number
  reason: MovementReason
  productName: string
  productUnit: string
  createdAt: string
}

// --- Mappers ----------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
const mapProduct = (r: any): Product => ({
  id: r.id,
  name: r.name,
  category: r.category ?? null,
  unit: r.unit,
  stock: Number(r.stock_quantity ?? 0),
  minimum: Number(r.minimum_quantity ?? 0),
  target: Number(r.target_quantity ?? 0),
  archivedAt: r.archived_at ?? null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

const mapItem = (r: any): ShoppingItem => ({
  id: r.id,
  productId: r.product_id,
  requestedQuantity: Number(r.requested_quantity ?? 0),
  purchasedQuantity: r.purchased_quantity != null ? Number(r.purchased_quantity) : null,
  status: (r.status ?? "pending") as ItemStatus,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  purchasedAt: r.purchased_at ?? null,
})

const mapMovement = (r: any): StockMovement => ({
  id: r.id,
  productId: r.product_id,
  shoppingItemId: r.shopping_item_id ?? null,
  quantityDelta: Number(r.quantity_delta ?? 0),
  stockBefore: Number(r.stock_before ?? 0),
  stockAfter: Number(r.stock_after ?? 0),
  reason: (r.reason ?? "adjustment") as MovementReason,
  productName: r.product_name,
  productUnit: r.product_unit,
  createdAt: r.created_at,
})
/* eslint-enable @typescript-eslint/no-explicit-any */

const PRODUCT_SELECT =
  "id, name, category, unit, stock_quantity, minimum_quantity, target_quantity, archived_at, created_at, updated_at"
const ITEM_SELECT =
  "id, product_id, requested_quantity, purchased_quantity, status, created_at, updated_at, purchased_at"
const MOVEMENT_SELECT =
  "id, product_id, shopping_item_id, quantity_delta, stock_before, stock_after, reason, product_name, product_unit, created_at"

// --- Productos (inventario) -------------------------------------------------

export async function getProducts(includeArchived = false): Promise<Product[]> {
  let query = supabase
    .from("household_products")
    .select(PRODUCT_SELECT)
    .order("name", { ascending: true })
  if (!includeArchived) query = query.is("archived_at", null)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map(mapProduct)
}

export interface NewProductInput {
  name: string
  unit: string
  target: number
  minimum?: number
  stock?: number
  category?: string | null
}

export async function createProduct(input: NewProductInput): Promise<Product> {
  const { data, error } = await supabase.rpc("household_create_product", {
    p_name: input.name,
    p_unit: input.unit,
    p_target: input.target,
    p_minimum: input.minimum ?? 0,
    p_stock: input.stock ?? 0,
    p_category: input.category ?? null,
  })
  if (error) throw error
  return mapProduct(data)
}

export interface UpdateProductInput {
  id: string
  name: string
  unit: string
  target: number
  minimum: number
  category?: string | null
}

/** Edita campos editables del producto. NO toca el stock (guardado en BD). */
export async function updateProduct(input: UpdateProductInput): Promise<Product> {
  const { data, error } = await supabase
    .from("household_products")
    .update({
      name: input.name.trim(),
      unit: input.unit,
      target_quantity: input.target,
      minimum_quantity: input.minimum,
      category: input.category?.trim() ? input.category.trim() : null,
    })
    .eq("id", input.id)
    .select(PRODUCT_SELECT)
    .single()
  if (error) throw error
  return mapProduct(data)
}

export async function adjustStock(productId: string, newQuantity: number): Promise<Product> {
  const { data, error } = await supabase.rpc("household_adjust_stock", {
    p_product_id: productId,
    p_new_quantity: newQuantity,
  })
  if (error) throw error
  return mapProduct(data)
}

export async function setArchived(productId: string, archived: boolean): Promise<Product> {
  const { data, error } = await supabase.rpc("household_set_archived", {
    p_product_id: productId,
    p_archived: archived,
  })
  if (error) throw error
  return mapProduct(data)
}

// --- Lista de compras -------------------------------------------------------

/** Líneas pendientes (lista activa). */
export async function getPendingItems(): Promise<ShoppingItem[]> {
  const { data, error } = await supabase
    .from("household_shopping_items")
    .select(ITEM_SELECT)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
  if (error) throw error
  return (data ?? []).map(mapItem)
}

export async function addItem(productId: string, requestedQuantity: number): Promise<ShoppingItem> {
  const userId = await requireUserId()
  const { data, error } = await supabase
    .from("household_shopping_items")
    .insert({
      user_id: userId,
      product_id: productId,
      requested_quantity: requestedQuantity,
      status: "pending",
    })
    .select(ITEM_SELECT)
    .single()
  if (error) throw error
  return mapItem(data)
}

/** Inserta varias líneas pendientes ignorando las que ya existan (índice único parcial). */
export async function addMissingItems(
  rows: { productId: string; requestedQuantity: number }[]
): Promise<ShoppingItem[]> {
  if (rows.length === 0) return []
  const userId = await requireUserId()
  const { data, error } = await supabase
    .from("household_shopping_items")
    .insert(
      rows.map((r) => ({
        user_id: userId,
        product_id: r.productId,
        requested_quantity: r.requestedQuantity,
        status: "pending" as const,
      }))
    )
    .select(ITEM_SELECT)
  if (error) throw error
  return (data ?? []).map(mapItem)
}

export async function updateItemQuantity(id: string, requestedQuantity: number): Promise<ShoppingItem> {
  const { data, error } = await supabase
    .from("household_shopping_items")
    .update({ requested_quantity: requestedQuantity })
    .eq("id", id)
    .select(ITEM_SELECT)
    .single()
  if (error) throw error
  return mapItem(data)
}

/** Quitar una línea no elimina el producto: la marca como 'removed'. */
export async function removeItem(id: string): Promise<void> {
  const { error } = await supabase
    .from("household_shopping_items")
    .update({ status: "removed" })
    .eq("id", id)
  if (error) throw error
}

export interface ConfirmLine {
  id: string
  quantity: number
}

/** Confirma la compra de las líneas seleccionadas (transaccional e idempotente). */
export async function confirmPurchase(lines: ConfirmLine[]): Promise<StockMovement[]> {
  const { data, error } = await supabase.rpc("household_confirm_purchase", {
    p_items: lines.map((l) => ({ id: l.id, quantity: l.quantity })),
  })
  if (error) throw error
  return (data ?? []).map(mapMovement)
}

// --- Historial --------------------------------------------------------------

export async function getMovements(limit = 100): Promise<StockMovement[]> {
  const { data, error } = await supabase
    .from("household_stock_movements")
    .select(MOVEMENT_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map(mapMovement)
}
