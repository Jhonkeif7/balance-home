import { useEffect, useId, useRef, useState } from "react"
import { Check, ChevronsUpDown, Loader2, Search, UserRound } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { cn } from "@/lib/utils"
import * as familyService from "@/services/family.service"
import type { UserSearchResult } from "@/services/family.service"

interface UserSearchSelectProps {
  value: UserSearchResult | null
  onChange: (user: UserSearchResult | null) => void
  disabled?: boolean
  placeholder?: string
}

export function UserSearchSelect({
  value,
  onChange,
  disabled,
  placeholder = "Buscar por nombre…",
}: UserSearchSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<UserSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])

  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (q.length < 1) return

    let active = true
    const t = window.setTimeout(() => {
      setLoading(true)
      familyService
        .searchUsers(q)
        .then((rows) => {
          if (!active) return
          setResults(rows)
          setError(null)
        })
        .catch((err) => {
          if (!active) return
          console.error(err)
          setError("No se pudo buscar")
          setResults([])
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    }, 280)
    return () => {
      active = false
      window.clearTimeout(t)
    }
  }, [query, open])

  const visibleResults = query.trim().length < 1 ? [] : results
  const visibleError = query.trim().length < 1 ? null : error

  return (
    <div ref={rootRef} className="relative w-full">
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        className="h-10 w-full justify-between font-normal"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex min-w-0 items-center gap-2 truncate">
          <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
          {value?.fullName ? (
            <span className="truncate text-foreground">{value.fullName}</span>
          ) : (
            <span className="truncate text-muted-foreground">{placeholder}</span>
          )}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
      </Button>

      {open && (
        <div
          id={listId}
          className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md"
          role="listbox"
        >
          <div className="relative border-b border-border p-2">
            <Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Escribe un nombre…"
              className="h-9 pl-9"
              aria-label="Buscar usuario"
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {loading && query.trim().length >= 1 && (
              <div className="flex items-center justify-center gap-2 px-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Buscando…
              </div>
            )}
            {!loading && visibleError && (
              <p className="px-2 py-3 text-center text-sm text-destructive">{visibleError}</p>
            )}
            {!loading && !visibleError && query.trim() && visibleResults.length === 0 && (
              <p className="px-2 py-3 text-center text-sm text-muted-foreground">
                No hay usuarios disponibles con ese nombre.
              </p>
            )}
            {!loading &&
              visibleResults.map((u) => {
                const selected = value?.id === u.id
                return (
                  <button
                    key={u.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                      selected && "bg-accent/60"
                    )}
                    onClick={() => {
                      onChange(u)
                      setOpen(false)
                      setQuery("")
                    }}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                      {(u.fullName ?? "?").charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{u.fullName}</span>
                    {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                  </button>
                )
              })}
            {!loading && !query.trim() && (
              <p className="px-2 py-3 text-center text-sm text-muted-foreground">
                Escribe al menos un carácter para buscar.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
