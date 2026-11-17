import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/label"
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
import type { Product } from "@/services/shopping.service"
import { UNITS, unitLabel } from "./shopping-utils"

export interface ProductFormValues {
  name: string
  category: string
  unit: string
  minimum: number
  target: number
  stock: number
}

interface ProductFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Si se pasa, el diálogo edita; si no, crea. */
  editing?: Product | null
  /** Oculta el campo de stock inicial (p. ej. al crear desde la lista con 0). */
  hideStock?: boolean
  title?: string
  description?: string
  submitLabel?: string
  onSubmit: (values: ProductFormValues) => Promise<void>
}

interface FormState {
  name: string
  category: string
  unit: string
  minimum: string
  target: string
  stock: string
}

const emptyForm: FormState = {
  name: "",
  category: "",
  unit: "unidad",
  minimum: "0",
  target: "1",
  stock: "0",
}

export function ProductFormDialog({
  open,
  onOpenChange,
  editing,
  hideStock = false,
  title,
  description,
  submitLabel,
  onSubmit,
}: ProductFormDialogProps) {
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editing) {
      setForm({
        name: editing.name,
        category: editing.category ?? "",
        unit: editing.unit,
        minimum: String(editing.minimum),
        target: String(editing.target),
        stock: String(editing.stock),
      })
    } else {
      setForm(emptyForm)
    }
  }, [open, editing])

  const handleSubmit = async () => {
    const name = form.name.trim()
    const minimum = parseFloat(form.minimum)
    const target = parseFloat(form.target)
    const stock = parseFloat(form.stock)

    if (!name) {
      toast.error("El nombre es obligatorio")
      return
    }
    if (Number.isNaN(minimum) || minimum < 0) {
      toast.error("El mínimo debe ser cero o positivo")
      return
    }
    if (Number.isNaN(target) || target <= minimum) {
      toast.error("El objetivo debe ser mayor que el mínimo")
      return
    }
    if (!hideStock && (Number.isNaN(stock) || stock < 0)) {
      toast.error("El stock no puede ser negativo")
      return
    }

    setSaving(true)
    try {
      await onSubmit({
        name,
        category: form.category.trim(),
        unit: form.unit,
        minimum,
        target,
        stock: hideStock ? 0 : stock,
      })
      onOpenChange(false)
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : "No se pudo guardar el producto")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{title ?? (editing ? "Editar producto" : "Nuevo producto")}</DialogTitle>
          <DialogDescription>
            {description ?? "Define el mínimo y el objetivo para calcular las sugerencias de reposición."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="product-name">Nombre</Label>
            <Input
              id="product-name"
              placeholder="Ej. Arroz"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoComplete="off"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="product-category">Categoría (opcional)</Label>
              <Input
                id="product-category"
                placeholder="Ej. Despensa"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-unit">Unidad</Label>
              <Select value={form.unit} onValueChange={(value) => setForm({ ...form, unit: value })}>
                <SelectTrigger id="product-unit" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {unitLabel(u)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className={hideStock ? "grid gap-4 sm:grid-cols-2" : "grid gap-4 sm:grid-cols-3"}>
            <div className="space-y-2">
              <Label htmlFor="product-min">Mínimo</Label>
              <Input
                id="product-min"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={form.minimum}
                onChange={(e) => setForm({ ...form, minimum: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-target">Objetivo</Label>
              <Input
                id="product-target"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={form.target}
                onChange={(e) => setForm({ ...form, target: e.target.value })}
              />
            </div>
            {!hideStock && (
              <div className="space-y-2">
                <Label htmlFor="product-stock">Disponible</Label>
                <Input
                  id="product-stock"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={form.stock}
                  onChange={(e) => setForm({ ...form, stock: e.target.value })}
                  disabled={!!editing}
                />
              </div>
            )}
          </div>
          {editing && (
            <p className="text-xs text-muted-foreground">
              El stock disponible se ajusta desde el inventario o al confirmar compras, no aquí.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitLabel ?? (editing ? "Guardar cambios" : "Crear producto")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
