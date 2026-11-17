# Supabase — Balance Home

Migraciones versionadas del proyecto. Se aplican en orden alfabético por nombre
de archivo (prefijo de fecha).

## Orden de ejecución

1. `migrations/20261116_household_shopping.sql` — Módulo «Compras del hogar»
   (inventario, lista de compras, historial de stock, RLS y funciones
   transaccionales).
2. `migrations/20261117_household_product_delete.sql` — Política RLS para
   eliminar productos de forma definitiva.
3. `migrations/20261118_family.sql` — Módulo «Familia» (familias, miembros,
   invitaciones, chat grupal, RLS y RPC). Guía de correos:
   `docs/family-and-email.md`.

> Los módulos de compras/familia son independientes de las tablas `finance_*`.
> Confirma que no existan ya objetos con estos nombres en tu base.

## Cómo aplicar

### Opción A — Supabase CLI (recomendada)

```bash
# Requiere la CLI de Supabase y el proyecto enlazado (supabase link).
supabase db push
```

### Opción B — SQL Editor del panel de Supabase

1. Abre tu proyecto en https://app.supabase.com
2. Entra en **SQL Editor → New query**.
3. Pega el contenido de `migrations/20261116_household_shopping.sql`.
4. Ejecuta (**Run**). El script está envuelto en `begin/commit`, así que es
   atómico: si algo falla, no deja objetos a medias.

### Opción C — psql

```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/20261116_household_shopping.sql
```

## Qué crea

**Tablas** (con RLS `auth.uid() = user_id` en las tres):

- `household_products` — inventario.
- `household_shopping_items` — líneas de la lista (índice único parcial: 1
  pendiente por producto y cuenta).
- `household_stock_movements` — historial (solo lectura; se escribe desde las
  funciones).

**Funciones transaccionales** (`SECURITY DEFINER`, `search_path` fijo, `EXECUTE`
solo para `authenticated`):

- `household_create_product(p_name, p_unit, p_target, p_minimum, p_stock, p_category)`
- `household_adjust_stock(p_product_id, p_new_quantity)`
- `household_set_archived(p_product_id, p_archived)`
- `household_confirm_purchase(p_items jsonb)`

**Guards**: la columna `stock_quantity` y la confirmación de compra solo pueden
modificarse dentro de esas funciones (bandera local `app.allow_stock_write`). El
historial no admite escritura directa (sin política de INSERT; lo escribe el
owner vía `SECURITY DEFINER`).

## Verificación pendiente de acceso a Supabase

Estas comprobaciones requieren una base real y no se pueden ejecutar desde el
frontend:

- Confirmar compra dos veces con el mismo conjunto → la segunda debe fallar sin
  volver a sumar stock.
- Intentar `update household_products set stock_quantity = ...` como usuario
  autenticado → debe ser rechazado por el guard.
- Insertar/actualizar `household_stock_movements` directamente → rechazado.
- Dos cuentas distintas no deben ver ni modificar los datos de la otra.
