-- PROMPT 078: Soporte ARS/USD en costos de productos
-- Idempotente: agrega columnas solo si no existen.

ALTER TABLE st_products
  ADD COLUMN IF NOT EXISTS cost_currency text NOT NULL DEFAULT 'ARS';

ALTER TABLE st_products
  ADD COLUMN IF NOT EXISTS cost_price_usd numeric NULL;

ALTER TABLE st_products
  ADD COLUMN IF NOT EXISTS last_exchange_rate numeric NULL;

-- Constraint opcional para asegurar valores válidos.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'st_products_cost_currency_check'
  ) THEN
    ALTER TABLE st_products
      ADD CONSTRAINT st_products_cost_currency_check
      CHECK (cost_currency IN ('ARS', 'USD'));
  END IF;
END $$;
