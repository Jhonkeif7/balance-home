-- =============================================================================
-- Balance Home — Vaciar datos de la aplicación (empezar en 0)
-- Conserva: auth.users (cuentas) y public.profiles (perfiles).
-- NO borra usuarios, esquemas, vistas, funciones ni políticas RLS.
--
-- Cómo usarlo:
--   1. Supabase → SQL Editor → New query
--   2. Pega TODO este archivo
--   3. Run
--
-- Storage (bucket user-files):
--   Supabase YA NO permite DELETE directo en storage.objects desde SQL.
--   Este script solo vacía la metadata (user_files / file_folders).
--   Para vaciar los archivos físicos del bucket:
--     Storage → user-files → selecciona todo → Delete
--   (o usa la Storage API / CLI). Si no lo haces, pueden quedar objetos
--   huérfanos en Storage, pero la app los trata como vacíos.
--
-- Después: cierra sesión / recarga la app. Los módulos quedarán vacíos.
-- Los reportes (vistas v_*) se vacían solos al vaciar las tablas base.
-- =============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Vaciar tablas de negocio. Solo las que existan.
-- RESTART IDENTITY + CASCADE: limpia FKs entre ellas y reinicia secuencias.
-- ----------------------------------------------------------------------------
do $$
declare
  tables text[] := array[
    -- Mi Día
    'task_steps',
    'tasks',
    'task_categories',
    -- Finanzas (reportes dependen de estas)
    'finance_transactions',
    'finance_budgets',
    'finance_subcategories',
    'finance_categories',
    'finance_accounts',
    -- Notas
    'notes',
    'note_folders',
    -- Archivos (solo metadata; el bucket se limpia en el Dashboard)
    'user_files',
    'file_folders',
    -- Compras del hogar
    'household_stock_movements',
    'household_shopping_items',
    'household_products'
  ];
  t text;
  existing text[] := '{}';
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is not null then
      existing := array_append(existing, format('%I', t));
    end if;
  end loop;

  if cardinality(existing) = 0 then
    raise notice 'No se encontraron tablas de aplicación para vaciar.';
  else
    execute 'truncate table ' || array_to_string(existing, ', ')
      || ' restart identity cascade';
    raise notice 'Tablas vaciadas: %', array_to_string(existing, ', ');
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Verificación rápida (conteos). auth.users y profiles deben seguir con filas.
-- ----------------------------------------------------------------------------
do $$
declare
  users_n int;
  profiles_n int;
begin
  select count(*) into users_n from auth.users;
  select count(*) into profiles_n from public.profiles;
  raise notice 'Usuarios conservados (auth.users): %', users_n;
  raise notice 'Perfiles conservados (profiles): %', profiles_n;
end $$;

commit;

-- =============================================================================
-- Qué NO se toca a propósito
--   - auth.users / auth.*          → cuentas de acceso
--   - public.profiles              → nombre, avatar, moneda, zona horaria
--   - vistas (v_*), funciones, RLS → esquema intacto
--   - storage.objects              → limpia el bucket user-files desde Storage UI
-- =============================================================================
