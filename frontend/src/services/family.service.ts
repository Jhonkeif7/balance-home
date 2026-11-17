import { supabase } from "@/lib/supabase"

/**
 * Servicio de Familia.
 *
 * Tablas: families, family_members, family_invitations, family_messages.
 * RPC: family_create, family_leave, family_invite, family_cancel_invitation,
 *      family_respond_invitation, family_send_message, family_search_users.
 */

export type FamilyRole = "owner" | "member"
export type InvitationStatus = "pending" | "accepted" | "declined" | "cancelled"

export interface Family {
  id: string
  name: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface FamilyMember {
  id: string
  familyId: string
  userId: string
  role: FamilyRole
  joinedAt: string
  fullName: string | null
  avatarUrl: string | null
}

export interface FamilyInvitation {
  id: string
  familyId: string
  familyName?: string
  invitedBy: string
  invitedByName?: string | null
  inviteeUserId: string
  inviteeName?: string | null
  status: InvitationStatus
  createdAt: string
  respondedAt: string | null
}

export interface FamilyMessage {
  id: string
  familyId: string
  senderId: string
  senderName: string | null
  senderAvatar: string | null
  body: string
  createdAt: string
}

export interface UserSearchResult {
  id: string
  fullName: string | null
  avatarUrl: string | null
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const mapFamily = (r: any): Family => ({
  id: r.id,
  name: r.name,
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Familia actual del usuario (si pertenece a alguna). */
export async function getMyFamily(): Promise<Family | null> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) throw authError
  if (!user) return null

  // Filtrar por user_id: la RLS de family_members también deja ver al resto
  // de la familia, y maybeSingle() fallaría con 2+ miembros.
  const { data: membership, error: e1 } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id)
    .maybeSingle()
  if (e1) throw e1
  if (!membership) return null

  const { data, error } = await supabase
    .from("families")
    .select("id, name, created_by, created_at, updated_at")
    .eq("id", membership.family_id)
    .maybeSingle()
  if (error) throw error
  return data ? mapFamily(data) : null
}

export async function getMembers(familyId: string): Promise<FamilyMember[]> {
  const { data, error } = await supabase.rpc("family_list_members", {
    p_family_id: familyId,
  })
  if (error) throw error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id,
    familyId: r.family_id,
    userId: r.user_id,
    role: r.role as FamilyRole,
    joinedAt: r.joined_at,
    fullName: r.full_name ?? null,
    avatarUrl: r.avatar_url ?? null,
  }))
}

export async function createFamily(name: string): Promise<Family> {
  const { data, error } = await supabase.rpc("family_create", { p_name: name })
  if (error) throw error
  return mapFamily(data)
}

export async function leaveFamily(): Promise<void> {
  const { error } = await supabase.rpc("family_leave")
  if (error) throw error
}

export async function inviteUser(inviteeUserId: string): Promise<FamilyInvitation> {
  const { data, error } = await supabase.rpc("family_invite", {
    p_invitee_user_id: inviteeUserId,
  })
  if (error) throw error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r: any = data
  return {
    id: r.id,
    familyId: r.family_id,
    invitedBy: r.invited_by,
    inviteeUserId: r.invitee_user_id,
    status: r.status,
    createdAt: r.created_at,
    respondedAt: r.responded_at ?? null,
  }
}

export async function cancelInvitation(invitationId: string): Promise<void> {
  const { error } = await supabase.rpc("family_cancel_invitation", {
    p_invitation_id: invitationId,
  })
  if (error) throw error
}

export async function respondInvitation(
  invitationId: string,
  accept: boolean
): Promise<FamilyInvitation> {
  const { data, error } = await supabase.rpc("family_respond_invitation", {
    p_invitation_id: invitationId,
    p_accept: accept,
  })
  if (error) throw error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r: any = data
  return {
    id: r.id,
    familyId: r.family_id,
    invitedBy: r.invited_by,
    inviteeUserId: r.invitee_user_id,
    status: r.status,
    createdAt: r.created_at,
    respondedAt: r.responded_at ?? null,
  }
}

/** Invitaciones pendientes enviadas por mi familia. */
export async function getOutgoingPendingInvitations(
  familyId: string
): Promise<FamilyInvitation[]> {
  const { data, error } = await supabase.rpc("family_list_outgoing_invites", {
    p_family_id: familyId,
  })
  if (error) throw error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id,
    familyId: r.family_id,
    invitedBy: r.invited_by,
    inviteeUserId: r.invitee_user_id,
    inviteeName: r.invitee_name ?? null,
    status: r.status as InvitationStatus,
    createdAt: r.created_at,
    respondedAt: r.responded_at ?? null,
  }))
}

/** Invitaciones pendientes recibidas por mí. */
export async function getIncomingPendingInvitations(): Promise<FamilyInvitation[]> {
  const { data, error } = await supabase.rpc("family_list_incoming_invites")
  if (error) throw error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id,
    familyId: r.family_id,
    familyName: r.family_name,
    invitedBy: r.invited_by,
    invitedByName: r.invited_by_name ?? null,
    inviteeUserId: r.invitee_user_id,
    status: r.status as InvitationStatus,
    createdAt: r.created_at,
    respondedAt: r.responded_at ?? null,
  }))
}

export async function searchUsers(query: string): Promise<UserSearchResult[]> {
  const { data, error } = await supabase.rpc("family_search_users", {
    p_query: query,
    p_limit: 12,
  })
  if (error) throw error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id,
    fullName: r.full_name ?? null,
    avatarUrl: r.avatar_url ?? null,
  }))
}

/** Nombres/avatars vía RPC (profiles suele estar bloqueado por RLS entre usuarios). */
async function memberProfilesByFamily(
  familyId: string
): Promise<Map<string, { full_name: string | null; avatar_url: string | null }>> {
  const members = await getMembers(familyId)
  const map = new Map<string, { full_name: string | null; avatar_url: string | null }>()
  for (const m of members) {
    map.set(m.userId, { full_name: m.fullName, avatar_url: m.avatarUrl })
  }
  return map
}

export async function getMessages(familyId: string, limit = 100): Promise<FamilyMessage[]> {
  const { data, error } = await supabase
    .from("family_messages")
    .select("id, family_id, sender_id, body, created_at")
    .eq("family_id", familyId)
    .order("created_at", { ascending: true })
    .limit(limit)
  if (error) throw error
  const rows = data ?? []
  const profiles = await memberProfilesByFamily(familyId)
  return rows.map((r) => {
    const p = profiles.get(r.sender_id)
    return {
      id: r.id,
      familyId: r.family_id,
      senderId: r.sender_id,
      senderName: p?.full_name ?? null,
      senderAvatar: p?.avatar_url ?? null,
      body: r.body,
      createdAt: r.created_at,
    }
  })
}

export async function sendMessage(body: string): Promise<FamilyMessage> {
  const { data, error } = await supabase.rpc("family_send_message", { p_body: body })
  if (error) throw error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r: any = data
  const profiles = await memberProfilesByFamily(r.family_id)
  const p = profiles.get(r.sender_id)
  return {
    id: r.id,
    familyId: r.family_id,
    senderId: r.sender_id,
    senderName: p?.full_name ?? null,
    senderAvatar: p?.avatar_url ?? null,
    body: r.body,
    createdAt: r.created_at,
  }
}

/** Suscripción realtime a nuevos mensajes de la familia. */
export function subscribeToMessages(
  familyId: string,
  onInsert: (msg: FamilyMessage) => void
) {
  const channel = supabase
    .channel(`family-chat-${familyId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "family_messages",
        filter: `family_id=eq.${familyId}`,
      },
      async (payload) => {
        const row = payload.new as {
          id: string
          family_id: string
          sender_id: string
          body: string
          created_at: string
        }
        let senderName: string | null = null
        let senderAvatar: string | null = null
        try {
          const profiles = await memberProfilesByFamily(familyId)
          const p = profiles.get(row.sender_id)
          senderName = p?.full_name ?? null
          senderAvatar = p?.avatar_url ?? null
        } catch (err) {
          console.error(err)
        }
        onInsert({
          id: row.id,
          familyId: row.family_id,
          senderId: row.sender_id,
          senderName,
          senderAvatar,
          body: row.body,
          createdAt: row.created_at,
        })
      }
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}
