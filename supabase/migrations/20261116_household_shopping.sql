-- =============================================================================
-- Balance Home — Módulo «Compras del hogar»
-- Migración versionada. Crea inventario, lista de compras e historial de stock.
--
-- Diseño clave:
--  * 3 tablas: household_products, household_shopping_items, household_stock_movements.
--  * RLS en las tres tablas: auth.uid() = user_id en lectura y escritura.
--  * Claves foráneas COMPUESTAS con user_id para impedir referencias entre cuentas.
--  * La columna de stock y el historial NO se escriben directamente: solo a través
--    de las funciones transaccionales (guards por trigger + bandera de transacción).
--  * Funciones SECURITY DEFINER con search_path fijo y EXECUTE restringido a
--    'authenticated'.
--
-- Este módulo es INDEPENDIENTE de las finanzas (finance_*). No las referencia.
-- Antes de aplicar, verifica que estos nombres no existan ya en tu esquema.
-- =============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Utilidad: refrescar updated_at
-- ----------------------------------------------------------------------------
create or replace function public.household_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Tabla: household_products (inventario)
-- ----------------------------------------------------------------------------
create table if not exists public.household_products (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  name              text not null,
  category          text,
  unit              text not null,
  stock_quantity    numeric not null default 0,
  minimum_quantity  numeric not null default 0,
  target_quantity   numeric not null,
  archived_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint household_products_name_not_empty check (length(btrim(name)) > 0),
  constraint household_products_unit_not_empty check (length(btrim(unit)) > 0),
  constraint household_products_stock_non_negative check (stock_quantity >= 0),
  constraint household_products_min_non_negative check (minimum_quantity >= 0),
  constraint household_products_target_gt_min check (target_quantity > minimum_quantity),
  -- Necesario para las FK compuestas (id, user_id).
  constraint household_products_id_user_unique unique (id, user_id)
);

create index if not exists idx_household_products_user
  on public.household_products (user_id);
create index if not exists idx_household_products_user_active
  on public.household_products (user_id, archived_at);

create trigger trg_household_products_updated_at
  before update on public.household_products
  for each row execute function public.household_touch_updated_at();

-- ----------------------------------------------------------------------------
-- Tabla: household_shopping_items (líneas de la lista de compras)
-- ----------------------------------------------------------------------------
create table if not exists public.household_shopping_items (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  product_id          uuid not null,
  requested_quantity  numeric not null,
  purchased_quantity  numeric,
  status              text not null default 'pending',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  purchased_at        timestamptz,
  constraint household_items_status_valid check (status in ('pending', 'purchased', 'removed')),
  constraint household_items_requested_positive check (requested_quantity > 0),
  constraint household_items_purchased_valid
    check (purchased_quantity is null or purchased_quantity >= 0),
  constraint household_items_purchased_when_bought
    check (status <> 'purchased' or (purchased_quantity is not null and purchased_quantity > 0)),
  -- FK compuesta: impide que una línea apunte a un producto de otra cuenta.
  constraint household_items_product_fk
    foreign key (product_id, user_id)
    references public.household_products (id, user_id) on delete cascade,
  -- Necesario para que los movimientos referencien (id, user_id).
  constraint household_items_id_user_unique unique (id, user_id)
);

-- Como máximo UNA línea pendiente por producto y cuenta.
create unique index if not exists uq_household_items_one_pending
  on public.household_shopping_items (user_id, product_id)
  where status = 'pending';

create index if not exists idx_household_items_user_status
  on public.household_shopping_items (user_id, status);
create index if not exists idx_household_items_user_product
  on public.household_shopping_items (user_id, product_id);

create trigger trg_household_items_updated_at
  before update on public.household_shopping_items
  for each row execute function public.household_touch_updated_at();

-- ----------------------------------------------------------------------------
-- Tabla: household_stock_movements (historial)
-- Conserva name/unit al momento del movimiento para que el historial sea
-- interpretable aunque el producto cambie o se archive.
-- ----------------------------------------------------------------------------
create table if not exists public.household_stock_movements (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  product_id        uuid not null,
  shopping_item_id  uuid references public.household_shopping_items (id) on delete set null,
  quantity_delta    numeric not null,
  stock_before      numeric not null,
  stock_after       numeric not null,
  reason            text not null,
  product_name      text not null,
  product_unit      text not null,
  created_at        timestamptz not null default now(),
  constraint household_movements_reason_valid
    check (reason in ('initial', 'adjustment', 'purchase')),
  constraint household_movements_name_not_empty check (length(btrim(product_name)) > 0),
  constraint household_movements_unit_not_empty check (length(btrim(product_unit)) > 0),
  constraint household_movements_product_fk
    foreign key (product_id, user_id)
    references public.household_products (id, user_id) on delete cascade
);

create index if not exists idx_household_movements_user_created
  on public.household_stock_movements (user_id, created_at desc);
create index if not exists idx_household_movements_user_product
  on public.household_stock_movements (user_id, product_id);

-- ----------------------------------------------------------------------------
-- Guards: la escritura de stock / historial / confirmación de compra solo puede
-- ocurrir dentro de las funciones transaccionales, que fijan la bandera local
-- app.allow_stock_write = 'on'.
-- ----------------------------------------------------------------------------
create or replace function public.household_guard_product_stock()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.stock_quantity is distinct from old.stock_quantity
     and current_setting('app.allow_stock_write', true) is distinct from 'on' then
    raise exception
      'stock_quantity solo puede cambiarse mediante las operaciones de compras';
  end if;
  return new;
end;
$$;

create trigger trg_household_guard_product_stock
  before update on public.household_products
  for each row execute function public.household_guard_product_stock();

create or replace function public.household_guard_item_purchase()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_flag text := current_setting('app.allow_stock_write', true);
begin
  if tg_op = 'INSERT' then
    if (new.status = 'purchased' or new.purchased_at is not null
        or new.purchased_quantity is not null)
       and v_flag is distinct from 'on' then
      raise exception
        'Las compras se confirman mediante household_confirm_purchase';
    end if;
    return new;
  end if;

  -- UPDATE
  if (new.status = 'purchased'
      or new.purchased_at is distinct from old.purchased_at
      or new.purchased_quantity is distinct from old.purchased_quantity)
     and v_flag is distinct from 'on' then
    raise exception
      'Las compras se confirman mediante household_confirm_purchase';
  end if;
  return new;
end;
$$;

create trigger trg_household_guard_item_purchase
  before insert or update on public.household_shopping_items
  for each row execute function public.household_guard_item_purchase();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.household_products       enable row level security;
alter table public.household_shopping_items enable row level security;
alter table public.household_stock_movements enable row level security;

-- Productos: lectura y edición del propietario. Sin INSERT directo
-- (la creación pasa por household_create_product para registrar el stock inicial).
-- Sin DELETE (se archiva para conservar el historial).
drop policy if exists household_products_select on public.household_products;
create policy household_products_select on public.household_products
  for select using (auth.uid() = user_id);

drop policy if exists household_products_update on public.household_products;
create policy household_products_update on public.household_products
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Líneas de compra: CRUD del propietario (añadir, editar cantidad solicitada,
-- quitar=removed). La transición a 'purchased' la bloquea el guard.
drop policy if exists household_items_select on public.household_shopping_items;
create policy household_items_select on public.household_shopping_items
  for select using (auth.uid() = user_id);

drop policy if exists household_items_insert on public.household_shopping_items;
create policy household_items_insert on public.household_shopping_items
  for insert with check (auth.uid() = user_id);

drop policy if exists household_items_update on public.household_shopping_items;
create policy household_items_update on public.household_shopping_items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists household_items_delete on public.household_shopping_items;
create policy household_items_delete on public.household_shopping_items
  for delete using (auth.uid() = user_id);

-- Historial: solo lectura del propietario. La escritura la hacen las funciones
-- SECURITY DEFINER (owner), que no están sujetas a RLS.
drop policy if exists household_movements_select on public.household_stock_movements;
create policy household_movements_select on public.household_stock_movements
  for select using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Función: crear producto con stock inicial (transaccional)
-- ----------------------------------------------------------------------------
create or replace function public.household_create_product(
  p_name     text,
  p_unit     text,
  p_target   numeric,
  p_minimum  numeric default 0,
  p_stock    numeric default 0,
  p_category text default null
)
returns public.household_products
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user    uuid := auth.uid();
  v_product public.household_products;
begin
  if v_user is null then
    raise exception 'No autenticado';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'El nombre es obligatorio';
  end if;
  if coalesce(btrim(p_unit), '') = '' then
    raise exception 'La unidad es obligatoria';
  end if;
  if p_stock < 0 or p_minimum < 0 then
    raise exception 'Las cantidades no pueden ser negativas';
  end if;
  if p_target <= p_minimum then
    raise exception 'El objetivo debe ser mayor que el mínimo';
  end if;

  perform set_config('app.allow_stock_write', 'on', true);

  insert into public.household_products (
    user_id, name, category, unit, stock_quantity, minimum_quantity, target_quantity
  ) values (
    v_user,
    btrim(p_name),
    nullif(btrim(coalesce(p_category, '')), ''),
    btrim(p_unit),
    p_stock,
    p_minimum,
    p_target
  )
  returning * into v_product;

  insert into public.household_stock_movements (
    user_id, product_id, shopping_item_id, quantity_delta,
    stock_before, stock_after, reason, product_name, product_unit
  ) values (
    v_user, v_product.id, null, p_stock,
    0, p_stock, 'initial', v_product.name, v_product.unit
  );

  return v_product;
end;
$$;

-- ----------------------------------------------------------------------------
-- Función: ajustar stock (transaccional). Sirve también para «marcar agotado»
-- (p_new_quantity = 0).
-- ----------------------------------------------------------------------------
create or replace function public.household_adjust_stock(
  p_product_id   uuid,
  p_new_quantity numeric
)
returns public.household_products
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user    uuid := auth.uid();
  v_product public.household_products;
  v_before  numeric;
begin
  if v_user is null then
    raise exception 'No autenticado';
  end if;
  if p_new_quantity is null or p_new_quantity < 0 then
    raise exception 'La cantidad no puede ser negativa';
  end if;

  perform set_config('app.allow_stock_write', 'on', true);

  select * into v_product
    from public.household_products
    where id = p_product_id and user_id = v_user
    for update;
  if not found then
    raise exception 'Producto no encontrado';
  end if;

  v_before := v_product.stock_quantity;

  if v_before = p_new_quantity then
    return v_product; -- sin cambios, sin movimiento
  end if;

  update public.household_products
    set stock_quantity = p_new_quantity
    where id = v_product.id
    returning * into v_product;

  insert into public.household_stock_movements (
    user_id, product_id, shopping_item_id, quantity_delta,
    stock_before, stock_after, reason, product_name, product_unit
  ) values (
    v_user, v_product.id, null, p_new_quantity - v_before,
    v_before, p_new_quantity, 'adjustment', v_product.name, v_product.unit
  );

  return v_product;
end;
$$;

-- ----------------------------------------------------------------------------
-- Función: archivar / desarchivar producto. Al archivar retira su línea
-- pendiente en la misma operación. Conserva el historial.
-- ----------------------------------------------------------------------------
create or replace function public.household_set_archived(
  p_product_id uuid,
  p_archived   boolean
)
returns public.household_products
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user    uuid := auth.uid();
  v_product public.household_products;
begin
  if v_user is null then
    raise exception 'No autenticado';
  end if;

  select * into v_product
    from public.household_products
    where id = p_product_id and user_id = v_user
    for update;
  if not found then
    raise exception 'Producto no encontrado';
  end if;

  if p_archived then
    update public.household_shopping_items
      set status = 'removed'
      where user_id = v_user
        and product_id = p_product_id
        and status = 'pending';

    update public.household_products
      set archived_at = now()
      where id = p_product_id
      returning * into v_product;
  else
    update public.household_products
      set archived_at = null
      where id = p_product_id
      returning * into v_product;
  end if;

  return v_product;
end;
$$;

-- ----------------------------------------------------------------------------
-- Función: confirmar compra (transaccional e idempotente ante reintentos).
-- p_items: jsonb array de { "id": uuid, "quantity": numeric }.
-- Bloquea filas, valida pertenencia y estado pendiente, suma stock, registra
-- movimientos y marca las líneas como compradas. Si una línea falla, revierte todo.
-- ----------------------------------------------------------------------------
create or replace function public.household_confirm_purchase(
  p_items jsonb
)
returns setof public.household_stock_movements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user    uuid := auth.uid();
  v_elem    jsonb;
  v_id      uuid;
  v_qty     numeric;
  v_item    public.household_shopping_items;
  v_product public.household_products;
  v_before  numeric;
  v_after   numeric;
  v_mov     public.household_stock_movements;
begin
  if v_user is null then
    raise exception 'No autenticado';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'No hay líneas para confirmar';
  end if;

  perform set_config('app.allow_stock_write', 'on', true);

  for v_elem in select * from jsonb_array_elements(p_items)
  loop
    v_id  := (v_elem ->> 'id')::uuid;
    v_qty := (v_elem ->> 'quantity')::numeric;

    if v_qty is null or v_qty <= 0 then
      raise exception 'Cantidad inválida para la línea %', v_id;
    end if;

    -- Bloquea la línea y valida pertenencia + estado.
    select * into v_item
      from public.household_shopping_items
      where id = v_id
      for update;
    if not found then
      raise exception 'Línea % no encontrada', v_id;
    end if;
    if v_item.user_id <> v_user then
      raise exception 'No autorizado';
    end if;
    if v_item.status <> 'pending' then
      -- Un reintento / doble clic encuentra la línea ya comprada o retirada:
      -- aborta TODA la operación para no sumar dos veces.
      raise exception 'La línea % ya no está pendiente', v_id;
    end if;

    -- Bloquea el producto y suma el stock.
    select * into v_product
      from public.household_products
      where id = v_item.product_id and user_id = v_user
      for update;
    if not found then
      raise exception 'Producto de la línea % no encontrado', v_id;
    end if;

    v_before := v_product.stock_quantity;
    v_after  := v_before + v_qty;

    update public.household_products
      set stock_quantity = v_after
      where id = v_product.id;

    insert into public.household_stock_movements (
      user_id, product_id, shopping_item_id, quantity_delta,
      stock_before, stock_after, reason, product_name, product_unit
    ) values (
      v_user, v_product.id, v_item.id, v_qty,
      v_before, v_after, 'purchase', v_product.name, v_product.unit
    )
    returning * into v_mov;

    update public.household_shopping_items
      set status = 'purchased',
          purchased_quantity = v_qty,
          purchased_at = now()
      where id = v_item.id;

    return next v_mov;
  end loop;

  return;
end;
$$;

-- ----------------------------------------------------------------------------
-- Permisos de ejecución: solo usuarios autenticados.
-- ----------------------------------------------------------------------------
revoke all on function public.household_create_product(text, text, numeric, numeric, numeric, text) from public;
revoke all on function public.household_adjust_stock(uuid, numeric) from public;
revoke all on function public.household_set_archived(uuid, boolean) from public;
revoke all on function public.household_confirm_purchase(jsonb) from public;

grant execute on function public.household_create_product(text, text, numeric, numeric, numeric, text) to authenticated;
grant execute on function public.household_adjust_stock(uuid, numeric) to authenticated;
grant execute on function public.household_set_archived(uuid, boolean) to authenticated;
grant execute on function public.household_confirm_purchase(jsonb) to authenticated;

commit;
