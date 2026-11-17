import { useCallback, useEffect, useState } from "react"
import {
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  LogOut,
  Send,
  Users,
  UserPlus,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/lib/auth"
import { PageContainer } from "@/components/ui/PageContainer"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { ConfirmDeleteDialog } from "@/components/ui/ConfirmDeleteDialog"
import { ProfileAvatar } from "@/components/ui/ProfileAvatar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import * as familyService from "@/services/family.service"
import type {
  Family,
  FamilyInvitation,
  FamilyMember,
  UserSearchResult,
} from "@/services/family.service"
import { UserSearchSelect } from "./UserSearchSelect"
import { FamilyChat } from "./FamilyChat"

function MembersList({
  members,
  currentUserId,
}: {
  members: FamilyMember[]
  currentUserId?: string
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {members.map((m) => (
        <div
          key={m.id}
          className="flex items-center gap-3 rounded-lg border border-border/60 p-2.5"
        >
          <ProfileAvatar
            name={m.fullName}
            email={null}
            avatarUrl={m.avatarUrl}
            size="sm"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {m.fullName ?? "Sin nombre"}
              {m.userId === currentUserId ? " (tú)" : ""}
            </p>
            <Badge variant={m.role === "owner" ? "default" : "secondary"} className="mt-0.5">
              {m.role === "owner" ? "Propietario" : "Miembro"}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  )
}

function InvitePanel({
  invitee,
  onInviteeChange,
  inviting,
  onInvite,
  outgoing,
  onCancelInvite,
}: {
  invitee: UserSearchResult | null
  onInviteeChange: (v: UserSearchResult | null) => void
  inviting: boolean
  onInvite: () => void
  outgoing: FamilyInvitation[]
  onCancelInvite: (id: string) => void
}) {
  return (
    <div className="space-y-3">
      <UserSearchSelect value={invitee} onChange={onInviteeChange} disabled={inviting} />
      <Button
        className="w-full"
        disabled={!invitee || inviting}
        onClick={onInvite}
      >
        {inviting ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Send className="mr-2 h-4 w-4" />
        )}
        Enviar invitación
      </Button>

      {outgoing.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pendientes
          </p>
          {outgoing.map((inv) => (
            <div
              key={inv.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2.5 py-2"
            >
              <span className="truncate text-sm">
                {inv.inviteeName ?? "Usuario"}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => onCancelInvite(inv.id)}
              >
                Cancelar
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FamilyPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [family, setFamily] = useState<Family | null>(null)
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [outgoing, setOutgoing] = useState<FamilyInvitation[]>([])
  const [incoming, setIncoming] = useState<FamilyInvitation[]>([])

  const [createName, setCreateName] = useState("")
  const [creating, setCreating] = useState(false)

  const [invitee, setInvitee] = useState<UserSearchResult | null>(null)
  const [inviting, setInviting] = useState(false)

  const [leaveOpen, setLeaveOpen] = useState(false)
  const [leaving, setLeaving] = useState(false)

  const [familyModalOpen, setFamilyModalOpen] = useState(false)
  const [inviteExpanded, setInviteExpanded] = useState(false)

  const myMembership = members.find((m) => m.userId === user?.id)
  const isOwner = myMembership?.role === "owner"

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [fam, incomingInv] = await Promise.all([
        familyService.getMyFamily(),
        familyService.getIncomingPendingInvitations(),
      ])
      setFamily(fam)
      setIncoming(incomingInv)
      if (fam) {
        const [mems, out] = await Promise.all([
          familyService.getMembers(fam.id),
          familyService.getOutgoingPendingInvitations(fam.id),
        ])
        setMembers(mems)
        setOutgoing(out)
      } else {
        setMembers([])
        setOutgoing([])
      }
    } catch (err) {
      console.error(err)
      toast.error("No se pudieron cargar los datos de familia")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = createName.trim()
    if (!name || creating) return
    setCreating(true)
    try {
      await familyService.createFamily(name)
      toast.success("Familia creada")
      setCreateName("")
      await load()
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : "No se pudo crear la familia")
    } finally {
      setCreating(false)
    }
  }

  const handleInvite = async () => {
    if (!invitee || inviting) return
    setInviting(true)
    try {
      await familyService.inviteUser(invitee.id)
      toast.success(`Invitación enviada a ${invitee.fullName ?? "el usuario"}`)
      setInvitee(null)
      await load()
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : "No se pudo enviar la invitación")
    } finally {
      setInviting(false)
    }
  }

  const handleCancelInvite = async (id: string) => {
    try {
      await familyService.cancelInvitation(id)
      toast.success("Invitación cancelada")
      await load()
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : "No se pudo cancelar")
    }
  }

  const handleRespond = async (id: string, accept: boolean) => {
    try {
      await familyService.respondInvitation(id, accept)
      toast.success(accept ? "Te uniste a la familia" : "Invitación rechazada")
      await load()
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : "No se pudo responder la invitación")
    }
  }

  const handleLeave = async () => {
    setLeaving(true)
    try {
      await familyService.leaveFamily()
      toast.success("Saliste de la familia")
      setLeaveOpen(false)
      setFamilyModalOpen(false)
      await load()
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : "No se pudo salir de la familia")
    } finally {
      setLeaving(false)
    }
  }

  if (loading) {
    return (
      <PageContainer>
        <Card className="border-dashed border-border/60">
          <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando familia…
          </CardContent>
        </Card>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <div className="space-y-4">
        {/* Invitaciones recibidas */}
        {incoming.length > 0 && (
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-base">Invitaciones recibidas</CardTitle>
              <CardDescription>
                {family
                  ? "Para aceptar debes salir primero de tu familia actual."
                  : "Acepta para unirte a una familia."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {incoming.map((inv) => (
                <div
                  key={inv.id}
                  className="flex flex-col gap-2 rounded-lg border border-border/60 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {inv.familyName ?? "Familia"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Invitado por {inv.invitedByName ?? "un miembro"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 sm:flex-none"
                      disabled={!!family}
                      onClick={() => void handleRespond(inv.id, false)}
                    >
                      <X className="mr-1.5 h-4 w-4" />
                      Rechazar
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 sm:flex-none"
                      disabled={!!family}
                      onClick={() => void handleRespond(inv.id, true)}
                    >
                      <Check className="mr-1.5 h-4 w-4" />
                      Aceptar
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {!family ? (
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-5 w-5 text-primary" />
                Crear familia
              </CardTitle>
              <CardDescription>
                Solo puedes pertenecer a una familia a la vez. Al crearla serás el propietario.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => void handleCreate(e)} className="flex flex-col gap-3 sm:flex-row">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="family-name">Nombre de la familia</Label>
                  <Input
                    id="family-name"
                    placeholder="Ej. Familia Rodríguez"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    disabled={creating}
                    maxLength={80}
                  />
                </div>
                <Button
                  type="submit"
                  className="h-10 sm:mt-7 sm:self-start"
                  disabled={creating || !createName.trim()}
                >
                  {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Crear familia
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* —— Móvil: familia colapsada + invitar expandible —— */}
            <div className="space-y-3 md:hidden">
              <button
                type="button"
                onClick={() => setFamilyModalOpen(true)}
                className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-card p-3.5 text-left transition-colors hover:bg-muted/40 active:bg-muted/60"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Users className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-foreground">{family.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {members.length} miembro{members.length === 1 ? "" : "s"}
                    {isOwner ? " · Propietario" : ""}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              </button>

              <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
                <button
                  type="button"
                  onClick={() => setInviteExpanded((v) => !v)}
                  className="flex w-full items-center gap-3 p-3.5 text-left transition-colors hover:bg-muted/40"
                  aria-expanded={inviteExpanded}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <UserPlus className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground">Invitar miembro</p>
                    <p className="text-xs text-muted-foreground">
                      {outgoing.length > 0
                        ? `${outgoing.length} pendiente${outgoing.length === 1 ? "" : "s"}`
                        : "Buscar e invitar por nombre"}
                    </p>
                  </div>
                  <ChevronDown
                    className={cn(
                      "h-5 w-5 shrink-0 text-muted-foreground transition-transform",
                      inviteExpanded && "rotate-180"
                    )}
                  />
                </button>
                {inviteExpanded && (
                  <div className="border-t border-border/60 px-3.5 pb-3.5 pt-3">
                    <InvitePanel
                      invitee={invitee}
                      onInviteeChange={setInvitee}
                      inviting={inviting}
                      onInvite={() => void handleInvite()}
                      outgoing={outgoing}
                      onCancelInvite={(id) => void handleCancelInvite(id)}
                    />
                  </div>
                )}
              </div>

              {user?.id && <FamilyChat familyId={family.id} currentUserId={user.id} />}
            </div>

            {/* —— Escritorio: layout completo —— */}
            <div className="hidden space-y-4 md:block">
              <Card className="border-border/60">
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle className="text-base sm:text-lg">{family.name}</CardTitle>
                      <CardDescription>
                        {members.length} miembro{members.length === 1 ? "" : "s"}
                        {isOwner ? " · Eres el propietario" : ""}
                      </CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setLeaveOpen(true)}
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Salir de la familia
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Miembros</h3>
                  <MembersList members={members} currentUserId={user?.id} />
                </CardContent>
              </Card>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="border-border/60">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <UserPlus className="h-5 w-5 text-primary" />
                      Invitar miembro
                    </CardTitle>
                    <CardDescription>
                      Busca por nombre de usuario. Solo aparecen personas sin familia.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <InvitePanel
                      invitee={invitee}
                      onInviteeChange={setInvitee}
                      inviting={inviting}
                      onInvite={() => void handleInvite()}
                      outgoing={outgoing}
                      onCancelInvite={(id) => void handleCancelInvite(id)}
                    />
                  </CardContent>
                </Card>

                {user?.id && <FamilyChat familyId={family.id} currentUserId={user.id} />}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modal móvil: detalle de familia */}
      <Dialog open={familyModalOpen} onOpenChange={setFamilyModalOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{family?.name ?? "Familia"}</DialogTitle>
            <DialogDescription>
              {members.length} miembro{members.length === 1 ? "" : "s"}
              {isOwner ? " · Eres el propietario" : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Miembros</h3>
              <MembersList members={members} currentUserId={user?.id} />
            </div>
            <Button
              variant="outline"
              className="w-full text-destructive hover:text-destructive"
              onClick={() => {
                setFamilyModalOpen(false)
                setLeaveOpen(true)
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Salir de la familia
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        title="Salir de la familia"
        description={
          <>
            ¿Salir de <strong>{family?.name}</strong>? Podrás crear o unirte a otra familia
            después. Si eres el único miembro, la familia se eliminará.
          </>
        }
        onConfirm={handleLeave}
        loading={leaving}
        confirmLabel="Salir"
        confirmIcon={LogOut}
        confirmVariant="destructive"
      />
    </PageContainer>
  )
}

export default FamilyPage
