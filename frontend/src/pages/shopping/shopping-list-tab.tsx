import { useMemo, useState } from "react"
import {
  CheckCircle2,
  Download,
  ListPlus,
  Loader2,
  Plus,
  Printer,
  Search,
  Trash2,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import type { Product, ShoppingItem } from "@/services/shopping.service"
import { ProductFormDialog, type ProductFormValues } from "./ProductFormDialog"
import {
  buildShoppingCsv,
  downloadCsv,
  formatQty,
  printShoppingList,
  productStatus,
  STATUS_META,
  suggestedQuantity,
  unitAbbr,
  unitLabel,
  type CsvRow,
} from "./shopping-utils"

interface ShoppingListTabProps {
  products: Product[]
  items: ShoppingItem[]
  loading: boolean
  onAddItem: (product: Product, quantity: number) => Promise<void>
  onAddMissing: (rows: { product: Product; quantity: number }[]) => Promise<void>
  onUpdateQuantity: (item: ShoppingItem, quantity: number) => Promise<void>
  onRemoveItem: (item: ShoppingItem) => Promise<void>
  onCreateProductAndAdd: (values: ProductFormValues) => Promise<void>
  onConfirmPurchase: (lines: { id: string; quantity: number }[]) => Promise<void>
}

interface LineRow {
  item: ShoppingItem
  product: Product | undefined
}

function ShoppingListTab({
  products,
  items,
  loading,
  onAddItem,
  onAddMissing,
  onUpdateQuantity,
  onRemoveItem,
  onCreateProductAndAdd,
  onConfirmPurchase,
}: ShoppingListTabProps) {
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")

  // Selección y cantidades reales para confirmar compra.
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [realQty, setRealQty] = useState<Record<string, string>>({})

  const [addOpen, setAddOpen] = useState(false)
  const [addProductId, setAddProductId] = useState("")
  const [addQty, setAddQty] = useState("1")

  const [newProductOpen, setNewProductOpen] = useState(false)

  const [confirming, setConfirming] = useState(false)
  const [addingMissing, setAddingMissing] = useState(false)

  const productById = useMemo(() => {
    const map = new Map<string, Product>()
    for (const p of products) map.set(p.id, p)
    return map
  }, [products])

  // Todas las líneas pendientes (sin filtrar) — base para exportar.
  const allLines = useMemo<LineRow[]>(
    () => items.map((item) => ({ item, product: productById.get(item.productId) })),
    [items, productById]
  )

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const l of allLines) if (l.product?.category) set.add(l.product.category)
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [allLines])

  // Líneas visibles según filtros en pantalla.
  const visibleLines = useMemo(() => {
    const term = search.trim().toLowerCase()
    return allLines.filter(({ product }) => {
      if (!product) return true
      if (term && !product.name.toLowerCase().includes(term)) return false
      if (categoryFilter !== "all" && (product.category ?? "") !== categoryFilter) return false
      return true
    })
  }, [allLines, search, categoryFilter])

  // Sugerencias de reposición: productos activos agotados o por reponer.
  const suggestions = useMemo(() => {
    return products
      .filter((p) => !p.archivedAt && suggestedQuantity(p) > 0)
      .map((p) => ({ product: p, quantity: suggestedQuantity(p) }))
      .sort((a, b) => a.product.name.localeCompare(b.product.name))
  }, [products])

  const pendingProductIds = useMemo(
    () => new Set(items.map((i) => i.productId)),
    [items]
  )

  // Faltantes que aún no tienen línea pendiente.
  const missingToAdd = useMemo(
    () => suggestions.filter((s) => !pendingProductIds.has(s.product.id)),
    [suggestions, pendingProductIds]
  )

  // Productos que se pueden añadir manualmente (activos sin línea pendiente).
  const addableProducts = useMemo(
    () => products.filter((p) => !p.archivedAt && !pendingProductIds.has(p.id)),
    [products, pendingProductIds]
  )

  const selectedLines = useMemo(
    () => allLines.filter((l) => checked[l.item.id]),
    [allLines, checked]
  )

  const getRealQty = (item: ShoppingItem): number => {
    const raw = realQty[item.id]
    if (raw === undefined || raw === "") return item.requestedQuantity
    const n = parseFloat(raw)
    return Number.isNaN(n) ? item.requestedQuantity : n
  }

  const toCsvRows = (lines: LineRow[]): CsvRow[] =>
    lines.map(({ item, product }) => ({
      name: product?.name ?? "(producto)",
      quantity: item.requestedQuantity,
      unit: product?.unit ?? "unidad",
      category: product?.category ?? null,
    }))

  const handleDownload = () => {
    if (allLines.length === 0) {
      toast.error("No hay líneas pendientes para exportar")
      return
    }
    const csv = buildShoppingCsv(toCsvRows(allLines))
    const date = new Date().toISOString().slice(0, 10)
    downloadCsv(`lista-compras-${date}.csv`, csv)
    toast.success("Lista descargada")
  }

  const handlePrint = () => {
    if (allLines.length === 0) {
      toast.error("No hay líneas pendientes para imprimir")
      return
    }
    const ok = printShoppingList(toCsvRows(allLines))
    if (!ok) toast.error("El navegador bloqueó la ventana de impresión")
  }

  const handleAddMissing = async () => {
    if (missingToAdd.length === 0) {
      toast.info("No hay faltantes nuevos por añadir")
      return
    }
    setAddingMissing(true)
    try {
      await onAddMissing(missingToAdd.map((m) => ({ product: m.product, quantity: m.quantity })))
      toast.success(`${missingToAdd.length} producto(s) añadido(s)`)
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : "No se pudieron añadir los faltantes")
    } finally {
      setAddingMissing(false)
    }
  }

  const handleAddSuggestion = async (product: Product, quantity: number) => {
    try {
      await onAddItem(product, quantity)
      toast.success(`${product.name} añadido a la lista`)
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : "No se pudo añadir el producto")
    }
  }

  const handleAddManual = async () => {
    const product = productById.get(addProductId)
    const qty = parseFloat(addQty)
    if (!product) {
      toast.error("Selecciona un producto")
      return
    }
    if (Number.isNaN(qty) || qty <= 0) {
      toast.error("La cantidad debe ser positiva")
      return
    }
    try {
      await onAddItem(product, qty)
      toast.success(`${product.name} añadido a la lista`)
      setAddOpen(false)
      setAddProductId("")
      setAddQty("1")
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : "No se pudo añadir el producto")
    }
  }

  const handleConfirm = async () => {
    if (selectedLines.length === 0) {
      toast.error("Marca al menos una línea comprada")
      return
    }
    const lines: { id: string; quantity: number }[] = []
    for (const l of selectedLines) {
      const q = getRealQty(l.item)
      if (Number.isNaN(q) || q <= 0) {
        toast.error(`Cantidad real inválida en ${l.product?.name ?? "la línea"}`)
        return
      }
      lines.push({ id: l.item.id, quantity: q })
    }
    setConfirming(true)
    try {
      await onConfirmPurchase(lines)
      toast.success(`Compra confirmada: ${lines.length} producto(s)`)
      setChecked({})
      setRealQty({})
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : "No se pudo confirmar la compra")
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Sugerencias de reposición */}
      <Card className="border-border/60">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold text-foreground">Sugerencias de reposición</h3>
              <p className="text-xs text-muted-foreground">
                {suggestions.length === 0
                  ? "Todo está por encima del mínimo."
                  : `${suggestions.length} producto(s) por reponer · ${missingToAdd.length} sin añadir`}
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void handleAddMissing()}
              disabled={addingMissing || missingToAdd.length === 0}
            >
              {addingMissing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ListPlus className="mr-2 h-4 w-4" />
              )}
              Añadir faltantes
            </Button>
          </div>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => {
                const already = pendingProductIds.has(s.product.id)
                return (
                  <span
                    key={s.product.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-xs"
                  >
                    <span className="font-medium text-foreground">{s.product.name}</span>
                    <span className="text-muted-foreground">
                      {formatQty(s.quantity)} {unitAbbr(s.product.unit)}
                    </span>
                    {already ? (
                      <Badge variant="outline" className="ml-1">
                        en lista
                      </Badge>
                    ) : (
                      <button
                        type="button"
                        className="ml-0.5 text-primary hover:underline"
                        onClick={() => void handleAddSuggestion(s.product, s.quantity)}
                      >
                        añadir
                      </button>
                    )}
                  </span>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Barra de acciones */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid flex-1 gap-3 sm:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar en la lista…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Buscar en la lista"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-44" aria-label="Filtrar por categoría">
              <SelectValue placeholder="Categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las categorías</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Añadir producto
          </Button>
          <Button variant="outline" size="sm" onClick={() => setNewProductOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo producto
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="mr-2 h-4 w-4" />
            Descargar
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" />
            Imprimir / PDF
          </Button>
        </div>
      </div>

      {/* Líneas */}
      {loading ? (
        <Card className="border-dashed border-border/60">
          <CardContent className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando lista…
          </CardContent>
        </Card>
      ) : allLines.length === 0 ? (
        <Card className="border-dashed border-border/60">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            La lista está vacía. Añade faltantes o un producto manualmente.
          </CardContent>
        </Card>
      ) : visibleLines.length === 0 ? (
        <Card className="border-dashed border-border/60">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Ninguna línea coincide con los filtros. La exportación incluye todas las pendientes.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {visibleLines.map(({ item, product }) => {
            const status = product ? productStatus(product) : null
            const isChecked = !!checked[item.id]
            return (
              <Card key={item.id} className="border-border/60 py-0">
                <CardContent className="flex flex-wrap items-center gap-3 p-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 accent-primary"
                    checked={isChecked}
                    onChange={(e) => setChecked((prev) => ({ ...prev, [item.id]: e.target.checked }))}
                    aria-label={`Marcar ${product?.name ?? "producto"} como comprado`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-foreground">
                        {product?.name ?? "(producto archivado)"}
                      </span>
                      {status && (
                        <Badge variant={STATUS_META[status].badge} className="shrink-0">
                          {STATUS_META[status].label}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {product?.category ?? "Sin categoría"} · {product ? unitLabel(product.unit) : ""}
                    </p>
                  </div>

                  {/* Cantidad solicitada */}
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs text-muted-foreground" htmlFor={`req-${item.id}`}>
                      Pedir
                    </label>
                    <Input
                      id={`req-${item.id}`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      defaultValue={String(item.requestedQuantity)}
                      className="h-8 w-20"
                      onBlur={(e) => {
                        const v = parseFloat(e.target.value)
                        if (!Number.isNaN(v) && v > 0 && v !== item.requestedQuantity) {
                          void onUpdateQuantity(item, v)
                        } else {
                          e.target.value = String(item.requestedQuantity)
                        }
                      }}
                    />
                    <span className="text-xs text-muted-foreground">
                      {product ? unitAbbr(product.unit) : ""}
                    </span>
                  </div>

                  {/* Cantidad real (si marcada) */}
                  {isChecked && (
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs text-muted-foreground" htmlFor={`real-${item.id}`}>
                        Real
                      </label>
                      <Input
                        id={`real-${item.id}`}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="any"
                        value={realQty[item.id] ?? String(item.requestedQuantity)}
                        className="h-8 w-20"
                        onChange={(e) => setRealQty((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      />
                    </div>
                  )}

                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => void onRemoveItem(item)}
                    aria-label={`Quitar ${product?.name ?? "producto"}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Confirmar compra */}
      {allLines.length > 0 && (
        <div className="sticky bottom-2 flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/95 p-3 shadow-sm backdrop-blur">
          <p className="text-sm text-muted-foreground">
            {selectedLines.length} de {allLines.length} línea(s) seleccionada(s)
          </p>
          <Button onClick={() => void handleConfirm()} disabled={confirming || selectedLines.length === 0}>
            {confirming ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            Confirmar compra
          </Button>
        </div>
      )}

      {/* Diálogo: añadir producto existente */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Añadir producto a la lista</DialogTitle>
            <DialogDescription>
              Puedes añadir cualquier producto del inventario, aunque tengas suficiente.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Producto</label>
              <Select value={addProductId} onValueChange={setAddProductId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona un producto" />
                </SelectTrigger>
                <SelectContent>
                  {addableProducts.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      Todos los productos ya están en la lista.
                    </div>
                  ) : (
                    addableProducts.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} ({unitLabel(p.unit)})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="add-qty">Cantidad</label>
              <Input
                id="add-qty"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={addQty}
                onChange={(e) => setAddQty(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void handleAddManual()}>Añadir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo: nuevo producto desde la lista (stock 0) */}
      <ProductFormDialog
        open={newProductOpen}
        onOpenChange={setNewProductOpen}
        hideStock
        title="Nuevo producto para la lista"
        description="Se crea con cantidad disponible 0 y se añade a la lista."
        submitLabel="Crear y añadir"
        onSubmit={onCreateProductAndAdd}
      />
    </div>
  )
}

export default ShoppingListTab
