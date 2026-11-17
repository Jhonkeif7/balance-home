import { useMemo, useState } from "react"
import {
  Archive,
  ArchiveRestore,
  Loader2,
  Pencil,
  Plus,
  PackageX,
  Search,
  SlidersHorizontal,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/label"
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
import { ConfirmDeleteDialog } from "@/components/ui/ConfirmDeleteDialog"
import { toast } from "sonner"
import type { Product } from "@/services/shopping.service"
import { ProductFormDialog, type ProductFormValues } from "./ProductFormDialog"
import {
  STATUS_META,
  formatQty,
  productStatus,
  suggestedQuantity,
  unitAbbr,
  unitLabel,
} from "./shopping-utils"

interface InventoryTabProps {
  products: Product[]
  loading: boolean
  onCreate: (values: ProductFormValues) => Promise<void>
  onUpdate: (product: Product, values: ProductFormValues) => Promise<void>
  onAdjust: (product: Product, newQuantity: number) => Promise<void>
  onArchive: (product: Product, archived: boolean) => Promise<void>
  onAddToList: (product: Product, quantity: number) => Promise<void>
}

type StatusFilter = "all" | "ok" | "low" | "out"

function InventoryTab({
  products,
  loading,
  onCreate,
  onUpdate,
  onAdjust,
  onArchive,
  onAddToList,
}: InventoryTabProps) {
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [showArchived, setShowArchived] = useState(false)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)

  const [adjustTarget, setAdjustTarget] = useState<Product | null>(null)
  const [adjustValue, setAdjustValue] = useState("")
  const [adjustSaving, setAdjustSaving] = useState(false)

  const [archiveTarget, setArchiveTarget] = useState<Product | null>(null)
  const [archiving, setArchiving] = useState(false)

  const [markingOutId, setMarkingOutId] = useState<string | null>(null)

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const p of products) if (p.category) set.add(p.category)
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [products])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return products.filter((p) => {
      const isArchived = !!p.archivedAt
      if (showArchived !== isArchived) return false
      if (term && !p.name.toLowerCase().includes(term)) return false
      if (categoryFilter !== "all" && (p.category ?? "") !== categoryFilter) return false
      if (statusFilter !== "all" && productStatus(p) !== statusFilter) return false
      return true
    })
  }, [products, search, categoryFilter, statusFilter, showArchived])

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const openEdit = (product: Product) => {
    setEditing(product)
    setFormOpen(true)
  }

  const openAdjust = (product: Product) => {
    setAdjustTarget(product)
    setAdjustValue(String(product.stock))
  }

  const handleAdjustSave = async () => {
    if (!adjustTarget) return
    const value = parseFloat(adjustValue)
    if (Number.isNaN(value) || value < 0) {
      toast.error("La cantidad no puede ser negativa")
      return
    }
    setAdjustSaving(true)
    try {
      await onAdjust(adjustTarget, value)
      toast.success("Stock actualizado")
      setAdjustTarget(null)
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : "No se pudo ajustar el stock")
    } finally {
      setAdjustSaving(false)
    }
  }

  const handleConfirmArchive = async () => {
    if (!archiveTarget) return
    setArchiving(true)
    const archived = !archiveTarget.archivedAt
    try {
      await onArchive(archiveTarget, archived)
      toast.success(archived ? "Producto archivado" : "Producto restaurado")
      setArchiveTarget(null)
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : "No se pudo archivar el producto")
    } finally {
      setArchiving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Buscar producto"
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
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-full sm:w-40" aria-label="Filtrar por estado">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="ok">Disponible</SelectItem>
              <SelectItem value="low">Por reponer</SelectItem>
              <SelectItem value="out">Agotado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showArchived ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowArchived((v) => !v)}
          >
            <Archive className="mr-2 h-4 w-4" />
            {showArchived ? "Ver activos" : "Ver archivados"}
          </Button>
          {!showArchived && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo producto
            </Button>
          )}
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <Card className="border-dashed border-border/60">
          <CardContent className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando inventario…
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed border-border/60">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {showArchived
              ? "No hay productos archivados."
              : products.some((p) => !p.archivedAt)
                ? "Ningún producto coincide con los filtros."
                : "Aún no hay productos. Crea el primero para empezar tu inventario."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((product) => {
            const status = productStatus(product)
            const meta = STATUS_META[status]
            const suggestion = suggestedQuantity(product)
            return (
              <Card key={product.id} className="group gap-0 border-border/60 py-0">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate font-semibold text-foreground">{product.name}</h3>
                        <Badge variant={meta.badge} className="shrink-0">
                          {meta.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {product.category ?? "Sin categoría"} · {unitLabel(product.unit)}
                      </p>
                    </div>
                    {!product.archivedAt && (
                      <div className="group-hover-actions flex shrink-0 items-center">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openEdit(product)}
                          aria-label={`Editar ${product.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setArchiveTarget(product)}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label={`Archivar ${product.name}`}
                        >
                          <Archive className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/40 p-2 text-center">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Disponible</p>
                      <p className="font-semibold tabular-nums text-foreground">{formatQty(product.stock)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Mínimo</p>
                      <p className="font-semibold tabular-nums text-foreground">{formatQty(product.minimum)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Objetivo</p>
                      <p className="font-semibold tabular-nums text-foreground">{formatQty(product.target)}</p>
                    </div>
                  </div>

                  {suggestion > 0 && !product.archivedAt && (
                    <p className="text-xs text-muted-foreground">
                      Sugerencia: comprar{" "}
                      <span className="font-medium text-foreground">
                        {formatQty(suggestion)} {unitAbbr(product.unit)}
                      </span>
                    </p>
                  )}

                  {product.archivedAt ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => setArchiveTarget(product)}
                    >
                      <ArchiveRestore className="mr-2 h-4 w-4" />
                      Restaurar
                    </Button>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => openAdjust(product)}>
                        <SlidersHorizontal className="mr-2 h-4 w-4" />
                        Ajustar
                      </Button>
                      {product.stock > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-destructive"
                          disabled={markingOutId === product.id}
                          onClick={() => void handleMarkOut(product)}
                        >
                          {markingOutId === product.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <PackageX className="mr-2 h-4 w-4" />
                          )}
                          Agotado
                        </Button>
                      )}
                      {suggestion > 0 && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => void handleAddToList(product, suggestion)}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          A la lista
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Crear / editar */}
      <ProductFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        onSubmit={async (values) => {
          if (editing) await onUpdate(editing, values)
          else await onCreate(values)
        }}
      />

      {/* Ajustar stock */}
      <Dialog open={!!adjustTarget} onOpenChange={(o) => !o && !adjustSaving && setAdjustTarget(null)}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Ajustar stock</DialogTitle>
            <DialogDescription>
              {adjustTarget?.name} · {adjustTarget && unitLabel(adjustTarget.unit)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="adjust-value">Cantidad disponible</Label>
            <Input
              id="adjust-value"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={adjustValue}
              onChange={(e) => setAdjustValue(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustTarget(null)} disabled={adjustSaving}>
              Cancelar
            </Button>
            <Button onClick={() => void handleAdjustSave()} disabled={adjustSaving}>
              {adjustSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar archivar / restaurar */}
      <ConfirmDeleteDialog
        open={!!archiveTarget}
        onOpenChange={(o) => !o && setArchiveTarget(null)}
        title={archiveTarget?.archivedAt ? "Restaurar producto" : "Archivar producto"}
        description={
          archiveTarget?.archivedAt ? (
            <>
              ¿Restaurar <strong>{archiveTarget?.name}</strong> al inventario activo?
            </>
          ) : (
            <>
              ¿Archivar <strong>{archiveTarget?.name}</strong>? Se quitará de la lista de compras
              pendiente, pero se conserva su historial.
            </>
          )
        }
        onConfirm={handleConfirmArchive}
        loading={archiving}
        confirmLabel={archiveTarget?.archivedAt ? "Restaurar" : "Archivar"}
      />
    </div>
  )

  // Helpers que dependen de los handlers del padre pero necesitan estado local.
  async function handleAddToList(product: Product, quantity: number) {
    try {
      await onAddToList(product, quantity)
      toast.success(`${product.name} añadido a la lista`)
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : "No se pudo añadir a la lista")
    }
  }

  async function handleMarkOut(product: Product) {
    setMarkingOutId(product.id)
    try {
      await onAdjust(product, 0)
      toast.success(`${product.name} marcado como agotado`)
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : "No se pudo marcar como agotado")
    } finally {
      setMarkingOutId(null)
    }
  }
}

export default InventoryTab
