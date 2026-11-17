-- =============================================================================
-- Balance Home — Permite eliminar productos del inventario de forma definitiva.
-- Al borrar un producto, CASCADE elimina líneas de compra e historial asociados.
--
-- Aplicar en SQL Editor después de 20261116_household_shopping.sql
-- =============================================================================

begin;

drop policy if exists household_products_delete on public.household_products;
create policy household_products_delete on public.household_products
  for delete using (auth.uid() = user_id);

commit;
