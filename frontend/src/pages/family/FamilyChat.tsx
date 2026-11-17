import { useEffect, useRef, useState } from "react"
import { Loader2, Send } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import * as familyService from "@/services/family.service"
import type { FamilyMessage } from "@/services/family.service"

interface FamilyChatProps {
  familyId: string
  currentUserId: string
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("es", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function FamilyChat({ familyId, currentUserId }: FamilyChatProps) {
  const [messages, setMessages] = useState<FamilyMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    familyService
      .getMessages(familyId)
      .then((rows) => {
        if (active) setMessages(rows)
      })
      .catch((err) => {
        console.error(err)
        if (active) toast.error("No se pudo cargar el chat")
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    const unsubscribe = familyService.subscribeToMessages(familyId, (msg) => {
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [familyId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    try {
      const msg = await familyService.sendMessage(body)
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
      setText("")
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : "No se pudo enviar el mensaje")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-[min(28rem,60vh)] flex-col overflow-hidden rounded-xl border border-border/60 bg-card">
      <div className="border-b border-border/60 px-3 py-2">
        <h3 className="text-sm font-semibold text-foreground">Chat familiar</h3>
        <p className="text-xs text-muted-foreground">Mensajes en tiempo real con tu familia</p>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando mensajes…
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
            Aún no hay mensajes. Sé el primero en saludar.
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.senderId === currentUserId
            return (
              <div
                key={m.id}
                className={cn("flex flex-col gap-0.5", mine ? "items-end" : "items-start")}
              >
                {!mine && (
                  <span className="px-1 text-[11px] font-medium text-muted-foreground">
                    {m.senderName ?? "Miembro"}
                  </span>
                )}
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                    mine
                      ? "rounded-br-md bg-primary text-primary-foreground"
                      : "rounded-bl-md bg-muted text-foreground"
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                </div>
                <span className="px-1 text-[10px] text-muted-foreground">
                  {formatTime(m.createdAt)}
                </span>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => void handleSend(e)}
        className="flex items-center gap-2 border-t border-border/60 p-2"
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escribe un mensaje…"
          disabled={sending}
          className="h-10"
          maxLength={2000}
          aria-label="Mensaje"
        />
        <Button
          type="submit"
          size="icon"
          className="h-10 w-10 shrink-0"
          disabled={sending || !text.trim()}
          aria-label="Enviar mensaje"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  )
}
