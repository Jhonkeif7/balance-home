-- =============================================================================
-- Borra TODAS las familias y datos relacionados.
-- Conserva: auth.users y profiles.
--
-- CASCADE limpia: family_members, family_invitations, family_messages.
-- Pegar en Supabase → SQL Editor → Run.
-- =============================================================================

begin;

-- Desactiva el trigger de correo por si hiciera ruido al borrar (no debería,
-- pero evita sorpresas si hay lógica AFTER DELETE en el futuro).
-- drop trigger if exists trg_family_invite_email on public.family_invitations;

delete from public.families;

-- Verificación
do $$
declare
  fam int;
  mem int;
  inv int;
  msg int;
begin
  select count(*) into fam from public.families;
  select count(*) into mem from public.family_members;
  select count(*) into inv from public.family_invitations;
  select count(*) into msg from public.family_messages;
  raise notice 'families=% members=% invitations=% messages=%', fam, mem, inv, msg;
end $$;

commit;
