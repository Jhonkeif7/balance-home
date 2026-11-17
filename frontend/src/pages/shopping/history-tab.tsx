import { Loader2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/Card"
import { Badge } from "@/components/ui/badge"
import type { MovementReason, StockMovement } from "@/services/shopping.service"
import { formatQty, unitAbbr } from "./shopping-utils"

interface HistoryTabProps {
  movements: StockMovement[]
  loading: boolean
}

const REASON_META: Record<MovementReason, { label: string; badge: "secondary" | "success" | "outline" }> = {
  initial: { label: "Stock inicial", badge: "outline" },
  adjustment: { label: "Ajuste", badge: "secondary" },
  purchase: { label: "Compra", badge: "success" },
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString("es", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function HistoryTab({ movements, loading }: HistoryTabProps) {
  if (loading) {
    return (
      <Card className="border-dashed border-border/60">
        <CardContent className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando historial…
        </CardContent>
      </Card>
    )
  }

  if (movements.length === 0) {
    return (
      <Card className="border-dashed border-border/60">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Aún no hay movimientos de stock.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-2">
      {movements.map((m) => {
        const meta = REASON_META[m.reason]
        const positive = m.quantityDelta > 0
        return (
          <Card key={m.id} className="border-border/60 py-0">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-foreground">{m.productName}</span>
                  <Badge variant={meta.badge} className="shrink-0">
                    {meta.label}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{formatDate(m.createdAt)}</p>
              </div>
              <div className="text-right">
                <p
                  className={`font-semibold tabular-nums ${positive ? "text-success" : m.quantityDelta < 0 ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {positive ? "+" : ""}
                  {formatQty(m.quantityDelta)} {unitAbbr(m.productUnit)}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatQty(m.stockBefore)} → {formatQty(m.stockAfter)}
                </p>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

export default HistoryTab
