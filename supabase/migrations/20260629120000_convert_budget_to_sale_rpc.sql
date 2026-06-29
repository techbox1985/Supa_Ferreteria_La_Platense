CREATE OR REPLACE FUNCTION public.convert_budget_to_sale(
    p_budget_id uuid,
    p_cashier_profile_id uuid,
    p_shift_id uuid,
    p_payment_cash numeric DEFAULT 0,
    p_payment_digital numeric DEFAULT 0,
    p_payment_credit numeric DEFAULT 0,
    p_invoice_type text DEFAULT 'N'
)
RETURNS TABLE(
    sale_id uuid,
    sale_number bigint,
    total numeric,
    status text,
    message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_budget st_budgets%ROWTYPE;
    v_shift st_shifts%ROWTYPE;
    v_sale_id uuid;
    v_sale_number bigint;
    v_payment_total numeric;
    v_invoice_type bpchar(1);
    v_customer_id uuid;
    v_items_count integer;
    v_insufficient_product_name text;
    v_insufficient_stock numeric;
    v_required_stock numeric;
BEGIN
    IF p_budget_id IS NULL THEN
        RAISE EXCEPTION 'Debe indicar un presupuesto válido.';
    END IF;

    IF p_shift_id IS NULL THEN
        RAISE EXCEPTION 'Debe indicar un turno activo.';
    END IF;

    SELECT *
    INTO v_budget
    FROM st_budgets
    WHERE id = p_budget_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No se encontró el presupuesto solicitado.';
    END IF;

    IF v_budget.converted_to_sale_id IS NOT NULL OR lower(coalesce(v_budget.status, '')) = 'converted' THEN
        RAISE EXCEPTION 'El presupuesto ya fue convertido a venta.';
    END IF;

    IF lower(coalesce(v_budget.status, '')) NOT IN ('pending', 'approved') THEN
        RAISE EXCEPTION 'El presupuesto no está en estado convertible (%).', coalesce(v_budget.status, 'sin estado');
    END IF;

    SELECT *
    INTO v_shift
    FROM st_shifts
    WHERE id = p_shift_id;

    IF NOT FOUND OR lower(coalesce(v_shift.status, '')) <> 'open' THEN
        RAISE EXCEPTION 'Caja no abierta: el turno indicado no está activo.';
    END IF;

    IF p_cashier_profile_id IS NOT NULL AND v_shift.user_profile_id IS DISTINCT FROM p_cashier_profile_id THEN
        RAISE EXCEPTION 'Caja no abierta para este cajero: el turno activo no corresponde al usuario actual.';
    END IF;

    v_payment_total :=
        coalesce(p_payment_cash, 0) +
        coalesce(p_payment_digital, 0) +
        coalesce(p_payment_credit, 0);

    IF abs(v_payment_total - coalesce(v_budget.total, 0)) > 0.01 THEN
        RAISE EXCEPTION 'El total de pagos (%) no coincide con el total del presupuesto (%).',
            round(v_payment_total, 2),
            round(coalesce(v_budget.total, 0), 2);
    END IF;

    v_customer_id := v_budget.customer_id;

    IF v_customer_id IS NULL THEN
        SELECT c.id
        INTO v_customer_id
        FROM st_customers c
        WHERE lower(trim(coalesce(c.full_name, ''))) = 'consumidor final'
        ORDER BY c.created_at ASC
        LIMIT 1;

        IF v_customer_id IS NULL THEN
            INSERT INTO st_customers (
                full_name,
                iva_condition,
                current_debt,
                total_payments,
                created_at,
                updated_at
            )
            VALUES (
                'Consumidor Final',
                'Consumidor Final',
                0,
                0,
                now(),
                now()
            )
            RETURNING id INTO v_customer_id;
        END IF;
    END IF;

    IF v_customer_id IS NULL THEN
        RAISE EXCEPTION 'No se pudo resolver el cliente para la venta.';
    END IF;

    SELECT count(*)
    INTO v_items_count
    FROM st_budget_items bi
    WHERE bi.budget_id = p_budget_id;

    IF coalesce(v_items_count, 0) = 0 THEN
        RAISE EXCEPTION 'El presupuesto no tiene ítems para convertir.';
    END IF;

    SELECT
        bi.product_name_snapshot,
        coalesce(sp.current_stock, 0),
        coalesce(bi.quantity, 0)
    INTO
        v_insufficient_product_name,
        v_insufficient_stock,
        v_required_stock
    FROM st_budget_items bi
    JOIN st_products sp ON sp.id = bi.product_id
    WHERE bi.budget_id = p_budget_id
      AND bi.product_id IS NOT NULL
      AND coalesce(sp.current_stock, 0) < coalesce(bi.quantity, 0)
    ORDER BY bi.product_name_snapshot
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'Stock insuficiente para "%": disponible %, requerido %.',
            coalesce(v_insufficient_product_name, 'Producto'),
            round(coalesce(v_insufficient_stock, 0), 2),
            round(coalesce(v_required_stock, 0), 2);
    END IF;

    v_invoice_type := upper(left(coalesce(nullif(trim(p_invoice_type), ''), 'N'), 1));
    IF v_invoice_type NOT IN ('A', 'B', 'C', 'N') THEN
        v_invoice_type := 'N';
    END IF;

    INSERT INTO st_sales (
        sold_at,
        customer_id,
        shift_id,
        subtotal,
        adjustment_amount,
        total,
        payment_cash,
        payment_digital,
        payment_credit,
        invoice_type,
        status,
        customer_name_snapshot,
        customer_document_snapshot,
        notes,
        created_at,
        updated_at,
        customer_discount_percentage,
        customer_discount_amount,
        subtotal_before_customer_discount
    )
    VALUES (
        now(),
        v_customer_id,
        p_shift_id,
        coalesce(v_budget.subtotal, 0),
        coalesce(v_budget.adjustment_amount, 0),
        coalesce(v_budget.total, 0),
        coalesce(p_payment_cash, 0),
        coalesce(p_payment_digital, 0),
        coalesce(p_payment_credit, 0),
        v_invoice_type,
        'active',
        coalesce(v_budget.customer_name_snapshot, 'Consumidor Final'),
        v_budget.customer_document_snapshot,
        v_budget.notes,
        now(),
        now(),
        0,
        0,
        NULL
    )
    RETURNING id, sale_number
    INTO v_sale_id, v_sale_number;

    INSERT INTO st_sale_items (
        sale_id,
        product_id,
        product_code,
        product_name_snapshot,
        quantity,
        unit_price,
        line_total,
        created_at
    )
    SELECT
        v_sale_id,
        coalesce(bi.product_id, sp_by_code.id),
        bi.product_code,
        bi.product_name_snapshot,
        coalesce(bi.quantity, 0),
        coalesce(bi.unit_price, 0),
        coalesce(bi.line_total, 0),
        now()
    FROM st_budget_items bi
    LEFT JOIN st_products sp_by_code
      ON bi.product_id IS NULL
     AND bi.product_code IS NOT NULL
     AND sp_by_code.cod = bi.product_code
    WHERE bi.budget_id = p_budget_id;

    IF coalesce(p_payment_credit, 0) > 0 THEN
        INSERT INTO st_account_transactions (
            customer_id,
            date,
            type,
            description,
            debit,
            credit,
            original_sale_id,
            shift_id,
            items,
            factura_info,
            created_at,
            payment_method
        )
        VALUES (
            v_customer_id,
            now(),
            'Venta',
            'Venta generada desde presupuesto',
            coalesce(p_payment_credit, 0),
            0,
            v_sale_id,
            p_shift_id,
            NULL,
            NULL,
            now(),
            'cuenta_corriente'
        );
    END IF;

    UPDATE st_budgets
    SET
        status = 'converted',
        converted_to_sale_id = v_sale_id,
        updated_at = now()
    WHERE id = p_budget_id;

    RETURN QUERY
    SELECT
        v_sale_id,
        v_sale_number,
        coalesce(v_budget.total, 0),
        'success'::text,
        'Presupuesto convertido correctamente.'::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.convert_budget_to_sale(uuid, uuid, uuid, numeric, numeric, numeric, text) TO anon;
GRANT EXECUTE ON FUNCTION public.convert_budget_to_sale(uuid, uuid, uuid, numeric, numeric, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_budget_to_sale(uuid, uuid, uuid, numeric, numeric, numeric, text) TO service_role;
