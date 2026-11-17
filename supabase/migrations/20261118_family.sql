-- =============================================================================
-- Balance Home — Módulo «Familia»
-- Familias, miembros, invitaciones y chat grupal.
--
-- Reglas de negocio:
--  * Un usuario solo puede pertenecer a UNA familia (índice único en user_id).
--  * Si ya es miembro, no puede crear otra ni aceptar otra invitación sin salir antes.
--  * Puede salir o aceptar una nueva (la aceptación implica salir de la anterior
--    solo si no es miembro; si ya es miembro, debe salir primero).
--  * Al aceptar, se crea la membresía y se cancelan otras invitaciones pendientes
--    del mismo usuario.
--
-- Orden: aplicar DESPUÉS de 20261116_household_shopping.sql
-- (independiente del módulo de compras; el nombre 20261117_family es intencional).
-- Si ya aplicaste 20261117_household_product_delete.sql, este archivo puede
-- renombrarse a 20261118_family.sql al aplicarlo; el contenido es el mismo.
-- =============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Tablas
-- ----------------------------------------------------------------------------
create table if not exists public.families (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid not null references auth.users (id) on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint families_name_not_empty check (length(btrim(name)) > 0)
);

create index if not exists idx_families_created_by on public.families (created_by);

create table if not exists public.family_members (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null default 'member',
  joined_at   timestamptz not null default now(),
  constraint family_members_role_valid check (role in ('owner', 'member')),
  constraint family_members_family_user_unique unique (family_id, user_id),
  -- Un usuario solo puede estar en una familia a la vez.
  constraint family_members_user_unique unique (user_id)
);

create index if not exists idx_family_members_family on public.family_members (family_id);

create table if not exists public.family_invitations (
  id               uuid primary key default gen_random_uuid(),
  family_id        uuid not null references public.families (id) on delete cascade,
  invited_by       uuid not null references auth.users (id) on delete cascade,
  invitee_user_id  uuid not null references auth.users (id) on delete cascade,
  status           text not null default 'pending',
  created_at       timestamptz not null default now(),
  responded_at     timestamptz,
  constraint family_invitations_status_valid
    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  constraint family_invitations_not_self check (invited_by <> invitee_user_id)
);

-- Solo una invitación pendiente por familia + destinatario.
create unique index if not exists uq_family_invitations_pending
  on public.family_invitations (family_id, invitee_user_id)
  where status = 'pending';

create index if not exists idx_family_invitations_invitee
  on public.family_invitations (invitee_user_id, status);

create table if not exists public.family_messages (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families (id) on delete cascade,
  sender_id   uuid not null references auth.users (id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now(),
  constraint family_messages_body_not_empty check (length(btrim(body)) > 0)
);

create index if not exists idx_family_messages_family_created
  on public.family_messages (family_id, created_at);

-- updated_at en families
create or replace function public.family_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_families_updated_at on public.families;
create trigger trg_families_updated_at
  before update on public.families
  for each row execute function public.family_touch_updated_at();

-- ----------------------------------------------------------------------------
-- Helpers de membresía (SECURITY DEFINER, search_path fijo)
-- ----------------------------------------------------------------------------
create or replace function public.is_family_member(p_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.family_members m
    where m.family_id = p_family_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.current_family_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.family_id
  from public.family_members m
  where m.user_id = auth.uid()
  limit 1;
$$;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.family_invitations enable row level security;
alter table public.family_messages enable row level security;

-- families: miembros ven su familia; invitados pendientes pueden ver el nombre
drop policy if exists families_select on public.families;
create policy families_select on public.families
  for select using (
    public.is_family_member(id)
    or exists (
      select 1 from public.family_invitations i
      where i.family_id = families.id
        and i.invitee_user_id = auth.uid()
        and i.status = 'pending'
    )
  );

-- members: miembros ven a los de su familia; cada uno se ve a sí mismo
drop policy if exists family_members_select on public.family_members;
create policy family_members_select on public.family_members
  for select using (
    user_id = auth.uid()
    or public.is_family_member(family_id)
  );

-- invitations: destinatario, quien invita, o miembros de la familia
drop policy if exists family_invitations_select on public.family_invitations;
create policy family_invitations_select on public.family_invitations
  for select using (
    invitee_user_id = auth.uid()
    or invited_by = auth.uid()
    or public.is_family_member(family_id)
  );

-- messages: solo miembros
drop policy if exists family_messages_select on public.family_messages;
create policy family_messages_select on public.family_messages
  for select using (public.is_family_member(family_id));

-- Sin INSERT/UPDATE/DELETE directos en tablas sensibles: pasan por RPC.
-- (messages insert vía RPC también).

-- ----------------------------------------------------------------------------
-- RPC: crear familia
-- ----------------------------------------------------------------------------
create or replace function public.family_create(p_name text)
returns public.families
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_family public.families;
begin
  if v_user is null then
    raise exception 'No autenticado';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'El nombre de la familia es obligatorio';
  end if;
  if exists (select 1 from public.family_members where user_id = v_user) then
    raise exception 'Ya perteneces a una familia. Debes salir antes de crear otra.';
  end if;

  insert into public.families (name, created_by)
  values (btrim(p_name), v_user)
  returning * into v_family;

  insert into public.family_members (family_id, user_id, role)
  values (v_family.id, v_user, 'owner');

  -- Cancela invitaciones pendientes hacia este usuario.
  update public.family_invitations
    set status = 'cancelled', responded_at = now()
    where invitee_user_id = v_user and status = 'pending';

  return v_family;
end;
$$;

-- ----------------------------------------------------------------------------
-- RPC: salir de la familia
-- ----------------------------------------------------------------------------
create or replace function public.family_leave()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_member public.family_members;
  v_owners int;
begin
  if v_user is null then
    raise exception 'No autenticado';
  end if;

  select * into v_member
    from public.family_members
    where user_id = v_user
    for update;
  if not found then
    raise exception 'No perteneces a ninguna familia';
  end if;

  if v_member.role = 'owner' then
    select count(*) into v_owners
      from public.family_members
      where family_id = v_member.family_id and role = 'owner';
    if v_owners <= 1 then
      -- Si hay otros miembros, transferir ownership al más antiguo; si no, borrar familia.
      if exists (
        select 1 from public.family_members
        where family_id = v_member.family_id and user_id <> v_user
      ) then
        update public.family_members
          set role = 'owner'
          where id = (
            select id from public.family_members
            where family_id = v_member.family_id and user_id <> v_user
            order by joined_at asc
            limit 1
          );
      else
        delete from public.families where id = v_member.family_id;
        return;
      end if;
    end if;
  end if;

  delete from public.family_members where id = v_member.id;
end;
$$;

-- ----------------------------------------------------------------------------
-- RPC: invitar usuario
-- ----------------------------------------------------------------------------
create or replace function public.family_invite(p_invitee_user_id uuid)
returns public.family_invitations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_family_id uuid;
  v_inv public.family_invitations;
begin
  if v_user is null then
    raise exception 'No autenticado';
  end if;
  if p_invitee_user_id is null or p_invitee_user_id = v_user then
    raise exception 'Invitación inválida';
  end if;

  select family_id into v_family_id
    from public.family_members
    where user_id = v_user;
  if v_family_id is null then
    raise exception 'Debes pertenecer a una familia para invitar';
  end if;

  if exists (select 1 from public.family_members where user_id = p_invitee_user_id) then
    raise exception 'Esa persona ya pertenece a una familia';
  end if;

  if not exists (select 1 from public.profiles where id = p_invitee_user_id) then
    raise exception 'Usuario no encontrado';
  end if;

  if exists (
    select 1 from public.family_invitations
    where family_id = v_family_id
      and invitee_user_id = p_invitee_user_id
      and status = 'pending'
  ) then
    raise exception 'Ya hay una invitación pendiente para esa persona';
  end if;

  insert into public.family_invitations (family_id, invited_by, invitee_user_id, status)
  values (v_family_id, v_user, p_invitee_user_id, 'pending')
  returning * into v_inv;

  return v_inv;
end;
$$;

-- ----------------------------------------------------------------------------
-- RPC: cancelar invitación (quien invita o miembro owner)
-- ----------------------------------------------------------------------------
create or replace function public.family_cancel_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_inv public.family_invitations;
begin
  if v_user is null then raise exception 'No autenticado'; end if;

  select * into v_inv from public.family_invitations where id = p_invitation_id for update;
  if not found then raise exception 'Invitación no encontrada'; end if;
  if v_inv.status <> 'pending' then raise exception 'La invitación ya no está pendiente'; end if;

  if v_inv.invited_by <> v_user
     and not exists (
       select 1 from public.family_members
       where family_id = v_inv.family_id and user_id = v_user and role = 'owner'
     ) then
    raise exception 'No autorizado';
  end if;

  update public.family_invitations
    set status = 'cancelled', responded_at = now()
    where id = p_invitation_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- RPC: responder invitación (aceptar / rechazar)
-- ----------------------------------------------------------------------------
create or replace function public.family_respond_invitation(
  p_invitation_id uuid,
  p_accept boolean
)
returns public.family_invitations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_inv public.family_invitations;
begin
  if v_user is null then raise exception 'No autenticado'; end if;

  select * into v_inv from public.family_invitations where id = p_invitation_id for update;
  if not found then raise exception 'Invitación no encontrada'; end if;
  if v_inv.invitee_user_id <> v_user then raise exception 'No autorizado'; end if;
  if v_inv.status <> 'pending' then raise exception 'La invitación ya no está pendiente'; end if;

  if not p_accept then
    update public.family_invitations
      set status = 'declined', responded_at = now()
      where id = p_invitation_id
      returning * into v_inv;
    return v_inv;
  end if;

  if exists (select 1 from public.family_members where user_id = v_user) then
    raise exception 'Ya perteneces a una familia. Sal de ella antes de aceptar otra invitación.';
  end if;

  insert into public.family_members (family_id, user_id, role)
  values (v_inv.family_id, v_user, 'member');

  update public.family_invitations
    set status = 'accepted', responded_at = now()
    where id = p_invitation_id
    returning * into v_inv;

  -- Cancela otras pendientes del mismo usuario.
  update public.family_invitations
    set status = 'cancelled', responded_at = now()
    where invitee_user_id = v_user
      and status = 'pending'
      and id <> p_invitation_id;

  return v_inv;
end;
$$;

-- ----------------------------------------------------------------------------
-- RPC: enviar mensaje
-- ----------------------------------------------------------------------------
create or replace function public.family_send_message(p_body text)
returns public.family_messages
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_family_id uuid;
  v_msg public.family_messages;
begin
  if v_user is null then raise exception 'No autenticado'; end if;
  if coalesce(btrim(p_body), '') = '' then
    raise exception 'El mensaje no puede estar vacío';
  end if;

  select family_id into v_family_id
    from public.family_members where user_id = v_user;
  if v_family_id is null then
    raise exception 'No perteneces a ninguna familia';
  end if;

  insert into public.family_messages (family_id, sender_id, body)
  values (v_family_id, v_user, btrim(p_body))
  returning * into v_msg;

  return v_msg;
end;
$$;

-- ----------------------------------------------------------------------------
-- RPC: invitaciones pendientes recibidas (con nombre de familia e invitador)
-- ----------------------------------------------------------------------------
create or replace function public.family_list_incoming_invites()
returns table (
  id uuid,
  family_id uuid,
  family_name text,
  invited_by uuid,
  invited_by_name text,
  invitee_user_id uuid,
  status text,
  created_at timestamptz,
  responded_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'No autenticado'; end if;

  return query
  select
    i.id,
    i.family_id,
    f.name,
    i.invited_by,
    p.full_name,
    i.invitee_user_id,
    i.status,
    i.created_at,
    i.responded_at
  from public.family_invitations i
  join public.families f on f.id = i.family_id
  left join public.profiles p on p.id = i.invited_by
  where i.invitee_user_id = v_user
    and i.status = 'pending'
  order by i.created_at desc;
end;
$$;

-- ----------------------------------------------------------------------------
-- RPC: invitaciones pendientes salientes con nombre del destinatario
-- ----------------------------------------------------------------------------
create or replace function public.family_list_outgoing_invites(p_family_id uuid)
returns table (
  id uuid,
  family_id uuid,
  invited_by uuid,
  invitee_user_id uuid,
  status text,
  created_at timestamptz,
  responded_at timestamptz,
  invitee_name text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not public.is_family_member(p_family_id) then
    raise exception 'No autorizado';
  end if;

  return query
  select
    i.id,
    i.family_id,
    i.invited_by,
    i.invitee_user_id,
    i.status,
    i.created_at,
    i.responded_at,
    p.full_name
  from public.family_invitations i
  left join public.profiles p on p.id = i.invitee_user_id
  where i.family_id = p_family_id
    and i.status = 'pending'
  order by i.created_at desc;
end;
$$;

-- ----------------------------------------------------------------------------
-- RPC: roster de miembros con nombre/avatar (evita depender de RLS de profiles)
-- ----------------------------------------------------------------------------
create or replace function public.family_list_members(p_family_id uuid)
returns table (
  id uuid,
  family_id uuid,
  user_id uuid,
  role text,
  joined_at timestamptz,
  full_name text,
  avatar_url text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'No autenticado'; end if;
  if not public.is_family_member(p_family_id) then
    raise exception 'No autorizado';
  end if;

  return query
  select
    m.id,
    m.family_id,
    m.user_id,
    m.role,
    m.joined_at,
    p.full_name,
    p.avatar_url
  from public.family_members m
  left join public.profiles p on p.id = m.user_id
  where m.family_id = p_family_id
  order by m.joined_at asc;
end;
$$;

-- ----------------------------------------------------------------------------
-- RPC: buscar usuarios invitables (por nombre). SECURITY DEFINER para leer profiles.
-- Excluye: uno mismo, ya en familia, ya invitados pendientes a mi familia.
-- ----------------------------------------------------------------------------
create or replace function public.family_search_users(p_query text, p_limit int default 10)
returns table (
  id uuid,
  full_name text,
  avatar_url text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_family_id uuid;
  v_q text := lower(btrim(coalesce(p_query, '')));
begin
  if v_user is null then raise exception 'No autenticado'; end if;
  if length(v_q) < 1 then return; end if;

  select family_id into v_family_id
    from public.family_members where user_id = v_user;

  return query
  select p.id, p.full_name, p.avatar_url
  from public.profiles p
  where p.id <> v_user
    and p.full_name is not null
    and lower(p.full_name) like '%' || v_q || '%'
    and not exists (select 1 from public.family_members fm where fm.user_id = p.id)
    and (
      v_family_id is null
      or not exists (
        select 1 from public.family_invitations fi
        where fi.family_id = v_family_id
          and fi.invitee_user_id = p.id
          and fi.status = 'pending'
      )
    )
  order by p.full_name asc
  limit greatest(1, least(coalesce(p_limit, 10), 25));
end;
$$;

-- ----------------------------------------------------------------------------
-- Permisos
-- ----------------------------------------------------------------------------
revoke all on function public.is_family_member(uuid) from public;
revoke all on function public.current_family_id() from public;
revoke all on function public.family_create(text) from public;
revoke all on function public.family_leave() from public;
revoke all on function public.family_invite(uuid) from public;
revoke all on function public.family_cancel_invitation(uuid) from public;
revoke all on function public.family_respond_invitation(uuid, boolean) from public;
revoke all on function public.family_send_message(text) from public;
revoke all on function public.family_list_incoming_invites() from public;
revoke all on function public.family_list_outgoing_invites(uuid) from public;
revoke all on function public.family_list_members(uuid) from public;
revoke all on function public.family_search_users(text, int) from public;

grant execute on function public.is_family_member(uuid) to authenticated;
grant execute on function public.current_family_id() to authenticated;
grant execute on function public.family_create(text) to authenticated;
grant execute on function public.family_leave() to authenticated;
grant execute on function public.family_invite(uuid) to authenticated;
grant execute on function public.family_cancel_invitation(uuid) to authenticated;
grant execute on function public.family_respond_invitation(uuid, boolean) to authenticated;
grant execute on function public.family_send_message(text) to authenticated;
grant execute on function public.family_list_incoming_invites() to authenticated;
grant execute on function public.family_list_outgoing_invites(uuid) to authenticated;
grant execute on function public.family_list_members(uuid) to authenticated;
grant execute on function public.family_search_users(text, int) to authenticated;

-- Realtime (chat): habilita la publicación si no está.
-- En el panel: Database → Replication → family_messages.
do $$
begin
  begin
    alter publication supabase_realtime add table public.family_messages;
  exception
    when duplicate_object then null;
    when undefined_object then null; -- publicación inexistente en entornos locales
  end;
end $$;

commit;
