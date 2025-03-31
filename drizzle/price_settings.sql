CREATE TABLE IF NOT EXISTS public.price_settings (
  id SERIAL PRIMARY KEY,
  percentage_markup NUMERIC(5,2) NOT NULL DEFAULT 25,
  flat_fee_markup NUMERIC(5,2) NOT NULL DEFAULT 0.2,
  last_updated TIMESTAMP NOT NULL DEFAULT NOW()
);
