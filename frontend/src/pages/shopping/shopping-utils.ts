import type { Product, ProductStatus, Unit } from "@/services/shopping.service"

// --- Unidades ---------------------------------------------------------------

export const UNITS: Unit[] = [
  "unidad",
  "paquete",
  "libra",
  "kilogramo",
  "litro",
  "mililitro",
]

export const UNIT_LABELS: Record<string, { singular: string; abbr: string }> = {
  unidad: { singular: "Unidad", abbr: "u" },
  paquete: { singular: "Paquete", abbr: "paq" },
  libra: { singular: "Libra", abbr: "lb" },
  kilogramo: { singular: "Kilogramo", abbr: "kg" },
  litro: { singular: "Litro", abbr: "L" },
  mililitro: { singular: "Mililitro", abbr: "ml" },
}

export function unitLabel(unit: string): string {
  return UNIT_LABELS[unit]?.singular ?? unit
}

export function unitAbbr(unit: string): string {
  return UNIT_LABELS[unit]?.abbr ?? unit
}

/** Formatea una cantidad admitiendo decimales (hasta 3) sin ceros sobrantes. */
export function formatQty(qty: number): string {
  if (!Number.isFinite(qty)) return "0"
  return Number(qty.toFixed(3)).toLocaleString("es", { maximumFractionDigits: 3 })
}

export function formatQtyWithUnit(qty: number, unit: string): string {
  return `${formatQty(qty)} ${unitAbbr(unit)}`
}

// --- Estado del producto ----------------------------------------------------

/**
 * Estado derivado de la cantidad:
 *  - "out" (Agotado): stock = 0
 *  - "low" (Por reponer): stock > 0 y stock <= mínimo
 *  - "ok" (Disponible): stock > mínimo
 */
export function productStatus(product: Pick<Product, "stock" | "minimum">): ProductStatus {
  if (product.stock <= 0) return "out"
  if (product.stock <= product.minimum) return "low"
  return "ok"
}

export const STATUS_META: Record<
  ProductStatus,
  { label: string; badge: "destructive" | "secondary" | "success" }
> = {
  out: { label: "Agotado", badge: "destructive" },
  low: { label: "Por reponer", badge: "secondary" },
  ok: { label: "Disponible", badge: "success" },
}

/**
 * Cantidad sugerida a comprar cuando el producto está agotado o por reponer:
 *   max(objetivo - disponible, 0). En estado disponible no se sugiere nada (0).
 */
export function suggestedQuantity(product: Pick<Product, "stock" | "minimum" | "target">): number {
  const status = productStatus(product)
  if (status === "ok") return 0
  return Math.max(product.target - product.stock, 0)
}

// --- CSV --------------------------------------------------------------------

/**
 * Neutraliza fórmulas: si un campo de texto empieza por = + - @ (o tab/CR),
 * se antepone un apóstrofo para que las hojas de cálculo no lo interpreten.
 */
function neutralizeFormula(value: string): string {
  if (value.length > 0 && /^[=+\-@\t\r]/.test(value)) {
    return `'${value}`
  }
  return value
}

/** Escapa un campo CSV: comillas dobladas y entrecomillado si hay separadores. */
function csvField(value: string, { isText }: { isText: boolean }): string {
  let v = value ?? ""
  if (isText) v = neutralizeFormula(v)
  if (/[",\r\n]/.test(v)) {
    v = `"${v.replace(/"/g, '""')}"`
  }
  return v
}

export interface CsvRow {
  name: string
  quantity: number
  unit: string
  category: string | null
}

/**
 * Genera un CSV UTF-8 (con BOM) con columnas: producto, cantidad, unidad,
 * categoría. Pensado para exportar TODAS las líneas pendientes.
 */
export function buildShoppingCsv(rows: CsvRow[]): string {
  const header = ["Producto", "Cantidad", "Unidad", "Categoría"]
  const lines = [header.map((h) => csvField(h, { isText: true })).join(",")]
  for (const r of rows) {
    lines.push(
      [
        csvField(r.name, { isText: true }),
        csvField(formatQty(r.quantity), { isText: false }),
        csvField(unitLabel(r.unit), { isText: true }),
        csvField(r.category ?? "", { isText: true }),
      ].join(",")
    )
  }
  // CRLF: compatible con Excel y con el estándar CSV.
  return "\uFEFF" + lines.join("\r\n")
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// --- Vista imprimible (guardar como PDF desde el navegador) -----------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/**
 * Abre una ventana con una tabla imprimible y lanza el diálogo de impresión,
 * desde donde el usuario puede «Guardar como PDF». Devuelve false si el
 * navegador bloqueó la ventana emergente.
 */
export function printShoppingList(rows: CsvRow[]): boolean {
  const win = window.open("", "_blank", "noopener,noreferrer,width=800,height=900")
  if (!win) return false

  const body = rows
    .map(
      (r) => `
        <tr>
          <td>${escapeHtml(r.name)}</td>
          <td class="num">${escapeHtml(formatQty(r.quantity))} ${escapeHtml(unitAbbr(r.unit))}</td>
          <td>${escapeHtml(r.category ?? "—")}</td>
        </tr>`
    )
    .join("")

  const today = new Date().toLocaleDateString("es")
  win.document.write(`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Lista de compras — Balance Home</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, sans-serif; color: #081A33; margin: 32px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p.meta { color: #4a5d78; margin: 0 0 20px; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #dce3ec; }
  th { background: #F5F7FA; color: #081A33; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  tfoot td { font-weight: 600; }
  @media print { body { margin: 12mm; } }
</style>
</head>
<body>
  <h1>Lista de compras — Balance Home</h1>
  <p class="meta">Generada el ${escapeHtml(today)} · ${rows.length} producto(s)</p>
  <table>
    <thead>
      <tr><th>Producto</th><th class="num">Cantidad</th><th>Categoría</th></tr>
    </thead>
    <tbody>${body || '<tr><td colspan="3">Sin productos pendientes.</td></tr>'}</tbody>
  </table>
  <script>
    window.onload = function () { window.focus(); window.print(); };
  </script>
</body>
</html>`)
  win.document.close()
  return true
}
