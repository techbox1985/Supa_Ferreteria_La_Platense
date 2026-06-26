


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."descontar_stock_venta"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE public.st_products
  SET current_stock = current_stock - NEW.quantity
  WHERE id = NEW.product_id;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."descontar_stock_venta"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."detect_duplicate_sale_movements"() RETURNS TABLE("original_sale_id" "uuid", "cantidad" bigint)
    LANGUAGE "sql"
    AS $$
SELECT
original_sale_id,
COUNT(*) as cantidad
FROM st_account_transactions
WHERE type = 'Venta'
GROUP BY original_sale_id
HAVING COUNT(*) > 1;
$$;


ALTER FUNCTION "public"."detect_duplicate_sale_movements"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."detect_negative_customer_balances"() RETURNS TABLE("customer_id" "uuid", "saldo" numeric)
    LANGUAGE "sql"
    AS $$
SELECT
customer_id,
SUM(debit) - SUM(credit) AS saldo
FROM st_account_transactions
GROUP BY customer_id
HAVING SUM(debit) - SUM(credit) < -100000;
$$;


ALTER FUNCTION "public"."detect_negative_customer_balances"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."execute_temp_import_price_update"("p_import_session_id" "uuid") RETURNS TABLE("updated_count" bigint)
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_updated_count bigint := 0;
BEGIN
  CREATE TEMP TABLE tmp_price_import_rows ON COMMIT DROP AS
  SELECT
    t.id AS temp_id,
    t.supplier_id,
    CASE
      WHEN t.file_currency = 'USD' THEN ROUND((t.excel_price * COALESCE(t.exchange_rate, 1))::numeric, 2)
      ELSE ROUND(t.excel_price::numeric, 2)
    END AS new_cost_price,
    LOWER(regexp_replace(TRIM(COALESCE(t.excel_code, '')), '[^a-zA-Z0-9]', '', 'g')) AS code_key
  FROM public.st_supplier_price_import_temp t
  WHERE t.import_session_id = p_import_session_id
    AND t.excel_price IS NOT NULL
    AND t.excel_price > 0
    AND COALESCE(TRIM(t.excel_code), '') <> '';

  CREATE INDEX tmp_price_import_rows_code_idx
  ON tmp_price_import_rows (supplier_id, code_key);

  CREATE TEMP TABLE tmp_supplier_products ON COMMIT DROP AS
  SELECT
    p.id AS product_id,
    p.supplier_id,
    p.cost_price,
    p.final_price,
    p.auto_price,
    p.offer_price,
    LOWER(regexp_replace(TRIM(COALESCE(p.cod, '')), '[^a-zA-Z0-9]', '', 'g')) AS cod_key,
    LOWER(regexp_replace(TRIM(COALESCE(p.barcode, '')), '[^a-zA-Z0-9]', '', 'g')) AS barcode_key,
    COALESCE(s.tax_1_percent, 0) AS tax_1_percent,
    COALESCE(s.tax_2_percent, 0) AS tax_2_percent,
    COALESCE(s.tax_3_percent, 0) AS tax_3_percent,
    COALESCE(s.tax_4_percent, 0) AS tax_4_percent
  FROM public.st_products p
  LEFT JOIN public.st_suppliers s
    ON s.id = p.supplier_id
  WHERE COALESCE(p.is_deleted, false) = false
    AND p.supplier_id IN (
      SELECT DISTINCT supplier_id
      FROM tmp_price_import_rows
    );

  CREATE INDEX tmp_supplier_products_cod_idx
  ON tmp_supplier_products (supplier_id, cod_key);

  CREATE INDEX tmp_supplier_products_barcode_idx
  ON tmp_supplier_products (supplier_id, barcode_key);

  CREATE TEMP TABLE tmp_matches ON COMMIT DROP AS
  WITH matched_cod AS (
    SELECT DISTINCT ON (r.temp_id)
      r.temp_id,
      p.product_id,
      r.new_cost_price,
      p.auto_price,
      p.offer_price,
      p.tax_1_percent,
      p.tax_2_percent,
      p.tax_3_percent,
      p.tax_4_percent
    FROM tmp_price_import_rows r
    JOIN tmp_supplier_products p
      ON p.supplier_id = r.supplier_id
     AND p.cod_key = r.code_key
    WHERE r.code_key <> ''
    ORDER BY r.temp_id, p.product_id
  ),
  matched_barcode AS (
    SELECT DISTINCT ON (r.temp_id)
      r.temp_id,
      p.product_id,
      r.new_cost_price,
      p.auto_price,
      p.offer_price,
      p.tax_1_percent,
      p.tax_2_percent,
      p.tax_3_percent,
      p.tax_4_percent
    FROM tmp_price_import_rows r
    JOIN tmp_supplier_products p
      ON p.supplier_id = r.supplier_id
     AND p.barcode_key = r.code_key
    WHERE r.code_key <> ''
      AND NOT EXISTS (
        SELECT 1
        FROM matched_cod mc
        WHERE mc.temp_id = r.temp_id
      )
    ORDER BY r.temp_id, p.product_id
  ),
  all_matches AS (
    SELECT * FROM matched_cod
    UNION ALL
    SELECT * FROM matched_barcode
  )
  SELECT DISTINCT ON (product_id)
    product_id,
    new_cost_price,
    CASE
      WHEN COALESCE(offer_price, 0) > 0 THEN ROUND(offer_price::numeric, 2)
      WHEN COALESCE(auto_price, true) = true THEN ROUND(
        (
          new_cost_price
          * (1 + (tax_1_percent / 100))
          * (1 + (tax_2_percent / 100))
          * (1 + (tax_3_percent / 100))
          * (1 + (tax_4_percent / 100))
        )::numeric,
        2
      )
      ELSE NULL
    END AS new_final_price
  FROM all_matches
  WHERE new_cost_price IS NOT NULL
    AND new_cost_price > 0
  ORDER BY product_id, temp_id;

  UPDATE public.st_products p
  SET
    cost_price = m.new_cost_price,
    final_price = COALESCE(m.new_final_price, p.final_price),
    updated_at = now()
  FROM tmp_matches m
  WHERE p.id = m.product_id
    AND (
      COALESCE(p.cost_price, -1) IS DISTINCT FROM m.new_cost_price
      OR COALESCE(p.final_price, -1) IS DISTINCT FROM COALESCE(m.new_final_price, p.final_price)
    );

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  DELETE FROM public.st_supplier_price_import_temp
  WHERE import_session_id = p_import_session_id;

  RETURN QUERY
  SELECT v_updated_count;
END;
$$;


ALTER FUNCTION "public"."execute_temp_import_price_update"("p_import_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_temp_import_match_summary"("p_import_session_id" "uuid") RETURNS TABLE("total_rows" bigint, "matched_by_code" bigint, "matched_by_barcode" bigint, "not_matched" bigint)
    LANGUAGE "sql"
    AS $$
with temp_rows as (
  select
    t.id,
    upper(trim(coalesce(t.excel_code, ''))) as excel_code_norm
  from public.st_supplier_price_import_temp t
  where t.import_session_id = p_import_session_id
),
matched_code as (
  select distinct tr.id
  from temp_rows tr
  join public.st_products p
    on upper(trim(coalesce(p.cod, ''))) = tr.excel_code_norm
  where coalesce(p.is_deleted, false) = false
),
matched_barcode as (
  select distinct tr.id
  from temp_rows tr
  join public.st_products p
    on upper(trim(coalesce(p.barcode, ''))) = tr.excel_code_norm
  where coalesce(p.is_deleted, false) = false
    and tr.id not in (select id from matched_code)
)
select
  (select count(*) from temp_rows) as total_rows,
  (select count(*) from matched_code) as matched_by_code,
  (select count(*) from matched_barcode) as matched_by_barcode,
  (
    (select count(*) from temp_rows)
    - (select count(*) from matched_code)
    - (select count(*) from matched_barcode)
  ) as not_matched;
$$;


ALTER FUNCTION "public"."get_temp_import_match_summary"("p_import_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_duplicate_product_codes"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.supplier_id IS NOT DISTINCT FROM OLD.supplier_id
     AND NEW.cod IS NOT DISTINCT FROM OLD.cod
     AND NEW.barcode IS NOT DISTINCT FROM OLD.barcode
     AND NEW.is_deleted IS NOT DISTINCT FROM OLD.is_deleted
  THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.is_deleted, false) = true THEN
    RETURN NEW;
  END IF;

  IF NEW.supplier_id IS NOT NULL AND COALESCE(TRIM(NEW.cod), '') <> '' THEN
    IF EXISTS (
      SELECT 1
      FROM public.st_products p
      WHERE p.supplier_id = NEW.supplier_id
        AND COALESCE(p.is_deleted, false) = false
        AND p.id <> NEW.id
        AND LOWER(TRIM(p.cod)) = LOWER(TRIM(NEW.cod))
    ) THEN
      RAISE EXCEPTION 'Ya existe otro producto con ese COD para este proveedor';
    END IF;
  END IF;

  IF NEW.supplier_id IS NOT NULL AND COALESCE(TRIM(NEW.barcode), '') <> '' THEN
    IF EXISTS (
      SELECT 1
      FROM public.st_products p
      WHERE p.supplier_id = NEW.supplier_id
        AND COALESCE(p.is_deleted, false) = false
        AND p.id <> NEW.id
        AND LOWER(TRIM(p.barcode)) = LOWER(TRIM(NEW.barcode))
    ) THEN
      RAISE EXCEPTION 'Ya existe otro producto con ese BARCODE para este proveedor';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_duplicate_product_codes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalculate_st_product_final_price"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_tax_1 numeric := 0;
  v_tax_2 numeric := 0;
  v_tax_3 numeric := 0;
  v_tax_4 numeric := 0;
BEGIN
  IF COALESCE(NEW.is_deleted, false) = true THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.auto_price, true) = false THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.offer_price, 0) > 0 THEN
    NEW.final_price := ROUND(NEW.offer_price::numeric, 2);
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.cost_price, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT
    COALESCE(s.tax_1_percent, 0),
    COALESCE(s.tax_2_percent, 0),
    COALESCE(s.tax_3_percent, 0),
    COALESCE(s.tax_4_percent, 0)
  INTO
    v_tax_1,
    v_tax_2,
    v_tax_3,
    v_tax_4
  FROM public.st_suppliers s
  WHERE s.id = NEW.supplier_id;

  NEW.final_price := ROUND(
    (
      NEW.cost_price
      * (1 + (v_tax_1 / 100))
      * (1 + (v_tax_2 / 100))
      * (1 + (v_tax_3 / 100))
      * (1 + (v_tax_4 / 100))
    )::numeric,
    2
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."recalculate_st_product_final_price"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."safe_to_numeric"("txt" "text") RETURNS numeric
    LANGUAGE "plpgsql"
    AS $$
declare
  v text;
begin
  if txt is null or btrim(txt) = '' then
    return null;
  end if;

  v := btrim(txt);

  -- descartar notación científica o basura evidente
  if upper(v) like '%E+%' or upper(v) like '%E-%' then
    return null;
  end if;

  -- dejar solo dígitos, coma, punto y signo
  v := regexp_replace(v, '[^0-9,.\-]', '', 'g');

  if v = '' then
    return null;
  end if;

  -- si tiene coma, asumimos coma decimal y puntos de miles
  if position(',' in v) > 0 then
    v := replace(v, '.', '');
    v := replace(v, ',', '.');
  else
    -- si no tiene coma pero sí varios puntos, asumimos miles
    if length(v) - length(replace(v, '.', '')) > 1 then
      v := replace(v, '.', '');
    end if;
  end if;

  return v::numeric;
exception
  when others then
    return null;
end;
$$;


ALTER FUNCTION "public"."safe_to_numeric"("txt" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_st_pending_sales_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_st_pending_sales_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_store_incoming_orders_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_store_incoming_orders_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."st_products_auto_hide_zero_stock"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF COALESCE(NEW.current_stock, 0) <= 0 THEN
    NEW.is_online := false;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."st_products_auto_hide_zero_stock"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sale_id" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "nro" "text",
    "cae" "text",
    "vto_cae" "text",
    "fecha" timestamp with time zone,
    "qr_data" "text",
    "pdf_url" "text",
    "error" "text",
    "source" "text" DEFAULT 'sheet'::"text" NOT NULL,
    "payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "invoices_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'success'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."st_account_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "date" timestamp with time zone NOT NULL,
    "type" "text" NOT NULL,
    "description" "text",
    "debit" numeric DEFAULT 0,
    "credit" numeric DEFAULT 0,
    "balance" numeric,
    "original_sale_id" "uuid",
    "shift_id" "uuid",
    "items" "jsonb",
    "factura_info" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "payment_method" "text"
);


ALTER TABLE "public"."st_account_transactions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."st_account_transactions"."payment_method" IS 'Medio de pago para movimientos de cuenta corriente: efectivo, digital, transferencia, tarjeta, otro.';



CREATE TABLE IF NOT EXISTS "public"."st_budget_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "budget_id" "uuid" NOT NULL,
    "product_id" "uuid",
    "product_code" "text",
    "product_name_snapshot" "text" NOT NULL,
    "quantity" numeric(15,2) DEFAULT 0 NOT NULL,
    "unit_price" numeric(15,2) DEFAULT 0 NOT NULL,
    "line_total" numeric(15,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."st_budget_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."st_budgets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "budget_number" bigint NOT NULL,
    "created_by_user_profile_id" "uuid",
    "customer_id" "uuid",
    "budgeted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "subtotal" numeric(15,2) DEFAULT 0 NOT NULL,
    "adjustment_amount" numeric(15,2) DEFAULT 0 NOT NULL,
    "total" numeric(15,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "valid_until" timestamp with time zone,
    "customer_name_snapshot" "text",
    "customer_document_snapshot" "text",
    "notes" "text",
    "legacy_budget_id" "text",
    "converted_to_sale_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "st_budgets_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'expired'::"text", 'converted'::"text"])))
);


ALTER TABLE "public"."st_budgets" OWNER TO "postgres";


ALTER TABLE "public"."st_budgets" ALTER COLUMN "budget_number" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."st_budgets_budget_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."st_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "parent_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."st_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."st_credit_note_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sale_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "product_code" "text",
    "product_name_snapshot" "text",
    "quantity" numeric NOT NULL,
    "unit_price" numeric NOT NULL,
    "line_total" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."st_credit_note_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."st_credit_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "original_sale_id" "uuid",
    "shift_id" "uuid",
    "date" timestamp with time zone NOT NULL,
    "description" "text",
    "total" numeric NOT NULL,
    "factura_info" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."st_credit_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."st_customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "full_name" "text" NOT NULL,
    "whatsapp" "text",
    "document_type" "text",
    "document_number" "text",
    "iva_condition" "text",
    "current_debt" numeric(15,2) DEFAULT 0 NOT NULL,
    "total_payments" numeric(15,2) DEFAULT 0 NOT NULL,
    "email" "text",
    "address" "text",
    "notes" "text",
    "legacy_created_at_text" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "discount_percentage" numeric(5,2) DEFAULT 0 NOT NULL,
    CONSTRAINT "st_customers_discount_percentage_check" CHECK ((("discount_percentage" >= (0)::numeric) AND ("discount_percentage" <= (100)::numeric)))
);


ALTER TABLE "public"."st_customers" OWNER TO "postgres";


COMMENT ON COLUMN "public"."st_customers"."discount_percentage" IS 'Porcentaje de descuento automático aplicado a todas las ventas del cliente. Default 0.';



CREATE TABLE IF NOT EXISTS "public"."st_expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shift_id" "uuid",
    "spent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "amount" numeric(15,2) DEFAULT 0 NOT NULL,
    "detail" "text" NOT NULL,
    "payment_cash" numeric(15,2) DEFAULT 0 NOT NULL,
    "payment_digital" numeric(15,2) DEFAULT 0 NOT NULL,
    "category" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tipo" "text",
    "user_profile_id" "uuid"
);


ALTER TABLE "public"."st_expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."st_pending_sale_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pending_sale_id" "uuid" NOT NULL,
    "product_id" "uuid",
    "product_code" "text",
    "product_name_snapshot" "text" NOT NULL,
    "quantity" numeric(14,3) DEFAULT 0 NOT NULL,
    "unit_price" numeric(14,2) DEFAULT 0 NOT NULL,
    "line_total" numeric(14,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."st_pending_sale_items" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."st_pending_sales_pending_number_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."st_pending_sales_pending_number_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."st_pending_sales" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pending_number" integer DEFAULT "nextval"('"public"."st_pending_sales_pending_number_seq"'::"regclass") NOT NULL,
    "status" "text" DEFAULT 'waiting'::"text" NOT NULL,
    "seller_id" "uuid",
    "seller_name_snapshot" "text",
    "cashier_id" "uuid",
    "cashier_name_snapshot" "text",
    "customer_id" "uuid",
    "customer_name_snapshot" "text" DEFAULT 'Consumidor Final'::"text" NOT NULL,
    "customer_document_snapshot" "text",
    "shift_id" "uuid",
    "subtotal" numeric(14,2) DEFAULT 0 NOT NULL,
    "adjustment_amount" numeric(14,2) DEFAULT 0 NOT NULL,
    "total" numeric(14,2) DEFAULT 0 NOT NULL,
    "notes" "text",
    "sent_to_cashier_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "claimed_at" timestamp with time zone,
    "paid_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "converted_sale_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "st_pending_sales_status_check" CHECK (("status" = ANY (ARRAY['waiting'::"text", 'claimed'::"text", 'paid'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."st_pending_sales" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."st_product_kits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "kit_product_id" "uuid" NOT NULL,
    "component_product_id" "uuid" NOT NULL,
    "quantity_per_kit" numeric(15,2) DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_st_product_kits_no_self_reference" CHECK (("kit_product_id" <> "component_product_id")),
    CONSTRAINT "chk_st_product_kits_qty_positive" CHECK (("quantity_per_kit" > (0)::numeric))
);


ALTER TABLE "public"."st_product_kits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."st_product_prices_import" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "import_batch_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "row_number" integer,
    "cod" "text",
    "Producto" "text",
    "barcode" "text",
    "Proveedor" "text",
    "cost_price" "text",
    "offer_price" "text",
    "processed" boolean DEFAULT false NOT NULL,
    "matched_product_id" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."st_product_prices_import" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."st_products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cod" "text" NOT NULL,
    "name" "text" NOT NULL,
    "category_id" "uuid",
    "sub_category" "text",
    "description" "text",
    "barcode" "text",
    "supplier_id" "uuid",
    "cost_price" numeric(15,2) DEFAULT 0 NOT NULL,
    "list_price" numeric(15,2) DEFAULT 0 NOT NULL,
    "offer_price" numeric(15,2),
    "initial_stock" numeric(15,2) DEFAULT 0 NOT NULL,
    "sold_count" numeric(15,2) DEFAULT 0 NOT NULL,
    "income_count" numeric(15,2) DEFAULT 0 NOT NULL,
    "current_stock" numeric(15,2) DEFAULT 0 NOT NULL,
    "final_price" numeric(15,2) DEFAULT 0 NOT NULL,
    "min_stock" numeric(15,2) DEFAULT 0 NOT NULL,
    "pv_sale" numeric(15,2),
    "is_online" boolean DEFAULT true NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "photo_url" "text",
    "image_url" "text",
    "is_deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    "brand" "text",
    "compatible_model" "text",
    "technical_type" "text",
    "specifications" "text",
    "shipping_class" "text",
    "web_title" "text",
    "slug_url" "text",
    "short_description" "text",
    "long_description" "text",
    "extra_images_urls" "text",
    "video_url" "text",
    "technical_sheet_url" "text",
    "weight_kg" numeric(10,3),
    "height_cm" numeric(15,2),
    "width_cm" numeric(15,2),
    "depth_cm" numeric(15,2),
    "is_fragile" boolean DEFAULT false NOT NULL,
    "special_packaging" boolean DEFAULT false NOT NULL,
    "online_stock" numeric(15,2),
    "allow_out_of_stock_sale" boolean DEFAULT false NOT NULL,
    "restock_days" integer,
    "publication_status" "text",
    "is_featured" boolean DEFAULT false NOT NULL,
    "catalog_order" integer,
    "warranty_months" integer,
    "internal_notes" "text",
    "legacy_product_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "auto_price" boolean DEFAULT false NOT NULL,
    "cost_currency" "text" DEFAULT 'ARS'::"text" NOT NULL,
    "cost_price_usd" numeric,
    "last_exchange_rate" numeric,
    "legacy_last_update" timestamp with time zone,
    "product_type" "text" DEFAULT 'simple'::"text" NOT NULL,
    CONSTRAINT "st_products_cost_currency_check" CHECK (("cost_currency" = ANY (ARRAY['ARS'::"text", 'USD'::"text"]))),
    CONSTRAINT "st_products_product_type_check" CHECK (("product_type" = ANY (ARRAY['simple'::"text", 'kit'::"text"])))
);


ALTER TABLE "public"."st_products" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."st_products_web_view" AS
 SELECT "id",
    "cod",
    "name",
    "slug_url",
    "web_title",
    "short_description",
    "long_description",
    "description",
    "brand",
    "compatible_model",
    "technical_type",
    "specifications",
    "barcode",
    "final_price",
    "list_price",
    "offer_price",
    "current_stock",
    "online_stock",
    "min_stock",
    "allow_out_of_stock_sale",
    "is_online",
    "is_active",
    "publication_status",
    "is_featured",
    "catalog_order",
    COALESCE("image_url", "photo_url") AS "main_image_url",
    "photo_url",
    "image_url",
    "extra_images_urls",
    "video_url",
    "technical_sheet_url",
    "weight_kg",
    "height_cm",
    "width_cm",
    "depth_cm",
    "warranty_months",
    "updated_at"
   FROM "public"."st_products"
  WHERE (("is_active" = true) AND ("is_online" = true) AND ("is_deleted" = false));


ALTER VIEW "public"."st_products_web_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."st_sale_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sale_id" "uuid" NOT NULL,
    "product_id" "uuid",
    "product_code" "text",
    "product_name_snapshot" "text" NOT NULL,
    "quantity" numeric(15,2) DEFAULT 0 NOT NULL,
    "unit_price" numeric(15,2) DEFAULT 0 NOT NULL,
    "line_total" numeric(15,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."st_sale_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."st_sales" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sale_number" bigint NOT NULL,
    "sold_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "customer_id" "uuid",
    "shift_id" "uuid" NOT NULL,
    "subtotal" numeric(15,2) DEFAULT 0 NOT NULL,
    "adjustment_amount" numeric(15,2) DEFAULT 0 NOT NULL,
    "total" numeric(15,2) DEFAULT 0 NOT NULL,
    "payment_cash" numeric(15,2) DEFAULT 0 NOT NULL,
    "payment_digital" numeric(15,2) DEFAULT 0 NOT NULL,
    "payment_credit" numeric(15,2) DEFAULT 0 NOT NULL,
    "invoice_type" character(1) DEFAULT 'N'::"bpchar" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "customer_name_snapshot" "text",
    "customer_document_snapshot" "text",
    "legacy_sale_id" "text",
    "legacy_invoice_id" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "document_type" character varying(16) DEFAULT 'sale'::character varying NOT NULL,
    "billing_cae" "text",
    "billing_number" "text",
    "billing_ticket_url" "text",
    "billing_pdf_url" "text",
    "billing_qr_data" "text",
    "billing_vto_cae" "text",
    "customer_discount_percentage" numeric(5,2) DEFAULT 0 NOT NULL,
    "customer_discount_amount" numeric(14,2) DEFAULT 0 NOT NULL,
    "subtotal_before_customer_discount" numeric(14,2),
    CONSTRAINT "st_sales_customer_discount_amount_check" CHECK (("customer_discount_amount" >= (0)::numeric)),
    CONSTRAINT "st_sales_customer_discount_percentage_check" CHECK ((("customer_discount_percentage" >= (0)::numeric) AND ("customer_discount_percentage" <= (100)::numeric))),
    CONSTRAINT "st_sales_invoice_type_check" CHECK (("invoice_type" = ANY (ARRAY['A'::"bpchar", 'B'::"bpchar", 'C'::"bpchar", 'N'::"bpchar"]))),
    CONSTRAINT "st_sales_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'annulled'::"text"])))
);


ALTER TABLE "public"."st_sales" OWNER TO "postgres";


COMMENT ON COLUMN "public"."st_sales"."customer_discount_percentage" IS 'Porcentaje de descuento automático del cliente aplicado al momento de la venta.';



COMMENT ON COLUMN "public"."st_sales"."customer_discount_amount" IS 'Monto total descontado por descuento automático del cliente en la venta.';



COMMENT ON COLUMN "public"."st_sales"."subtotal_before_customer_discount" IS 'Subtotal original antes de aplicar descuento automático del cliente.';



ALTER TABLE "public"."st_sales" ALTER COLUMN "sale_number" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."st_sales_sale_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."st_shifts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_profile_id" "uuid" NOT NULL,
    "opened_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "closed_at" timestamp with time zone,
    "opening_amount" numeric(15,2) DEFAULT 0 NOT NULL,
    "closing_amount_declared" numeric(15,2),
    "total_cash_sales" numeric(15,2) DEFAULT 0 NOT NULL,
    "total_digital_sales" numeric(15,2) DEFAULT 0 NOT NULL,
    "total_credit_sales" numeric(15,2) DEFAULT 0 NOT NULL,
    "total_cash_expenses" numeric(15,2) DEFAULT 0 NOT NULL,
    "total_digital_expenses" numeric(15,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "notes" "text",
    "legacy_shift_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "st_shifts_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."st_shifts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."st_subcategories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."st_subcategories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."st_supplier_price_import_temp" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "import_session_id" "uuid" NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "supplier_name_snapshot" "text",
    "source_filename" "text",
    "file_currency" "text" NOT NULL,
    "exchange_rate" numeric(18,6),
    "row_number" integer NOT NULL,
    "excel_code" "text",
    "excel_name" "text",
    "excel_price" numeric(18,6),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "st_supplier_price_import_temp_file_currency_check" CHECK (("file_currency" = ANY (ARRAY['ARS'::"text", 'USD'::"text"])))
);


ALTER TABLE "public"."st_supplier_price_import_temp" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."st_suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "cuit" "text",
    "condicion_iva" "text",
    "email" "text",
    "telefono" "text",
    "contacto" "text",
    "direccion" "text",
    "activo" boolean DEFAULT true NOT NULL,
    "legacy_supplier_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "markup_pct" numeric,
    "tax_1_percent" numeric(10,2) DEFAULT 0,
    "tax_2_percent" numeric(10,2) DEFAULT 0,
    "tax_3_percent" numeric(10,2) DEFAULT 0,
    "tax_4_percent" numeric
);


ALTER TABLE "public"."st_suppliers" OWNER TO "postgres";


COMMENT ON COLUMN "public"."st_suppliers"."tax_4_percent" IS 'Cuarto impuesto del proveedor. Permite valores positivos y negativos';



CREATE TABLE IF NOT EXISTS "public"."st_user_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "nombre" "text" NOT NULL,
    "email" "text",
    "pin" "text" NOT NULL,
    "rol" "text" NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "legacy_user_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "st_user_profiles_rol_check" CHECK (("rol" = ANY (ARRAY['Admin'::"text", 'Vendedor'::"text", 'Cajero'::"text"])))
);


ALTER TABLE "public"."st_user_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."store_incoming_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "purchase_id" "text" NOT NULL,
    "product_name" "text" NOT NULL,
    "total_amount" numeric(14,2) DEFAULT 0 NOT NULL,
    "payment_method" "text",
    "customer_first_name" "text",
    "customer_last_name" "text",
    "customer_address" "text",
    "customer_city" "text",
    "customer_province" "text",
    "shipping_method" "text",
    "customer_email" "text",
    "customer_phone" "text",
    "external_created_at" timestamp with time zone,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "stock_processed" boolean DEFAULT false NOT NULL,
    "processed_at" timestamp with time zone,
    "notes" "text",
    "raw_payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "store_incoming_orders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processed'::"text", 'prepared'::"text", 'delivered'::"text", 'cancelled'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."store_incoming_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplier_invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "invoice_number" "text" NOT NULL,
    "total_amount" numeric DEFAULT 0 NOT NULL,
    "paid" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."supplier_invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplier_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "invoice_id" "uuid",
    "amount" numeric NOT NULL,
    "payment_method" "text",
    "payment_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "note" "text",
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text",
    CONSTRAINT "supplier_payments_amount_check" CHECK (("amount" > (0)::numeric))
);


ALTER TABLE "public"."supplier_payments" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."supplier_account_summary_vw" AS
 SELECT "s"."id" AS "supplier_id",
    "s"."nombre" AS "supplier_nombre",
    COALESCE("sum"(DISTINCT "si"."total_amount") FILTER (WHERE ("si"."id" IS NOT NULL)), (0)::numeric) AS "total_facturado",
    COALESCE("sum"("sp"."amount"), (0)::numeric) AS "total_pagado",
    (COALESCE("sum"(DISTINCT "si"."total_amount") FILTER (WHERE ("si"."id" IS NOT NULL)), (0)::numeric) - COALESCE("sum"("sp"."amount"), (0)::numeric)) AS "saldo_pendiente"
   FROM (("public"."st_suppliers" "s"
     LEFT JOIN "public"."supplier_invoices" "si" ON (("si"."supplier_id" = "s"."id")))
     LEFT JOIN "public"."supplier_payments" "sp" ON (("sp"."supplier_id" = "s"."id")))
  GROUP BY "s"."id", "s"."nombre";


ALTER VIEW "public"."supplier_account_summary_vw" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."supplier_invoice_balance_vw" AS
 SELECT "si"."id" AS "invoice_id",
    "si"."supplier_id",
    "s"."nombre" AS "supplier_nombre",
    "si"."invoice_number",
    "si"."created_at",
    "si"."total_amount",
    COALESCE("sum"("sp"."amount"), (0)::numeric) AS "total_pagado",
    ("si"."total_amount" - COALESCE("sum"("sp"."amount"), (0)::numeric)) AS "saldo_pendiente",
        CASE
            WHEN (COALESCE("sum"("sp"."amount"), (0)::numeric) <= (0)::numeric) THEN 'pendiente'::"text"
            WHEN (COALESCE("sum"("sp"."amount"), (0)::numeric) >= "si"."total_amount") THEN 'pagada'::"text"
            ELSE 'parcial'::"text"
        END AS "estado_pago"
   FROM (("public"."supplier_invoices" "si"
     JOIN "public"."st_suppliers" "s" ON (("s"."id" = "si"."supplier_id")))
     LEFT JOIN "public"."supplier_payments" "sp" ON (("sp"."invoice_id" = "si"."id")))
  GROUP BY "si"."id", "si"."supplier_id", "s"."nombre", "si"."invoice_number", "si"."created_at", "si"."total_amount";


ALTER VIEW "public"."supplier_invoice_balance_vw" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplier_invoice_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "quantity" numeric DEFAULT 0 NOT NULL,
    "cost_price" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."supplier_invoice_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ventas_sistema_viejo_import" (
    "ID_Venta" "text",
    "Fecha" "text",
    "ID_Cliente" "text",
    "Nombre_Cliente" "text",
    "Cant_Productos" "text",
    "Subtotal" "text",
    "Descripcion_Ajuste" "text",
    "Monto_Ajuste" "text",
    "Total" "text",
    "Pago_Efectivo" "text",
    "Pago_Digital" "text",
    "Productos (JSON)" "text",
    "Estado" "text",
    "ID_Turno" "text",
    "Facturacion" "text",
    "Pago_Cuenta_Corriente" "text",
    "Pago_Echeq" "text",
    "Echeq_Dias" "text",
    "Factura_Nro" "text",
    "Factura_CAE" "text",
    "Factura_Vto_CAE" "text",
    "Factura_QR_Data" "text",
    "Factura_Fecha" "text",
    "Factura_URL" "text",
    "Factura_Ticket_URL" "text",
    "NC_Nro" "text",
    "NC_CAE" "text",
    "NC_Vto_CAE" "text",
    "NC_QR_Data" "text",
    "NC_Fecha" "text",
    "NC_URL" "text",
    "NC_Ticket_URL" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ventas_sistema_viejo_import" OWNER TO "postgres";


ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."st_account_transactions"
    ADD CONSTRAINT "st_account_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."st_budget_items"
    ADD CONSTRAINT "st_budget_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."st_budgets"
    ADD CONSTRAINT "st_budgets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."st_categories"
    ADD CONSTRAINT "st_categories_name_unique" UNIQUE ("name");



ALTER TABLE ONLY "public"."st_categories"
    ADD CONSTRAINT "st_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."st_credit_note_items"
    ADD CONSTRAINT "st_credit_note_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."st_credit_notes"
    ADD CONSTRAINT "st_credit_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."st_customers"
    ADD CONSTRAINT "st_customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."st_expenses"
    ADD CONSTRAINT "st_expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."st_pending_sale_items"
    ADD CONSTRAINT "st_pending_sale_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."st_pending_sales"
    ADD CONSTRAINT "st_pending_sales_pending_number_key" UNIQUE ("pending_number");



ALTER TABLE ONLY "public"."st_pending_sales"
    ADD CONSTRAINT "st_pending_sales_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."st_product_kits"
    ADD CONSTRAINT "st_product_kits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."st_product_prices_import"
    ADD CONSTRAINT "st_product_prices_import_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."st_products"
    ADD CONSTRAINT "st_products_cod_unique" UNIQUE ("cod");



ALTER TABLE ONLY "public"."st_products"
    ADD CONSTRAINT "st_products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."st_sale_items"
    ADD CONSTRAINT "st_sale_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."st_sales"
    ADD CONSTRAINT "st_sales_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."st_shifts"
    ADD CONSTRAINT "st_shifts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."st_subcategories"
    ADD CONSTRAINT "st_subcategories_category_id_name_key" UNIQUE ("category_id", "name");



ALTER TABLE ONLY "public"."st_subcategories"
    ADD CONSTRAINT "st_subcategories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."st_supplier_price_import_temp"
    ADD CONSTRAINT "st_supplier_price_import_temp_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."st_suppliers"
    ADD CONSTRAINT "st_suppliers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."st_user_profiles"
    ADD CONSTRAINT "st_user_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."st_user_profiles"
    ADD CONSTRAINT "st_user_profiles_user_id_unique" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."store_incoming_orders"
    ADD CONSTRAINT "store_incoming_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."store_incoming_orders"
    ADD CONSTRAINT "store_incoming_orders_purchase_id_unique" UNIQUE ("purchase_id");



ALTER TABLE ONLY "public"."supplier_invoice_items"
    ADD CONSTRAINT "supplier_invoice_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplier_invoices"
    ADD CONSTRAINT "supplier_invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplier_payments"
    ADD CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."st_product_kits"
    ADD CONSTRAINT "uq_st_product_kits_unique_component" UNIQUE ("kit_product_id", "component_product_id");



CREATE INDEX "idx_account_transactions_customer" ON "public"."st_account_transactions" USING "btree" ("customer_id");



CREATE INDEX "idx_account_transactions_sale" ON "public"."st_account_transactions" USING "btree" ("original_sale_id");



CREATE INDEX "idx_credit_note_items_sale" ON "public"."st_credit_note_items" USING "btree" ("sale_id");



CREATE INDEX "idx_credit_notes_customer" ON "public"."st_credit_notes" USING "btree" ("customer_id");



CREATE INDEX "idx_credit_notes_original_sale" ON "public"."st_credit_notes" USING "btree" ("original_sale_id");



CREATE INDEX "idx_st_budget_items_budget_id" ON "public"."st_budget_items" USING "btree" ("budget_id");



CREATE INDEX "idx_st_budget_items_product_code" ON "public"."st_budget_items" USING "btree" ("product_code");



CREATE INDEX "idx_st_budget_items_product_id" ON "public"."st_budget_items" USING "btree" ("product_id");



CREATE INDEX "idx_st_budgets_budgeted_at" ON "public"."st_budgets" USING "btree" ("budgeted_at");



CREATE INDEX "idx_st_budgets_created_by_user_profile_id" ON "public"."st_budgets" USING "btree" ("created_by_user_profile_id");



CREATE INDEX "idx_st_budgets_customer_id" ON "public"."st_budgets" USING "btree" ("customer_id");



CREATE INDEX "idx_st_budgets_status" ON "public"."st_budgets" USING "btree" ("status");



CREATE INDEX "idx_st_categories_parent_id" ON "public"."st_categories" USING "btree" ("parent_id");



CREATE INDEX "idx_st_customers_full_name" ON "public"."st_customers" USING "btree" ("full_name");



CREATE INDEX "idx_st_customers_iva_condition" ON "public"."st_customers" USING "btree" ("iva_condition");



CREATE INDEX "idx_st_customers_whatsapp" ON "public"."st_customers" USING "btree" ("whatsapp");



CREATE INDEX "idx_st_expenses_shift_id" ON "public"."st_expenses" USING "btree" ("shift_id");



CREATE INDEX "idx_st_expenses_spent_at" ON "public"."st_expenses" USING "btree" ("spent_at");



CREATE INDEX "idx_st_expenses_user_profile_id" ON "public"."st_expenses" USING "btree" ("user_profile_id");



CREATE INDEX "idx_st_pending_sale_items_pending_sale_id" ON "public"."st_pending_sale_items" USING "btree" ("pending_sale_id");



CREATE INDEX "idx_st_pending_sales_cashier_id" ON "public"."st_pending_sales" USING "btree" ("cashier_id");



CREATE INDEX "idx_st_pending_sales_created_at" ON "public"."st_pending_sales" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_st_pending_sales_seller_id" ON "public"."st_pending_sales" USING "btree" ("seller_id");



CREATE INDEX "idx_st_pending_sales_shift_id" ON "public"."st_pending_sales" USING "btree" ("shift_id");



CREATE INDEX "idx_st_pending_sales_status" ON "public"."st_pending_sales" USING "btree" ("status");



CREATE INDEX "idx_st_product_kits_component_product_id" ON "public"."st_product_kits" USING "btree" ("component_product_id");



CREATE INDEX "idx_st_product_kits_kit_product_id" ON "public"."st_product_kits" USING "btree" ("kit_product_id");



CREATE INDEX "idx_st_product_prices_import_barcode" ON "public"."st_product_prices_import" USING "btree" ("barcode");



CREATE INDEX "idx_st_product_prices_import_batch" ON "public"."st_product_prices_import" USING "btree" ("import_batch_id");



CREATE INDEX "idx_st_product_prices_import_cod" ON "public"."st_product_prices_import" USING "btree" ("cod");



CREATE INDEX "idx_st_product_prices_import_processed" ON "public"."st_product_prices_import" USING "btree" ("processed");



CREATE INDEX "idx_st_product_prices_import_producto" ON "public"."st_product_prices_import" USING "btree" ("Producto");



CREATE INDEX "idx_st_product_prices_import_proveedor" ON "public"."st_product_prices_import" USING "btree" ("Proveedor");



CREATE INDEX "idx_st_products_active" ON "public"."st_products" USING "btree" ("is_active");



CREATE INDEX "idx_st_products_barcode" ON "public"."st_products" USING "btree" ("barcode");



CREATE INDEX "idx_st_products_brand" ON "public"."st_products" USING "btree" ("brand");



CREATE INDEX "idx_st_products_category_id" ON "public"."st_products" USING "btree" ("category_id");



CREATE INDEX "idx_st_products_name" ON "public"."st_products" USING "btree" ("name");



CREATE INDEX "idx_st_products_online" ON "public"."st_products" USING "btree" ("is_online");



CREATE INDEX "idx_st_products_supplier_barcode_active_norm" ON "public"."st_products" USING "btree" ("supplier_id", "lower"(TRIM(BOTH FROM "barcode"))) WHERE ((COALESCE("is_deleted", false) = false) AND (COALESCE(TRIM(BOTH FROM "barcode"), ''::"text") <> ''::"text"));



CREATE INDEX "idx_st_products_supplier_cod_active_norm" ON "public"."st_products" USING "btree" ("supplier_id", "lower"(TRIM(BOTH FROM "cod"))) WHERE ((COALESCE("is_deleted", false) = false) AND (COALESCE(TRIM(BOTH FROM "cod"), ''::"text") <> ''::"text"));



CREATE INDEX "idx_st_products_supplier_id" ON "public"."st_products" USING "btree" ("supplier_id");



CREATE INDEX "idx_st_sale_items_product_code" ON "public"."st_sale_items" USING "btree" ("product_code");



CREATE INDEX "idx_st_sale_items_product_id" ON "public"."st_sale_items" USING "btree" ("product_id");



CREATE INDEX "idx_st_sale_items_sale_id" ON "public"."st_sale_items" USING "btree" ("sale_id");



CREATE INDEX "idx_st_sales_customer_id" ON "public"."st_sales" USING "btree" ("customer_id");



CREATE INDEX "idx_st_sales_shift_id" ON "public"."st_sales" USING "btree" ("shift_id");



CREATE INDEX "idx_st_sales_sold_at" ON "public"."st_sales" USING "btree" ("sold_at");



CREATE INDEX "idx_st_sales_status" ON "public"."st_sales" USING "btree" ("status");



CREATE INDEX "idx_st_shifts_opened_at" ON "public"."st_shifts" USING "btree" ("opened_at");



CREATE INDEX "idx_st_shifts_status" ON "public"."st_shifts" USING "btree" ("status");



CREATE INDEX "idx_st_shifts_user_profile_id" ON "public"."st_shifts" USING "btree" ("user_profile_id");



CREATE INDEX "idx_st_subcategories_category_id" ON "public"."st_subcategories" USING "btree" ("category_id");



CREATE UNIQUE INDEX "idx_st_subcategories_category_name_lower" ON "public"."st_subcategories" USING "btree" ("category_id", "lower"("name"));



CREATE INDEX "idx_st_supplier_price_import_temp_code" ON "public"."st_supplier_price_import_temp" USING "btree" ("excel_code");



CREATE INDEX "idx_st_supplier_price_import_temp_session" ON "public"."st_supplier_price_import_temp" USING "btree" ("import_session_id");



CREATE INDEX "idx_st_supplier_price_import_temp_supplier" ON "public"."st_supplier_price_import_temp" USING "btree" ("supplier_id");



CREATE INDEX "idx_st_suppliers_cuit" ON "public"."st_suppliers" USING "btree" ("cuit");



CREATE INDEX "idx_st_suppliers_nombre" ON "public"."st_suppliers" USING "btree" ("nombre");



CREATE INDEX "idx_st_user_profiles_email" ON "public"."st_user_profiles" USING "btree" ("email");



CREATE INDEX "idx_st_user_profiles_nombre" ON "public"."st_user_profiles" USING "btree" ("nombre");



CREATE INDEX "idx_store_incoming_orders_created_at" ON "public"."store_incoming_orders" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_store_incoming_orders_customer_email" ON "public"."store_incoming_orders" USING "btree" ("customer_email");



CREATE INDEX "idx_store_incoming_orders_external_created_at" ON "public"."store_incoming_orders" USING "btree" ("external_created_at" DESC);



CREATE INDEX "idx_store_incoming_orders_purchase_id" ON "public"."store_incoming_orders" USING "btree" ("purchase_id");



CREATE INDEX "idx_store_incoming_orders_status" ON "public"."store_incoming_orders" USING "btree" ("status");



CREATE INDEX "idx_supplier_invoice_items_invoice_id" ON "public"."supplier_invoice_items" USING "btree" ("invoice_id");



CREATE INDEX "idx_supplier_invoice_items_product_id" ON "public"."supplier_invoice_items" USING "btree" ("product_id");



CREATE INDEX "idx_supplier_invoices_created_at" ON "public"."supplier_invoices" USING "btree" ("created_at");



CREATE INDEX "idx_supplier_invoices_supplier_id" ON "public"."supplier_invoices" USING "btree" ("supplier_id");



CREATE INDEX "idx_supplier_payments_invoice_id" ON "public"."supplier_payments" USING "btree" ("invoice_id");



CREATE INDEX "idx_supplier_payments_payment_date" ON "public"."supplier_payments" USING "btree" ("payment_date");



CREATE INDEX "idx_supplier_payments_supplier_id" ON "public"."supplier_payments" USING "btree" ("supplier_id");



CREATE INDEX "idx_temp_import_session_supplier_code" ON "public"."st_supplier_price_import_temp" USING "btree" ("import_session_id", "supplier_id", "lower"("regexp_replace"(TRIM(BOTH FROM COALESCE("excel_code", ''::"text")), '[^a-zA-Z0-9]'::"text", ''::"text", 'g'::"text")));



CREATE INDEX "invoices_created_at_idx" ON "public"."invoices" USING "btree" ("created_at" DESC);



CREATE UNIQUE INDEX "invoices_sale_id_ux" ON "public"."invoices" USING "btree" ("sale_id");



CREATE INDEX "invoices_status_idx" ON "public"."invoices" USING "btree" ("status");



CREATE UNIQUE INDEX "uq_st_budgets_budget_number" ON "public"."st_budgets" USING "btree" ("budget_number");



CREATE UNIQUE INDEX "uq_st_customers_document_number_nonempty" ON "public"."st_customers" USING "btree" ("document_number") WHERE (("document_number" IS NOT NULL) AND ("btrim"("document_number") <> ''::"text"));



CREATE UNIQUE INDEX "uq_st_products_slug_url_nonempty" ON "public"."st_products" USING "btree" ("slug_url") WHERE (("slug_url" IS NOT NULL) AND ("btrim"("slug_url") <> ''::"text"));



CREATE UNIQUE INDEX "uq_st_sales_sale_number" ON "public"."st_sales" USING "btree" ("sale_number");



CREATE UNIQUE INDEX "ux_products_supplier_cod" ON "public"."st_products" USING "btree" ("supplier_id", "upper"(TRIM(BOTH FROM "cod"))) WHERE (("cod" IS NOT NULL) AND (TRIM(BOTH FROM "cod") <> ''::"text") AND (COALESCE("is_deleted", false) = false));



CREATE OR REPLACE TRIGGER "trg_descontar_stock" AFTER INSERT ON "public"."st_sale_items" FOR EACH ROW EXECUTE FUNCTION "public"."descontar_stock_venta"();



CREATE OR REPLACE TRIGGER "trg_invoices_updated_at" BEFORE UPDATE ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_prevent_duplicate_product_codes" BEFORE INSERT OR UPDATE ON "public"."st_products" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_duplicate_product_codes"();



CREATE OR REPLACE TRIGGER "trg_recalculate_st_product_final_price" BEFORE INSERT OR UPDATE OF "cost_price", "supplier_id", "auto_price", "offer_price" ON "public"."st_products" FOR EACH ROW EXECUTE FUNCTION "public"."recalculate_st_product_final_price"();



CREATE OR REPLACE TRIGGER "trg_set_st_pending_sales_updated_at" BEFORE UPDATE ON "public"."st_pending_sales" FOR EACH ROW EXECUTE FUNCTION "public"."set_st_pending_sales_updated_at"();



CREATE OR REPLACE TRIGGER "trg_set_store_incoming_orders_updated_at" BEFORE UPDATE ON "public"."store_incoming_orders" FOR EACH ROW EXECUTE FUNCTION "public"."set_store_incoming_orders_updated_at"();



CREATE OR REPLACE TRIGGER "trg_st_products_auto_hide_zero_stock" BEFORE INSERT OR UPDATE OF "current_stock" ON "public"."st_products" FOR EACH ROW EXECUTE FUNCTION "public"."st_products_auto_hide_zero_stock"();



ALTER TABLE ONLY "public"."st_product_kits"
    ADD CONSTRAINT "fk_st_product_kits_component" FOREIGN KEY ("component_product_id") REFERENCES "public"."st_products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."st_product_kits"
    ADD CONSTRAINT "fk_st_product_kits_kit" FOREIGN KEY ("kit_product_id") REFERENCES "public"."st_products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."st_budget_items"
    ADD CONSTRAINT "st_budget_items_budget_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."st_budgets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."st_budget_items"
    ADD CONSTRAINT "st_budget_items_product_fk" FOREIGN KEY ("product_id") REFERENCES "public"."st_products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."st_budgets"
    ADD CONSTRAINT "st_budgets_converted_sale_fk" FOREIGN KEY ("converted_to_sale_id") REFERENCES "public"."st_sales"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."st_budgets"
    ADD CONSTRAINT "st_budgets_created_by_user_profile_fk" FOREIGN KEY ("created_by_user_profile_id") REFERENCES "public"."st_user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."st_budgets"
    ADD CONSTRAINT "st_budgets_customer_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."st_customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."st_categories"
    ADD CONSTRAINT "st_categories_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."st_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."st_expenses"
    ADD CONSTRAINT "st_expenses_shift_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."st_shifts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."st_pending_sale_items"
    ADD CONSTRAINT "st_pending_sale_items_pending_sale_id_fkey" FOREIGN KEY ("pending_sale_id") REFERENCES "public"."st_pending_sales"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."st_products"
    ADD CONSTRAINT "st_products_category_fk" FOREIGN KEY ("category_id") REFERENCES "public"."st_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."st_products"
    ADD CONSTRAINT "st_products_supplier_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."st_suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."st_sale_items"
    ADD CONSTRAINT "st_sale_items_product_fk" FOREIGN KEY ("product_id") REFERENCES "public"."st_products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."st_sale_items"
    ADD CONSTRAINT "st_sale_items_sale_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."st_sales"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."st_sales"
    ADD CONSTRAINT "st_sales_customer_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."st_customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."st_sales"
    ADD CONSTRAINT "st_sales_shift_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."st_shifts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."st_shifts"
    ADD CONSTRAINT "st_shifts_user_profile_fk" FOREIGN KEY ("user_profile_id") REFERENCES "public"."st_user_profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."st_subcategories"
    ADD CONSTRAINT "st_subcategories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."st_categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_invoice_items"
    ADD CONSTRAINT "supplier_invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."supplier_invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_invoice_items"
    ADD CONSTRAINT "supplier_invoice_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."st_products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."supplier_invoices"
    ADD CONSTRAINT "supplier_invoices_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."st_suppliers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."supplier_payments"
    ADD CONSTRAINT "supplier_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."supplier_invoices"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."supplier_payments"
    ADD CONSTRAINT "supplier_payments_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."st_suppliers"("id") ON DELETE RESTRICT;



CREATE POLICY "Allow delete temp import" ON "public"."st_supplier_price_import_temp" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Allow delete temp import anon" ON "public"."st_supplier_price_import_temp" FOR DELETE TO "anon" USING (true);



CREATE POLICY "Allow insert temp import" ON "public"."st_supplier_price_import_temp" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Allow insert temp import anon" ON "public"."st_supplier_price_import_temp" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "Allow select temp import" ON "public"."st_supplier_price_import_temp" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow select temp import anon" ON "public"."st_supplier_price_import_temp" FOR SELECT TO "anon" USING (true);



CREATE POLICY "anon_insert_st_pending_sale_items" ON "public"."st_pending_sale_items" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "anon_insert_st_pending_sales" ON "public"."st_pending_sales" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "anon_insert_store_incoming_orders" ON "public"."store_incoming_orders" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "anon_select_st_pending_sale_items" ON "public"."st_pending_sale_items" FOR SELECT TO "anon" USING (true);



CREATE POLICY "anon_select_st_pending_sales" ON "public"."st_pending_sales" FOR SELECT TO "anon" USING (true);



CREATE POLICY "anon_select_store_incoming_orders" ON "public"."store_incoming_orders" FOR SELECT TO "anon" USING (true);



CREATE POLICY "anon_update_operational_store_incoming_orders" ON "public"."store_incoming_orders" FOR UPDATE TO "anon" USING (("status" = ANY (ARRAY['pending'::"text", 'processed'::"text", 'prepared'::"text"]))) WITH CHECK (("status" = ANY (ARRAY['pending'::"text", 'processed'::"text", 'prepared'::"text", 'delivered'::"text", 'cancelled'::"text", 'error'::"text"])));



CREATE POLICY "anon_update_st_pending_sale_items" ON "public"."st_pending_sale_items" FOR UPDATE TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon_update_st_pending_sales" ON "public"."st_pending_sales" FOR UPDATE TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "authenticated_insert_st_pending_sale_items" ON "public"."st_pending_sale_items" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "authenticated_insert_st_pending_sales" ON "public"."st_pending_sales" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "authenticated_select_st_pending_sale_items" ON "public"."st_pending_sale_items" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated_select_st_pending_sales" ON "public"."st_pending_sales" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated_select_store_incoming_orders" ON "public"."store_incoming_orders" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated_update_st_pending_sale_items" ON "public"."st_pending_sale_items" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "authenticated_update_st_pending_sales" ON "public"."st_pending_sales" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "authenticated_update_store_incoming_orders" ON "public"."store_incoming_orders" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoices_select_authenticated" ON "public"."invoices" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."st_pending_sale_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."st_pending_sales" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."st_supplier_price_import_temp" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."store_incoming_orders" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."descontar_stock_venta"() TO "anon";
GRANT ALL ON FUNCTION "public"."descontar_stock_venta"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."descontar_stock_venta"() TO "service_role";



GRANT ALL ON FUNCTION "public"."detect_duplicate_sale_movements"() TO "anon";
GRANT ALL ON FUNCTION "public"."detect_duplicate_sale_movements"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."detect_duplicate_sale_movements"() TO "service_role";



GRANT ALL ON FUNCTION "public"."detect_negative_customer_balances"() TO "anon";
GRANT ALL ON FUNCTION "public"."detect_negative_customer_balances"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."detect_negative_customer_balances"() TO "service_role";



GRANT ALL ON FUNCTION "public"."execute_temp_import_price_update"("p_import_session_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."execute_temp_import_price_update"("p_import_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."execute_temp_import_price_update"("p_import_session_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_temp_import_match_summary"("p_import_session_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_temp_import_match_summary"("p_import_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_temp_import_match_summary"("p_import_session_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_duplicate_product_codes"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_duplicate_product_codes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_duplicate_product_codes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."recalculate_st_product_final_price"() TO "anon";
GRANT ALL ON FUNCTION "public"."recalculate_st_product_final_price"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalculate_st_product_final_price"() TO "service_role";



GRANT ALL ON FUNCTION "public"."safe_to_numeric"("txt" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."safe_to_numeric"("txt" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."safe_to_numeric"("txt" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_st_pending_sales_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_st_pending_sales_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_st_pending_sales_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_store_incoming_orders_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_store_incoming_orders_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_store_incoming_orders_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."st_products_auto_hide_zero_stock"() TO "anon";
GRANT ALL ON FUNCTION "public"."st_products_auto_hide_zero_stock"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_products_auto_hide_zero_stock"() TO "service_role";



GRANT ALL ON TABLE "public"."invoices" TO "anon";
GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";



GRANT ALL ON TABLE "public"."st_account_transactions" TO "anon";
GRANT ALL ON TABLE "public"."st_account_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."st_account_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."st_budget_items" TO "anon";
GRANT ALL ON TABLE "public"."st_budget_items" TO "authenticated";
GRANT ALL ON TABLE "public"."st_budget_items" TO "service_role";



GRANT ALL ON TABLE "public"."st_budgets" TO "anon";
GRANT ALL ON TABLE "public"."st_budgets" TO "authenticated";
GRANT ALL ON TABLE "public"."st_budgets" TO "service_role";



GRANT ALL ON SEQUENCE "public"."st_budgets_budget_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."st_budgets_budget_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."st_budgets_budget_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."st_categories" TO "anon";
GRANT ALL ON TABLE "public"."st_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."st_categories" TO "service_role";



GRANT ALL ON TABLE "public"."st_credit_note_items" TO "anon";
GRANT ALL ON TABLE "public"."st_credit_note_items" TO "authenticated";
GRANT ALL ON TABLE "public"."st_credit_note_items" TO "service_role";



GRANT ALL ON TABLE "public"."st_credit_notes" TO "anon";
GRANT ALL ON TABLE "public"."st_credit_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."st_credit_notes" TO "service_role";



GRANT ALL ON TABLE "public"."st_customers" TO "anon";
GRANT ALL ON TABLE "public"."st_customers" TO "authenticated";
GRANT ALL ON TABLE "public"."st_customers" TO "service_role";



GRANT ALL ON TABLE "public"."st_expenses" TO "anon";
GRANT ALL ON TABLE "public"."st_expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."st_expenses" TO "service_role";



GRANT ALL ON TABLE "public"."st_pending_sale_items" TO "anon";
GRANT ALL ON TABLE "public"."st_pending_sale_items" TO "authenticated";
GRANT ALL ON TABLE "public"."st_pending_sale_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."st_pending_sales_pending_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."st_pending_sales_pending_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."st_pending_sales_pending_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."st_pending_sales" TO "anon";
GRANT ALL ON TABLE "public"."st_pending_sales" TO "authenticated";
GRANT ALL ON TABLE "public"."st_pending_sales" TO "service_role";



GRANT ALL ON TABLE "public"."st_product_kits" TO "anon";
GRANT ALL ON TABLE "public"."st_product_kits" TO "authenticated";
GRANT ALL ON TABLE "public"."st_product_kits" TO "service_role";



GRANT ALL ON TABLE "public"."st_product_prices_import" TO "anon";
GRANT ALL ON TABLE "public"."st_product_prices_import" TO "authenticated";
GRANT ALL ON TABLE "public"."st_product_prices_import" TO "service_role";



GRANT ALL ON TABLE "public"."st_products" TO "anon";
GRANT ALL ON TABLE "public"."st_products" TO "authenticated";
GRANT ALL ON TABLE "public"."st_products" TO "service_role";



GRANT ALL ON TABLE "public"."st_products_web_view" TO "anon";
GRANT ALL ON TABLE "public"."st_products_web_view" TO "authenticated";
GRANT ALL ON TABLE "public"."st_products_web_view" TO "service_role";



GRANT ALL ON TABLE "public"."st_sale_items" TO "anon";
GRANT ALL ON TABLE "public"."st_sale_items" TO "authenticated";
GRANT ALL ON TABLE "public"."st_sale_items" TO "service_role";



GRANT ALL ON TABLE "public"."st_sales" TO "anon";
GRANT ALL ON TABLE "public"."st_sales" TO "authenticated";
GRANT ALL ON TABLE "public"."st_sales" TO "service_role";



GRANT ALL ON SEQUENCE "public"."st_sales_sale_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."st_sales_sale_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."st_sales_sale_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."st_shifts" TO "anon";
GRANT ALL ON TABLE "public"."st_shifts" TO "authenticated";
GRANT ALL ON TABLE "public"."st_shifts" TO "service_role";



GRANT ALL ON TABLE "public"."st_subcategories" TO "anon";
GRANT ALL ON TABLE "public"."st_subcategories" TO "authenticated";
GRANT ALL ON TABLE "public"."st_subcategories" TO "service_role";



GRANT ALL ON TABLE "public"."st_supplier_price_import_temp" TO "anon";
GRANT ALL ON TABLE "public"."st_supplier_price_import_temp" TO "authenticated";
GRANT ALL ON TABLE "public"."st_supplier_price_import_temp" TO "service_role";



GRANT ALL ON TABLE "public"."st_suppliers" TO "anon";
GRANT ALL ON TABLE "public"."st_suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."st_suppliers" TO "service_role";



GRANT ALL ON TABLE "public"."st_user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."st_user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."st_user_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."store_incoming_orders" TO "anon";
GRANT ALL ON TABLE "public"."store_incoming_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."store_incoming_orders" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_invoices" TO "anon";
GRANT ALL ON TABLE "public"."supplier_invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_invoices" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_payments" TO "anon";
GRANT ALL ON TABLE "public"."supplier_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_payments" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_account_summary_vw" TO "anon";
GRANT ALL ON TABLE "public"."supplier_account_summary_vw" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_account_summary_vw" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_invoice_balance_vw" TO "anon";
GRANT ALL ON TABLE "public"."supplier_invoice_balance_vw" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_invoice_balance_vw" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_invoice_items" TO "anon";
GRANT ALL ON TABLE "public"."supplier_invoice_items" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_invoice_items" TO "service_role";



GRANT ALL ON TABLE "public"."ventas_sistema_viejo_import" TO "anon";
GRANT ALL ON TABLE "public"."ventas_sistema_viejo_import" TO "authenticated";
GRANT ALL ON TABLE "public"."ventas_sistema_viejo_import" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







