import { useCallback, useEffect, useState } from "react"
import { AlertCircle, ClipboardList, History, Package } from "lucide-react"
import { PageContainer } from "@/components/ui/PageContainer"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { toast } from "sonner"
import * as shoppingService from "@/services/shopping.service"
import type { Product, ShoppingItem, StockMovement } from "@/services/shopping.service"
import InventoryTab from "./inventory-tab"
import ShoppingListTab from "./shopping-list-tab"
import HistoryTab from "./history-tab"
import type { ProductFormValues } from "./ProductFormDialog"

function ShoppingPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [prods, pending, movs] = await Promise.all([
        shoppingService.getProducts(true),
        shoppingService.getPendingItems(),
        shoppingService.getMovements(),
      ])
      setProducts(prods)
      setItems(pending)
      setMovements(movs)
    } catch (err) {
      console.error(err)
      setError("No se pudieron cargar los datos de compras.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const refreshProducts = useCallback(async () => {
    setProducts(await shoppingService.getProducts(true))
  }, [])

  const refreshItems = useCallback(async () => {
    setItems(await shoppingService.getPendingItems())
  }, [])

  const refreshMovements = useCallback(async () => {
    setMovements(await shoppingService.getMovements())
  }, [])

  // --- Inventario ---
  const handleCreate = async (values: ProductFormValues) => {
    await shoppingService.createProduct({
      name: values.name,
      unit: values.unit,
      target: values.target,
      minimum: values.minimum,
      stock: values.stock,
      category: values.category || null,
    })
    await Promise.all([refreshProducts(), refreshMovements()])
  }

  const handleUpdate = async (product: Product, values: ProductFormValues) => {
    await shoppingService.updateProduct({
      id: product.id,
      name: values.name,
      unit: values.unit,
      target: values.target,
      minimum: values.minimum,
      category: values.category || null,
    })
    await refreshProducts()
  }

  const handleAdjust = async (product: Product, newQuantity: number) => {
    await shoppingService.adjustStock(product.id, newQuantity)
    await Promise.all([refreshProducts(), refreshMovements()])
  }

  const handleArchive = async (product: Product, archived: boolean) => {
    await shoppingService.setArchived(product.id, archived)
    await Promise.all([refreshProducts(), refreshItems()])
  }

  // --- Lista de compras ---
  const handleAddItem = async (product: Product, quantity: number) => {
    await shoppingService.addItem(product.id, quantity)
    await refreshItems()
  }

  const handleAddMissing = async (rows: { product: Product; quantity: number }[]) => {
    await shoppingService.addMissingItems(
      rows.map((r) => ({ productId: r.product.id, requestedQuantity: r.quantity }))
    )
    await refreshItems()
  }

  const handleUpdateQuantity = async (item: ShoppingItem, quantity: number) => {
    try {
      await shoppingService.updateItemQuantity(item.id, quantity)
      await refreshItems()
    } catch (err) {
      console.error(err)
      toast.error("No se pudo actualizar la cantidad")
    }
  }

  const handleRemoveItem = async (item: ShoppingItem) => {
    try {
      await shoppingService.removeItem(item.id)
      await refreshItems()
      toast.success("Línea quitada de la lista")
    } catch (err) {
      console.error(err)
      toast.error("No se pudo quitar la línea")
    }
  }

  const handleCreateProductAndAdd = async (values: ProductFormValues) => {
    const product = await shoppingService.createProduct({
      name: values.name,
      unit: values.unit,
      target: values.target,
      minimum: values.minimum,
      stock: 0,
      category: values.category || null,
    })
    // Stock 0 → sugerencia = objetivo.
    await shoppingService.addItem(product.id, values.target)
    await Promise.all([refreshProducts(), refreshItems(), refreshMovements()])
  }

  const handleConfirmPurchase = async (lines: { id: string; quantity: number }[]) => {
    await shoppingService.confirmPurchase(lines)
    await Promise.all([refreshProducts(), refreshItems(), refreshMovements()])
  }

  if (error) {
    return (
      <PageContainer>
        <Card className="border-destructive/40">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button onClick={() => void loadAll()}>Reintentar</Button>
          </CardContent>
        </Card>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <Tabs defaultValue="inventory" className="gap-4">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="inventory">
            <Package className="h-4 w-4" />
            <span className="hidden sm:inline">Inventario</span>
          </TabsTrigger>
          <TabsTrigger value="list">
            <ClipboardList className="h-4 w-4" />
            <span className="hidden sm:inline">Lista de compras</span>
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">Historial</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inventory">
          <InventoryTab
            products={products}
            loading={loading}
            onCreate={handleCreate}
            onUpdate={handleUpdate}
            onAdjust={handleAdjust}
            onArchive={handleArchive}
            onAddToList={handleAddItem}
          />
        </TabsContent>

        <TabsContent value="list">
          <ShoppingListTab
            products={products}
            items={items}
            loading={loading}
            onAddItem={handleAddItem}
            onAddMissing={handleAddMissing}
            onUpdateQuantity={handleUpdateQuantity}
            onRemoveItem={handleRemoveItem}
            onCreateProductAndAdd={handleCreateProductAndAdd}
            onConfirmPurchase={handleConfirmPurchase}
          />
        </TabsContent>

        <TabsContent value="history">
          <HistoryTab movements={movements} loading={loading} />
        </TabsContent>
      </Tabs>
    </PageContainer>
  )
}

export default ShoppingPage
