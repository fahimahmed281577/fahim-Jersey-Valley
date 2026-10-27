-- ============================================================================
-- JERSEY VALLEY — SUPABASE POSTGRESQL SCHEMA & ATOMIC TRANSACTION MIGRATION
-- File: supabase/migrations/0001_jersey_valley_schema.sql
-- Target: Supabase PostgreSQL 15+ (Public Schema)
-- ============================================================================
-- Key Guarantees:
--   1. Idempotent DDL (CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS)
--      and non-destructive seed data (ON CONFLICT DO NOTHING).
--   2. Cash on Delivery (COD) enforced as the sole customer payment method.
--   3. Row-level locking (FOR UPDATE) in PL/pgSQL functions for atomic stock
--      reservation, order creation, idempotency, and order cancellation.
--   4. Row Level Security (RLS) enabled on all tables so sensitive customer
--      orders, tokens, stock logs, and admin records are accessible only to
--      the Express backend via server-only credentials.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. STORE SETTINGS (SINGLETON ROW: id = 'global')
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_settings (
  id TEXT PRIMARY KEY DEFAULT 'global' CHECK (id = 'global'),
  announcement_text TEXT NOT NULL CHECK (char_length(announcement_text) BETWEEN 5 AND 240),
  inside_dhaka_shipping_bdt INTEGER NOT NULL DEFAULT 70 CHECK (inside_dhaka_shipping_bdt BETWEEN 0 AND 1000),
  outside_dhaka_shipping_bdt INTEGER NOT NULL DEFAULT 130 CHECK (outside_dhaka_shipping_bdt BETWEEN 0 AND 2000),
  free_shipping_threshold_bdt INTEGER NOT NULL DEFAULT 3000 CHECK (free_shipping_threshold_bdt BETWEEN 0 AND 50000),
  bkash_merchant_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  nagad_merchant_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  return_window_days INTEGER NOT NULL DEFAULT 7 CHECK (return_window_days BETWEEN 1 AND 90),
  support_phone TEXT NOT NULL DEFAULT '01711-000000',
  support_email TEXT NOT NULL DEFAULT 'support@jerseyvalley.com.bd',
  store_address TEXT NOT NULL DEFAULT 'Panthapath, Dhaka 1215, Bangladesh',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2. PRODUCTS CATALOG
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.products (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  team TEXT NOT NULL,
  country_or_league TEXT NOT NULL DEFAULT 'International / Club',
  category TEXT NOT NULL CHECK (category IN ('national', 'club', 'retro')),
  kit_type TEXT NOT NULL CHECK (kit_type IN ('Home', 'Away', 'Third', 'Retro', 'Special')),
  edition_tier TEXT NOT NULL CHECK (edition_tier IN ('Fan Replica', 'Player Fit Replica', 'Heritage Retro Replica')),
  gender TEXT NOT NULL DEFAULT 'Unisex' CHECK (gender IN ('Men', 'Women', 'Kids', 'Unisex')),
  season TEXT NOT NULL DEFAULT '2025/26',
  price_bdt INTEGER NOT NULL CHECK (price_bdt BETWEEN 300 AND 25000),
  sale_price_bdt INTEGER NULL CHECK (sale_price_bdt IS NULL OR (sale_price_bdt >= 200 AND sale_price_bdt < price_bdt)),
  custom_print_price_bdt INTEGER NOT NULL DEFAULT 350 CHECK (custom_print_price_bdt BETWEEN 0 AND 5000),
  description TEXT NOT NULL,
  fabric_spec TEXT NOT NULL,
  fit_note TEXT NOT NULL,
  care_instructions TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  featured_rank INTEGER NOT NULL DEFAULT 99,
  primary_image TEXT NULL,
  responsive_image_base TEXT NULL,
  image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  visual JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_category_active
  ON public.products (category, is_active, featured_rank);

CREATE INDEX IF NOT EXISTS idx_products_featured_rank
  ON public.products (featured_rank ASC);

-- ----------------------------------------------------------------------------
-- 3. PRODUCT VARIANTS (SIZE-SPECIFIC INVENTORY & SKU)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_variants (
  id BIGSERIAL PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  size TEXT NOT NULL CHECK (size IN ('S', 'M', 'L', 'XL', 'XXL')),
  sku TEXT NOT NULL UNIQUE,
  price_bdt INTEGER NOT NULL CHECK (price_bdt BETWEEN 300 AND 25000),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock BETWEEN 0 AND 5000),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  chest_inches TEXT NOT NULL DEFAULT '39–40"',
  length_inches TEXT NOT NULL DEFAULT '28"',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_product_variants_product_size UNIQUE (product_id, size)
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product_id
  ON public.product_variants (product_id);

CREATE INDEX IF NOT EXISTS idx_product_variants_low_stock
  ON public.product_variants (stock)
  WHERE is_active = TRUE AND stock <= 5;

-- ----------------------------------------------------------------------------
-- 4. COUPONS & PROMOTIONAL DISCOUNTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coupons (
  code TEXT PRIMARY KEY CHECK (code ~ '^[A-Z0-9_-]{3,20}$'),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 4 AND 160),
  discount_type TEXT NOT NULL CHECK (discount_type IN ('PERCENTAGE', 'FIXED_BDT')),
  value INTEGER NOT NULL CHECK (value > 0),
  min_subtotal_bdt INTEGER NOT NULL DEFAULT 0 CHECK (min_subtotal_bdt BETWEEN 0 AND 100000),
  max_discount_bdt INTEGER NULL CHECK (max_discount_bdt IS NULL OR (max_discount_bdt BETWEEN 10 AND 25000)),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 5. ORDERS (CASH ON DELIVERY ONLY FOR CUSTOMER CHECKOUT)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,
  order_access_token TEXT NOT NULL,
  is_demo_order BOOLEAN NOT NULL DEFAULT FALSE,
  user_id TEXT NULL,
  customer_name TEXT NOT NULL CHECK (char_length(customer_name) BETWEEN 2 AND 80),
  customer_phone TEXT NOT NULL CHECK (customer_phone ~ '^01[3-9][0-9]{8}$'),
  customer_email TEXT NOT NULL DEFAULT '',
  division TEXT NOT NULL,
  district TEXT NOT NULL,
  upazila TEXT NOT NULL,
  street_address TEXT NOT NULL CHECK (char_length(street_address) BETWEEN 4 AND 200),
  postal_code TEXT NOT NULL DEFAULT '',
  delivery_notes TEXT NOT NULL DEFAULT '',
  payment_method TEXT NOT NULL DEFAULT 'COD' CHECK (payment_method = 'COD'),
  payment_status TEXT NOT NULL DEFAULT 'UNPAID_COD' CHECK (
    payment_status IN ('UNPAID_COD', 'PENDING_VERIFICATION', 'VERIFIED', 'REFUNDED')
  ),
  order_status TEXT NOT NULL DEFAULT 'PENDING_CONFIRMATION' CHECK (
    order_status IN (
      'PENDING_CONFIRMATION',
      'CONFIRMED',
      'PROCESSING',
      'SHIPPED',
      'DELIVERED',
      'CANCELLED'
    )
  ),
  item_count INTEGER NOT NULL CHECK (item_count >= 1),
  subtotal_bdt INTEGER NOT NULL CHECK (subtotal_bdt >= 0),
  customization_total_bdt INTEGER NOT NULL DEFAULT 0 CHECK (customization_total_bdt >= 0),
  discount_bdt INTEGER NOT NULL DEFAULT 0 CHECK (discount_bdt >= 0),
  applied_coupon_code TEXT NULL REFERENCES public.coupons(code) ON UPDATE CASCADE ON DELETE SET NULL,
  shipping_bdt INTEGER NOT NULL DEFAULT 0 CHECK (shipping_bdt >= 0),
  shipping_zone_label TEXT NOT NULL,
  total_bdt INTEGER NOT NULL CHECK (total_bdt >= 0),
  status_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_created_at
  ON public.orders (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_user_id
  ON public.orders (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_customer_phone
  ON public.orders (customer_phone, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_status
  ON public.orders (order_status, payment_status)
  WHERE is_demo_order = FALSE;

-- ----------------------------------------------------------------------------
-- 6. ORDER ITEMS (NORMALIZED SNAPSHOT OF PURCHASED JERSEYS)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_items (
  id BIGSERIAL PRIMARY KEY,
  order_number TEXT NOT NULL REFERENCES public.orders(order_number) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  slug TEXT NOT NULL,
  product_name TEXT NOT NULL,
  team TEXT NOT NULL,
  edition_tier TEXT NOT NULL,
  size TEXT NOT NULL CHECK (size IN ('S', 'M', 'L', 'XL', 'XXL')),
  sku TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  base_unit_price_bdt INTEGER NOT NULL CHECK (base_unit_price_bdt >= 0),
  custom_name TEXT NOT NULL DEFAULT '',
  custom_number TEXT NOT NULL DEFAULT '',
  has_custom_print BOOLEAN NOT NULL DEFAULT FALSE,
  custom_print_unit_fee_bdt INTEGER NOT NULL DEFAULT 0 CHECK (custom_print_unit_fee_bdt >= 0),
  final_unit_price_bdt INTEGER NOT NULL CHECK (final_unit_price_bdt >= 0),
  line_total_bdt INTEGER NOT NULL CHECK (line_total_bdt >= 0)
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_number
  ON public.order_items (order_number);

-- ----------------------------------------------------------------------------
-- 7. ORDER IDEMPOTENCY KEYS (PREVENTS DUPLICATE SUBMISSIONS)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_idempotency_keys (
  idempotency_key TEXT PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE REFERENCES public.orders(order_number) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 8. STOCK ADJUSTMENT LOGS (AUDIT TRAIL FOR INVENTORY CHANGES)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_adjustment_logs (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  size TEXT NOT NULL CHECK (size IN ('S', 'M', 'L', 'XL', 'XXL')),
  previous_stock INTEGER NOT NULL CHECK (previous_stock >= 0),
  new_stock INTEGER NOT NULL CHECK (new_stock >= 0),
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  actor_uid TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_adjustment_logs_created_at
  ON public.stock_adjustment_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_adjustment_logs_product_id
  ON public.stock_adjustment_logs (product_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 9. CUSTOMER PROFILES (OPTIONAL SAVED ADDRESS & WISHLIST)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_profiles (
  uid TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  division TEXT NOT NULL DEFAULT 'Dhaka',
  district TEXT NOT NULL DEFAULT 'Dhaka',
  upazila TEXT NOT NULL DEFAULT '',
  street_address TEXT NOT NULL DEFAULT '',
  postal_code TEXT NOT NULL DEFAULT '',
  wishlist_product_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 10. ADMINISTRATOR AUTHORIZATION ALLOWLIST
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_users (
  admin_id TEXT PRIMARY KEY,
  email TEXT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'super_admin')),
  auth_mode TEXT NOT NULL DEFAULT 'standalone' CHECK (auth_mode IN ('standalone', 'oauth')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 11. ROW LEVEL SECURITY (RLS) & LEAST-PRIVILEGE PERMISSIONS
-- ----------------------------------------------------------------------------
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_adjustment_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Public read-only policies for storefront catalog & shipping settings
DROP POLICY IF EXISTS "Public read store_settings" ON public.store_settings;
CREATE POLICY "Public read store_settings"
  ON public.store_settings
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Public read products" ON public.products;
CREATE POLICY "Public read products"
  ON public.products
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Public read product_variants" ON public.product_variants;
CREATE POLICY "Public read product_variants"
  ON public.product_variants
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Public read active coupons" ON public.coupons;
CREATE POLICY "Public read active coupons"
  ON public.coupons
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- Note: orders, order_items, order_idempotency_keys, stock_adjustment_logs,
-- customer_profiles, and admin_users have NO anon/authenticated policies.
-- They are accessed exclusively by the Express backend using server-only
-- database credentials (service_role / direct postgres pool).

-- ----------------------------------------------------------------------------
-- 12. ATOMIC PL/pgSQL FUNCTIONS FOR STOCK RESERVATION & ORDER LIFECYCLE
-- ----------------------------------------------------------------------------

-- 12.1 Atomic Stock Adjustment + Audit Log
CREATE OR REPLACE FUNCTION public.jv_adjust_variant_stock_atomic(
  p_log_id TEXT,
  p_product_id TEXT,
  p_size TEXT,
  p_next_stock INTEGER DEFAULT NULL,
  p_next_price_bdt INTEGER DEFAULT NULL,
  p_reason TEXT DEFAULT 'Manual admin inventory adjustment',
  p_actor_uid TEXT DEFAULT 'admin',
  p_actor_email TEXT DEFAULT 'admin'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product public.products%ROWTYPE;
  v_variant public.product_variants%ROWTYPE;
  v_prev_stock INTEGER;
  v_final_stock INTEGER;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  SELECT * INTO v_product
  FROM public.products
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND: Product % not found.', p_product_id;
  END IF;

  SELECT * INTO v_variant
  FROM public.product_variants
  WHERE product_id = p_product_id AND size = p_size
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VARIANT_NOT_FOUND: Variant size % not found for product %.', p_size, p_product_id;
  END IF;

  v_prev_stock := v_variant.stock;
  v_final_stock := COALESCE(p_next_stock, v_variant.stock);

  IF v_final_stock < 0 OR v_final_stock > 5000 THEN
    RAISE EXCEPTION 'INVALID_STOCK: Stock must be between 0 and 5000.';
  END IF;

  UPDATE public.product_variants
  SET
    stock = v_final_stock,
    price_bdt = COALESCE(p_next_price_bdt, price_bdt),
    updated_at = v_now
  WHERE id = v_variant.id;

  UPDATE public.products
  SET
    price_bdt = COALESCE(p_next_price_bdt, price_bdt),
    updated_at = v_now
  WHERE id = p_product_id;

  IF v_final_stock <> v_prev_stock THEN
    INSERT INTO public.stock_adjustment_logs (
      id,
      product_id,
      product_name,
      size,
      previous_stock,
      new_stock,
      delta,
      reason,
      actor_uid,
      actor_email,
      created_at
    ) VALUES (
      p_log_id,
      p_product_id,
      v_product.name,
      p_size,
      v_prev_stock,
      v_final_stock,
      v_final_stock - v_prev_stock,
      LEFT(TRIM(COALESCE(p_reason, 'Manual admin inventory adjustment')), 160),
      COALESCE(p_actor_uid, 'admin'),
      COALESCE(p_actor_email, 'admin'),
      v_now
    );
  END IF;

  RETURN jsonb_build_object(
    'productId', p_product_id,
    'size', p_size,
    'previousStock', v_prev_stock,
    'newStock', v_final_stock
  );
END;
$$;

-- 12.2 Atomic Cash on Delivery Order Creation + Stock Reservation + Idempotency Lock
CREATE OR REPLACE FUNCTION public.jv_create_order_atomic(
  p_idempotency_key TEXT,
  p_order JSONB,
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_order_id TEXT;
  v_order_id TEXT := p_order->>'id';
  v_item JSONB;
  v_product_id TEXT;
  v_size TEXT;
  v_qty INTEGER;
  v_variant public.product_variants%ROWTYPE;
  v_product public.products%ROWTYPE;
BEGIN
  -- 1. Check idempotency key first
  IF p_idempotency_key IS NOT NULL AND LENGTH(TRIM(p_idempotency_key)) >= 8 THEN
    SELECT order_id INTO v_existing_order_id
    FROM public.order_idempotency_keys
    WHERE idempotency_key = TRIM(p_idempotency_key)
    FOR UPDATE;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'deduplicated', TRUE,
        'orderId', v_existing_order_id
      );
    END IF;
  END IF;

  -- 2. Lock and verify stock for every variant in the order
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := v_item->>'productId';
    v_size := v_item->>'size';
    v_qty := (v_item->>'quantity')::INTEGER;

    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_product_id AND is_active = TRUE
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRODUCT_UNAVAILABLE: Product % is unavailable.', v_product_id;
    END IF;

    SELECT * INTO v_variant
    FROM public.product_variants
    WHERE product_id = v_product_id AND size = v_size
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'VARIANT_UNAVAILABLE: Size % is unavailable for %.', v_size, v_product.name;
    END IF;

    IF v_variant.stock < v_qty THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK: Insufficient stock for % (Size %). Only % remaining.',
        v_product.name, v_size, v_variant.stock;
    END IF;

    UPDATE public.product_variants
    SET
      stock = stock - v_qty,
      updated_at = NOW()
    WHERE id = v_variant.id;
  END LOOP;

  -- 3. Insert order header (Cash on Delivery enforced by CHECK constraint)
  INSERT INTO public.orders (
    id,
    created_at,
    updated_at,
    user_id,
    is_demo,
    customer_full_name,
    customer_phone,
    customer_email,
    shipping_division,
    shipping_district,
    shipping_thana_or_upazila,
    shipping_address_line,
    shipping_landmark,
    delivery_zone,
    payment_method,
    payment_reference,
    payment_sender_phone,
    order_status,
    payment_status,
    subtotal_bdt,
    custom_print_total_bdt,
    coupon_code,
    discount_bdt,
    shipping_bdt,
    total_bdt,
    estimated_delivery_window,
    idempotency_key,
    status_history
  ) VALUES (
    v_order_id,
    COALESCE((p_order->>'createdAt')::TIMESTAMPTZ, NOW()),
    COALESCE((p_order->>'createdAt')::TIMESTAMPTZ, NOW()),
    NULLIF(p_order->>'userId', ''),
    COALESCE((p_order->>'isDemo')::BOOLEAN, FALSE),
    p_order->'customer'->>'fullName',
    p_order->'customer'->>'phone',
    NULLIF(p_order->'customer'->>'email', ''),
    p_order->'customer'->>'division',
    p_order->'customer'->>'district',
    p_order->'customer'->>'thanaOrUpazila',
    p_order->'customer'->>'addressLine',
    NULLIF(p_order->'customer'->>'landmark', ''),
    p_order->'customer'->>'deliveryZone',
    'COD',
    NULL,
    NULL,
    COALESCE(p_order->>'orderStatus', 'CONFIRMED'),
    COALESCE(p_order->>'paymentStatus', 'UNPAID_COD'),
    (p_order->>'subtotalBdt')::INTEGER,
    (p_order->>'customPrintTotalBdt')::INTEGER,
    NULLIF(p_order->>'couponCode', ''),
    (p_order->>'discountBdt')::INTEGER,
    (p_order->>'shippingBdt')::INTEGER,
    (p_order->>'totalBdt')::INTEGER,
    p_order->>'estimatedDeliveryWindow',
    NULLIF(TRIM(COALESCE(p_idempotency_key, '')), ''),
    COALESCE(p_order->'statusHistory', '[]'::JSONB)
  );

  -- 4. Insert line items
  INSERT INTO public.order_items (
    order_id,
    line_index,
    product_id,
    product_slug,
    product_name,
    team,
    edition_tier,
    size,
    quantity,
    unit_base_price_bdt,
    custom_print_enabled,
    custom_name,
    custom_number,
    unit_custom_print_price_bdt,
    unit_total_bdt,
    line_total_bdt
  )
  SELECT
    v_order_id,
    (ORDINALITY - 1)::INTEGER,
    item->>'productId',
    item->>'productSlug',
    item->>'productName',
    item->>'team',
    item->>'editionTier',
    item->>'size',
    (item->>'quantity')::INTEGER,
    (item->>'unitBasePriceBdt')::INTEGER,
    COALESCE((item->'customPrint'->>'enabled')::BOOLEAN, FALSE),
    NULLIF(item->'customPrint'->>'name', ''),
    NULLIF(item->'customPrint'->>'number', ''),
    (item->>'unitCustomPrintPriceBdt')::INTEGER,
    (item->>'unitTotalBdt')::INTEGER,
    (item->>'lineTotalBdt')::INTEGER
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(item, ORDINALITY);

  -- 5. Record idempotency key
  IF p_idempotency_key IS NOT NULL AND LENGTH(TRIM(p_idempotency_key)) >= 8 THEN
    INSERT INTO public.order_idempotency_keys (
      idempotency_key,
      order_id,
      created_at
    ) VALUES (
      TRIM(p_idempotency_key),
      v_order_id,
      NOW()
    );
  END IF;

  RETURN jsonb_build_object(
    'deduplicated', FALSE,
    'orderId', v_order_id
  );
END;
$$;

-- 12.3 Atomic Order Cancellation + Automatic Stock Restoration + Audit Log
CREATE OR REPLACE FUNCTION public.jv_cancel_order_atomic(
  p_order_id TEXT,
  p_reason TEXT,
  p_actor_uid TEXT DEFAULT 'customer_or_admin',
  p_actor_email TEXT DEFAULT 'system'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_item public.order_items%ROWTYPE;
  v_variant public.product_variants%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
  v_next_payment_status TEXT;
  v_history_entry JSONB;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = UPPER(TRIM(p_order_id))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: Order % not found.', p_order_id;
  END IF;

  IF v_order.order_status IN ('SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURN_REQUESTED', 'RETURNED') THEN
    RAISE EXCEPTION 'ORDER_NOT_CANCELLABLE: Order cannot be cancelled once it is in % status.', v_order.order_status;
  END IF;

  -- Restore stock for each order line item
  FOR v_item IN
    SELECT * FROM public.order_items
    WHERE order_id = v_order.id
    ORDER BY line_index ASC
  LOOP
    SELECT * INTO v_variant
    FROM public.product_variants
    WHERE product_id = v_item.product_id AND size = v_item.size
    FOR UPDATE;

    IF FOUND THEN
      UPDATE public.product_variants
      SET
        stock = LEAST(5000, stock + v_item.quantity),
        updated_at = v_now
      WHERE id = v_variant.id;

      INSERT INTO public.stock_adjustment_logs (
        id,
        product_id,
        product_name,
        size,
        previous_stock,
        new_stock,
        delta,
        reason,
        actor_uid,
        actor_email,
        created_at
      ) VALUES (
        'STK-CANCEL-' || v_order.id || '-' || v_item.line_index::TEXT,
        v_item.product_id,
        v_item.product_name,
        v_item.size,
        v_variant.stock,
        LEAST(5000, v_variant.stock + v_item.quantity),
        v_item.quantity,
        LEFT('Restored stock from cancelled order ' || v_order.id || ': ' || COALESCE(p_reason, 'Order cancelled'), 160),
        COALESCE(p_actor_uid, 'system'),
        COALESCE(p_actor_email, 'system'),
        v_now
      )
      ON CONFLICT (id) DO NOTHING;
    END IF;
  END LOOP;

  v_next_payment_status := CASE
    WHEN v_order.payment_status = 'VERIFIED' THEN 'REFUNDED'
    ELSE v_order.payment_status
  END;

  v_history_entry := jsonb_build_object(
    'status', 'CANCELLED',
    'timestamp', to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'note', LEFT('Order cancelled and reserved stock restored: ' || COALESCE(p_reason, 'Cancelled'), 240)
  );

  UPDATE public.orders
  SET
    order_status = 'CANCELLED',
    payment_status = v_next_payment_status,
    status_history = COALESCE(status_history, '[]'::JSONB) || jsonb_build_array(v_history_entry),
    updated_at = v_now
  WHERE id = v_order.id;

  RETURN jsonb_build_object(
    'orderId', v_order.id,
    'orderStatus', 'CANCELLED',
    'paymentStatus', v_next_payment_status
  );
END;
$$;

-- Restrict execution of SECURITY DEFINER transaction functions to service_role / postgres only
REVOKE ALL ON FUNCTION public.jv_adjust_variant_stock_atomic(TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.jv_create_order_atomic(TEXT, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.jv_cancel_order_atomic(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 13. INITIAL SEED DATA (NON-DESTRUCTIVE: ON CONFLICT DO NOTHING)
-- ----------------------------------------------------------------------------

-- 13.1 Store Settings
INSERT INTO public.store_settings (
  id,
  announcement_text,
  inside_dhaka_shipping_bdt,
  outside_dhaka_shipping_bdt,
  free_shipping_threshold_bdt,
  bkash_merchant_enabled,
  nagad_merchant_enabled,
  return_window_days,
  support_phone,
  support_email,
  store_address,
  updated_at
) VALUES (
  'global',
  'Nationwide Cash on Delivery across Bangladesh · Inside Dhaka ৳70 · Outside Dhaka ৳130 · Free Delivery on Orders ৳3,000+',
  70,
  130,
  3000,
  FALSE,
  FALSE,
  7,
  '01711-000000',
  'support@jerseyvalley.com.bd',
  'Panthapath, Dhaka 1215, Bangladesh',
  '2026-10-25T04:00:00.000Z'::timestamptz
)
ON CONFLICT (id) DO NOTHING;

-- 13.2 Standalone Admin Record (jvadmin)
INSERT INTO public.admin_users (
  admin_id,
  email,
  role,
  auth_mode,
  is_active
) VALUES (
  'jvadmin',
  NULL,
  'super_admin',
  'standalone',
  TRUE
)
ON CONFLICT (admin_id) DO NOTHING;

-- 13.3 Initial Coupons
INSERT INTO public.coupons (
  code,
  description,
  discount_type,
  value,
  min_subtotal_bdt,
  max_discount_bdt,
  is_active
) VALUES
  ('VALLEY10', '10% off on orders of ৳1,500 or more (up to ৳500 discount)', 'PERCENTAGE', 10, 1500, 500, TRUE),
  ('DHAKA60', 'Flat ৳60 off on orders of ৳1,200 or more', 'FIXED_BDT', 60, 1200, NULL, TRUE),
  ('MATCHDAY200', 'Flat ৳200 off when ordering 2+ jerseys (min subtotal ৳2,600)', 'FIXED_BDT', 200, 2600, NULL, TRUE)
ON CONFLICT (code) DO NOTHING;

-- 13.4 Initial 10 Products
INSERT INTO public.products (
  id, slug, name, team, country_or_league, category, kit_type, edition_tier, gender, season,
  price_bdt, sale_price_bdt, custom_print_price_bdt, description, fabric_spec, fit_note,
  care_instructions, is_active, is_demo, featured_rank, primary_image, responsive_image_base,
  image_urls, visual, created_at, updated_at
) VALUES
  (
    'arg-home-2026',
    'argentina-2026-home-fan-replica',
    'Argentina 2026 Home Fan Replica Jersey',
    'Argentina',
    'International · CONMEBOL',
    'national',
    'Home',
    'Fan Replica',
    'Unisex',
    '2026',
    1350, NULL, 350,
    'High-grade fan replica jersey inspired by the Albiceleste classic sky-blue and crisp white vertical stripes. Crafted with moisture-wicking micro-eyelet polyester tailored for humid matchdays in Bangladesh. Note: This is a fan replica product, not officially licensed team merchandise.',
    '165 GSM AeroMesh 100% Breathable Polyester · Embroidered Woven Crest',
    'Regular stadium fan fit. True to standard Asian/BD chest sizing.',
    'Machine wash cold inside-out. Do not iron directly over custom thermal print.',
    TRUE, TRUE, 1,
    '/images/products/arg-home-2026.jpg',
    '/images/products/arg-home-2026',
    '["/images/products/arg-home-2026.jpg", "/images/products/arg-home-2026.webp"]'::jsonb,
    '{"primaryColor":"#6CA6CD","secondaryColor":"#FFFFFF","accentColor":"#D4AF37","textColor":"#111111","pattern":"stripes","collarStyle":"crew","crestCode":"ARG","defaultPreviewName":"MESSI","defaultPreviewNumber":"10"}'::jsonb,
    '2026-10-24T10:00:00.000Z'::timestamptz,
    '2026-10-24T10:00:00.000Z'::timestamptz
  ),
  (
    'bd-home-2026',
    'bangladesh-national-green-home-replica',
    'Bangladesh Bengal Green Home Fan Replica Jersey',
    'Bangladesh',
    'International · SAFF / AFC',
    'national',
    'Home',
    'Fan Replica',
    'Unisex',
    '2025/26',
    1150, NULL, 300,
    'Supporter replica jersey in deep Bengal forest green with crimson red ribbed collar and cuff trim. Designed for local supporters cheering at Bashundhara Kings Arena and across the country. Clearly labelled supporter replica apparel.',
    '160 GSM DryKnit Breathable Interlock Polyester · Sublimated Geometric Weave',
    'Standard Bangladesh regular fit.',
    'Cold gentle wash. Hang dry in shade.',
    TRUE, TRUE, 2,
    '/images/products/bd-home-2026.jpg',
    '/images/products/bd-home-2026',
    '["/images/products/bd-home-2026.jpg", "/images/products/bd-home-2026.webp"]'::jsonb,
    '{"primaryColor":"#006A4E","secondaryColor":"#00523C","accentColor":"#F42A41","textColor":"#FFFFFF","pattern":"sash","collarStyle":"v-neck","crestCode":"BAN","defaultPreviewName":"HAMZA","defaultPreviewNumber":"8"}'::jsonb,
    '2026-10-25T01:00:00.000Z'::timestamptz,
    '2026-10-25T01:00:00.000Z'::timestamptz
  ),
  (
    'bra-home-2026',
    'brazil-2026-home-fan-replica',
    'Brazil 2026 Seleção Yellow Home Fan Replica',
    'Brazil',
    'International · CONMEBOL',
    'national',
    'Home',
    'Fan Replica',
    'Unisex',
    '2026',
    1350, NULL, 350,
    'Iconic canary yellow fan replica shirt with forest green V-neck collar and subtle tonal jacquard pattern. Lightweight construction built for everyday wear and five-a-side turf sessions. Unofficial supporter replica.',
    '165 GSM Jacquard Breathable Mesh Polyester · Woven Supporter Crest',
    'Regular stadium fit.',
    'Cold wash inside out. Do not bleach.',
    TRUE, TRUE, 3,
    '/images/products/bra-home-2026.jpg',
    '/images/products/bra-home-2026',
    '["/images/products/bra-home-2026.jpg", "/images/products/bra-home-2026.webp"]'::jsonb,
    '{"primaryColor":"#FACC15","secondaryColor":"#EAB308","accentColor":"#15803D","textColor":"#15803D","pattern":"solid","collarStyle":"v-neck","crestCode":"BRA","defaultPreviewName":"VINI JR","defaultPreviewNumber":"7"}'::jsonb,
    '2026-10-23T12:00:00.000Z'::timestamptz,
    '2026-10-23T12:00:00.000Z'::timestamptz
  ),
  (
    'rma-home-2526',
    'real-madrid-25-26-home-player-fit-replica',
    'Madrid Blanco 25/26 Home Player Fit Replica',
    'Real Madrid',
    'Club · Spain',
    'club',
    'Home',
    'Player Fit Replica',
    'Men',
    '2025/26',
    1650, NULL, 350,
    'Athletic player-fit replica edition in clean pearl white with charcoal-black contrast piping and laser-perforated side ventilation panels. Features heat-applied TPU crest for zero chafing during turf matches. Replica edition.',
    '175 GSM 4-Way Stretch Honeycomb Player-Fit Polyester · Heat-Sealed Crest',
    'Slim athletic cut. Order one size up if you prefer a relaxed fit.',
    'Hand wash cold only. Never tumble dry.',
    TRUE, TRUE, 4,
    '/images/products/rma-home-2526.jpg',
    '/images/products/rma-home-2526',
    '["/images/products/rma-home-2526.jpg", "/images/products/rma-home-2526.webp"]'::jsonb,
    '{"primaryColor":"#FAFAFA","secondaryColor":"#E4E4E7","accentColor":"#111111","textColor":"#111111","pattern":"pinstripe","collarStyle":"v-neck","crestCode":"RMA","defaultPreviewName":"MBAPPE","defaultPreviewNumber":"9"}'::jsonb,
    '2026-10-22T15:00:00.000Z'::timestamptz,
    '2026-10-22T15:00:00.000Z'::timestamptz
  ),
  (
    'fcb-retro-1999',
    'barcelona-1999-centenary-retro-replica',
    'Barcelona 1999 Centenary Heritage Retro Replica',
    'FC Barcelona',
    'Retro Vault · Club Heritage',
    'retro',
    'Retro',
    'Heritage Retro Replica',
    'Men',
    '1999/00',
    1850, NULL, 400,
    'Throwback 1999 centenary heritage replica with split deep garnet and midnight navy halves, black sleeves, and a structured fold-over polo collar. Heavyweight vintage pique feel. Unofficial retro tribute replica.',
    '195 GSM Vintage Pique Knit Polyester · Embroidered Heritage Emblem',
    'Classic 90s boxy retro fit with generous sleeve width.',
    'Gentle cold wash. Reshape collar while damp.',
    TRUE, TRUE, 5,
    '/images/products/fcb-retro-1999.jpg',
    '/images/products/fcb-retro-1999',
    '["/images/products/fcb-retro-1999.jpg", "/images/products/fcb-retro-1999.webp"]'::jsonb,
    '{"primaryColor":"#8B0032","secondaryColor":"#002B5C","accentColor":"#EDBB00","textColor":"#EDBB00","pattern":"halves","collarStyle":"polo","crestCode":"FCB","defaultPreviewName":"RIVALDO","defaultPreviewNumber":"10"}'::jsonb,
    '2026-10-21T09:00:00.000Z'::timestamptz,
    '2026-10-21T09:00:00.000Z'::timestamptz
  ),
  (
    'ger-home-2026',
    'germany-2026-home-fan-replica',
    'Germany 2026 Home Classic Fan Replica Jersey',
    'Germany',
    'International · UEFA',
    'national',
    'Home',
    'Fan Replica',
    'Unisex',
    '2026',
    1350, NULL, 350,
    'Clean architectural white fan replica shirt accented with a bold black chest chevron and subtle black-red-gold trim. Lightweight, breathable construction for everyday comfort. Replica supporter edition.',
    '165 GSM AeroMesh 100% Breathable Polyester · Woven Badge',
    'Regular stadium fit.',
    'Machine wash cold inside out.',
    TRUE, TRUE, 6,
    '/images/products/ger-home-2026.jpg',
    '/images/products/ger-home-2026',
    '["/images/products/ger-home-2026.jpg", "/images/products/ger-home-2026.webp"]'::jsonb,
    '{"primaryColor":"#F8FAFC","secondaryColor":"#111111","accentColor":"#DC2626","textColor":"#111111","pattern":"sash","collarStyle":"crew","crestCode":"GER","defaultPreviewName":"MUSIALA","defaultPreviewNumber":"10"}'::jsonb,
    '2026-10-20T14:00:00.000Z'::timestamptz,
    '2026-10-20T14:00:00.000Z'::timestamptz
  ),
  (
    'fra-away-2026',
    'france-2026-away-pinstripe-fan-replica',
    'France 2026 Away Pinstripe Fan Replica Jersey',
    'France',
    'International · UEFA',
    'national',
    'Away',
    'Fan Replica',
    'Unisex',
    '2026',
    1400, NULL, 350,
    'Tailored chalk-white away fan replica jersey featuring fine cobalt and crimson vertical pinstripes and a ribbed crew collar. Sharp editorial silhouette suitable for both pitch and street wear. Replica supporter edition.',
    '165 GSM Micro-Rib Polyester · Embroidered Crest',
    'Regular stadium fit.',
    'Cold wash separately.',
    TRUE, TRUE, 7,
    '/images/products/fra-away-2026.jpg',
    '/images/products/fra-away-2026',
    '["/images/products/fra-away-2026.jpg", "/images/products/fra-away-2026.webp"]'::jsonb,
    '{"primaryColor":"#F8FAFC","secondaryColor":"#1D4ED8","accentColor":"#DC2626","textColor":"#1E3A8A","pattern":"pinstripe","collarStyle":"crew","crestCode":"FRA","defaultPreviewName":"GRIEZMANN","defaultPreviewNumber":"7"}'::jsonb,
    '2026-10-19T11:00:00.000Z'::timestamptz,
    '2026-10-19T11:00:00.000Z'::timestamptz
  ),
  (
    'esp-home-2026',
    'spain-2026-home-crimson-fan-replica',
    'Spain 2026 La Roja Home Fan Replica Jersey',
    'Spain',
    'International · UEFA',
    'national',
    'Home',
    'Fan Replica',
    'Unisex',
    '2026',
    1350, NULL, 350,
    'Rich crimson red fan replica jersey with warm amber-gold shoulder and collar trim. Breathable side mesh panels help keep airflow high in warm weather. Unofficial supporter replica.',
    '165 GSM AeroMesh Polyester · Woven Supporter Badge',
    'Regular stadium fit.',
    'Wash cold with similar dark colors.',
    TRUE, TRUE, 8,
    '/images/products/esp-home-2026.jpg',
    '/images/products/esp-home-2026',
    '["/images/products/esp-home-2026.jpg", "/images/products/esp-home-2026.webp"]'::jsonb,
    '{"primaryColor":"#B91C1C","secondaryColor":"#991B1B","accentColor":"#F59E0B","textColor":"#FDE047","pattern":"solid","collarStyle":"crew","crestCode":"ESP","defaultPreviewName":"YAMAL","defaultPreviewNumber":"19"}'::jsonb,
    '2026-10-18T11:00:00.000Z'::timestamptz,
    '2026-10-18T11:00:00.000Z'::timestamptz
  ),
  (
    'acm-retro-2007',
    'milan-2007-athens-retro-replica',
    'Milan 2007 Rossoneri Heritage Retro Replica',
    'AC Milan',
    'Retro Vault · Serie A Heritage',
    'retro',
    'Retro',
    'Heritage Retro Replica',
    'Men',
    '2006/07',
    1900, NULL, 400,
    'Iconic black-and-red vertical striped retro replica jersey featuring a structured white fold-over collar and gold trim details. Built from mid-weight heritage knit polyester. Unofficial retro replica.',
    '190 GSM Heritage Knit Polyester · Embroidered Vintage Crest',
    'Classic regular fit.',
    'Cold hand wash recommended.',
    TRUE, TRUE, 9,
    '/images/products/acm-retro-2007.jpg',
    '/images/products/acm-retro-2007',
    '["/images/products/acm-retro-2007.jpg", "/images/products/acm-retro-2007.webp"]'::jsonb,
    '{"primaryColor":"#111111","secondaryColor":"#DC2626","accentColor":"#FFFFFF","textColor":"#FFFFFF","pattern":"stripes","collarStyle":"polo","crestCode":"ACM","defaultPreviewName":"KAKA","defaultPreviewNumber":"22"}'::jsonb,
    '2026-10-17T10:00:00.000Z'::timestamptz,
    '2026-10-17T10:00:00.000Z'::timestamptz
  ),
  (
    'ars-third-2526',
    'north-london-25-26-forest-third-replica',
    'North London 25/26 Forest Green Third Fan Replica',
    'Arsenal FC',
    'Club · England',
    'club',
    'Third',
    'Fan Replica',
    'Unisex',
    '2025/26',
    1450, NULL, 350,
    'Bottle-green and navy-shouldered third kit fan replica with crisp off-white polo collar trim. Pairs classic terrace aesthetics with lightweight moisture-wicking fabric. Unofficial fan replica.',
    '165 GSM Pique-Weave Breathable Polyester · Woven Minimalist Crest',
    'Regular stadium fit.',
    'Machine wash cold inside out.',
    TRUE, TRUE, 10,
    '/images/products/ars-third-2526.jpg',
    '/images/products/ars-third-2526',
    '["/images/products/ars-third-2526.jpg", "/images/products/ars-third-2526.webp"]'::jsonb,
    '{"primaryColor":"#14532D","secondaryColor":"#1E293B","accentColor":"#F7F7F5","textColor":"#F7F7F5","pattern":"hoops","collarStyle":"polo","crestCode":"AFC","defaultPreviewName":"SAKA","defaultPreviewNumber":"7"}'::jsonb,
    '2026-10-16T09:00:00.000Z'::timestamptz,
    '2026-10-16T09:00:00.000Z'::timestamptz
  )
ON CONFLICT (id) DO NOTHING;

-- 13.5 Initial Product Variants (Size-Specific Inventory)
INSERT INTO public.product_variants (
  product_id, size, sku, price_bdt, stock, is_active, chest_inches, length_inches
) VALUES
  -- arg-home-2026
  ('arg-home-2026', 'S', 'JV-ARG26-S', 1350, 6, TRUE, '37–38"', '27"'),
  ('arg-home-2026', 'M', 'JV-ARG26-M', 1350, 12, TRUE, '39–40"', '28"'),
  ('arg-home-2026', 'L', 'JV-ARG26-L', 1350, 9, TRUE, '41–42"', '29"'),
  ('arg-home-2026', 'XL', 'JV-ARG26-XL', 1350, 5, TRUE, '43–44"', '30"'),
  ('arg-home-2026', 'XXL', 'JV-ARG26-XXL', 1350, 2, TRUE, '45–46"', '31"'),
  -- bd-home-2026
  ('bd-home-2026', 'S', 'JV-BAN26-S', 1150, 8, TRUE, '37–38"', '27"'),
  ('bd-home-2026', 'M', 'JV-BAN26-M', 1150, 15, TRUE, '39–40"', '28"'),
  ('bd-home-2026', 'L', 'JV-BAN26-L', 1150, 14, TRUE, '41–42"', '29"'),
  ('bd-home-2026', 'XL', 'JV-BAN26-XL', 1150, 7, TRUE, '43–44"', '30"'),
  ('bd-home-2026', 'XXL', 'JV-BAN26-XXL', 1150, 4, TRUE, '45–46"', '31"'),
  -- bra-home-2026
  ('bra-home-2026', 'S', 'JV-BRA26-S', 1350, 5, TRUE, '37–38"', '27"'),
  ('bra-home-2026', 'M', 'JV-BRA26-M', 1350, 10, TRUE, '39–40"', '28"'),
  ('bra-home-2026', 'L', 'JV-BRA26-L', 1350, 8, TRUE, '41–42"', '29"'),
  ('bra-home-2026', 'XL', 'JV-BRA26-XL', 1350, 4, TRUE, '43–44"', '30"'),
  ('bra-home-2026', 'XXL', 'JV-BRA26-XXL', 1350, 0, TRUE, '45–46"', '31"'),
  -- rma-home-2526
  ('rma-home-2526', 'S', 'JV-RMA26-S', 1650, 4, TRUE, '36–37"', '26.5"'),
  ('rma-home-2526', 'M', 'JV-RMA26-M', 1650, 9, TRUE, '38–39"', '27.5"'),
  ('rma-home-2526', 'L', 'JV-RMA26-L', 1650, 7, TRUE, '40–41"', '28.5"'),
  ('rma-home-2526', 'XL', 'JV-RMA26-XL', 1650, 3, TRUE, '42–43"', '29.5"'),
  -- fcb-retro-1999
  ('fcb-retro-1999', 'M', 'JV-FCB99-M', 1850, 6, TRUE, '40–41"', '28"'),
  ('fcb-retro-1999', 'L', 'JV-FCB99-L', 1850, 5, TRUE, '42–43"', '29"'),
  ('fcb-retro-1999', 'XL', 'JV-FCB99-XL', 1850, 3, TRUE, '44–45"', '30"'),
  -- ger-home-2026
  ('ger-home-2026', 'S', 'JV-GER26-S', 1350, 4, TRUE, '37–38"', '27"'),
  ('ger-home-2026', 'M', 'JV-GER26-M', 1350, 8, TRUE, '39–40"', '28"'),
  ('ger-home-2026', 'L', 'JV-GER26-L', 1350, 6, TRUE, '41–42"', '29"'),
  ('ger-home-2026', 'XL', 'JV-GER26-XL', 1350, 3, TRUE, '43–44"', '30"'),
  -- fra-away-2026
  ('fra-away-2026', 'M', 'JV-FRA26-M', 1400, 7, TRUE, '39–40"', '28"'),
  ('fra-away-2026', 'L', 'JV-FRA26-L', 1400, 6, TRUE, '41–42"', '29"'),
  ('fra-away-2026', 'XL', 'JV-FRA26-XL', 1400, 4, TRUE, '43–44"', '30"'),
  -- esp-home-2026
  ('esp-home-2026', 'S', 'JV-ESP26-S', 1350, 5, TRUE, '37–38"', '27"'),
  ('esp-home-2026', 'M', 'JV-ESP26-M', 1350, 9, TRUE, '39–40"', '28"'),
  ('esp-home-2026', 'L', 'JV-ESP26-L', 1350, 8, TRUE, '41–42"', '29"'),
  -- acm-retro-2007
  ('acm-retro-2007', 'M', 'JV-ACM07-M', 1900, 4, TRUE, '39–40"', '28"'),
  ('acm-retro-2007', 'L', 'JV-ACM07-L', 1900, 6, TRUE, '41–42"', '29"'),
  ('acm-retro-2007', 'XL', 'JV-ACM07-XL', 1900, 2, TRUE, '43–44"', '30"'),
  -- ars-third-2526
  ('ars-third-2526', 'S', 'JV-ARS26-S', 1450, 5, TRUE, '37–38"', '27"'),
  ('ars-third-2526', 'M', 'JV-ARS26-M', 1450, 9, TRUE, '39–40"', '28"'),
  ('ars-third-2526', 'L', 'JV-ARS26-L', 1450, 7, TRUE, '41–42"', '29"'),
  ('ars-third-2526', 'XL', 'JV-ARS26-XL', 1450, 4, TRUE, '43–44"', '30"')
ON CONFLICT (product_id, size) DO NOTHING;

-- 13.6 Demonstration Order Record (JV-DEMO-0001 — Excluded from Revenue Metrics)
INSERT INTO public.orders (
  id,
  order_number,
  idempotency_key,
  order_access_token,
  is_demo_order,
  user_id,
  customer_name,
  customer_phone,
  customer_email,
  division,
  district,
  upazila,
  street_address,
  postal_code,
  delivery_notes,
  payment_method,
  payment_status,
  order_status,
  item_count,
  subtotal_bdt,
  customization_total_bdt,
  discount_bdt,
  applied_coupon_code,
  shipping_bdt,
  shipping_zone_label,
  total_bdt,
  status_history,
  created_at,
  updated_at
) VALUES (
  'ord-demo-0001',
  'JV-DEMO-0001',
  'seed-order-demo-0001',
  'demo-public-token-0001',
  TRUE,
  NULL,
  'Sample Customer (Demonstration Record)',
  '01700000000',
  'sample.order@example.invalid',
  'Dhaka',
  'Dhaka',
  'Dhanmondi',
  'Sample Address — Demonstration Order Only (Not a Real Customer)',
  '1209',
  'Demonstration order seeded for order-tracking walkthrough.',
  'COD',
  'UNPAID_COD',
  'CONFIRMED',
  1,
  1700,
  350,
  170,
  'VALLEY10',
  70,
  'Inside Dhaka Metro (24–48h Dispatch)',
  1600,
  '[
    {
      "status": "PENDING_CONFIRMATION",
      "paymentStatus": "UNPAID_COD",
      "timestamp": "2026-10-24T16:30:00.000Z",
      "note": "Demonstration order seeded via Cash on Delivery (Excluded from real revenue metrics)."
    },
    {
      "status": "CONFIRMED",
      "paymentStatus": "UNPAID_COD",
      "timestamp": "2026-10-24T17:10:00.000Z",
      "note": "Sample dispatch confirmation for demonstration walkthrough."
    }
  ]'::jsonb,
  '2026-10-24T16:30:00.000Z'::timestamptz,
  '2026-10-24T17:10:00.000Z'::timestamptz
)
ON CONFLICT (order_number) DO NOTHING;

INSERT INTO public.order_items (
  order_number,
  product_id,
  slug,
  product_name,
  team,
  edition_tier,
  size,
  sku,
  quantity,
  base_unit_price_bdt,
  custom_name,
  custom_number,
  has_custom_print,
  custom_print_unit_fee_bdt,
  final_unit_price_bdt,
  line_total_bdt
)
SELECT
  'JV-DEMO-0001',
  'arg-home-2026',
  'argentina-2026-home-fan-replica',
  'Argentina 2026 Home Fan Replica Jersey',
  'Argentina',
  'Fan Replica',
  'L',
  'JV-ARG26-L',
  1,
  1350,
  'MESSI',
  '10',
  TRUE,
  350,
  1700,
  1700
WHERE NOT EXISTS (
  SELECT 1 FROM public.order_items WHERE order_number = 'JV-DEMO-0001'
);

INSERT INTO public.order_idempotency_keys (
  idempotency_key,
  order_number,
  created_at
) VALUES (
  'seed-order-demo-0001',
  'JV-DEMO-0001',
  '2026-10-24T16:30:00.000Z'::timestamptz
)
ON CONFLICT (idempotency_key) DO NOTHING;

COMMIT;
