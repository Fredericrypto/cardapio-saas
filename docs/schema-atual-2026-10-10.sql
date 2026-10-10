-- ============================================================================
-- SCHEMA REAL ATUAL — Cardápio SaaS (gerado em 09/10/2026, consolidação z6-07)
--
-- Gerado com `pg_dump --schema-only --no-owner --no-privileges` num Postgres 16
-- depois de rodar as 65 migrations do zero (`npm run migration:run`): 44 tabelas.
--
-- FONTE DA VERDADE = as migrations em backend/src/migrations.
-- ============================================================================

--
-- PostgreSQL database dump
--

\restrict 6QfgrlGfJdCaPY7G2gxQoKIiYalBGCCUPCzo5HTCwmugDaAdfVnD5xsfHHjGOXX

-- Dumped from database version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)

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

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: backup_audit_logs_block_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.backup_audit_logs_block_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
        RAISE EXCEPTION 'backup_audit_logs é apenas-inserção: UPDATE não é permitido';
      END;
      $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    email character varying(150) NOT NULL,
    password_hash character varying(255) NOT NULL,
    name character varying(150),
    role character varying(20) DEFAULT 'owner'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    role_id uuid,
    avatar_url character varying(500)
);


--
-- Name: backup_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.backup_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    user_id uuid,
    user_email character varying(150),
    user_role character varying(20),
    action character varying(40) NOT NULL,
    backup_id uuid,
    success boolean DEFAULT true NOT NULL,
    ip character varying(64),
    forwarded_for character varying(300),
    user_agent character varying(300),
    detail jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cash_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cash_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    location_id uuid,
    user_id uuid NOT NULL,
    type character varying(20) NOT NULL,
    amount numeric(10,2) NOT NULL,
    reason character varying(300),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "CHK_cash_transactions_type" CHECK (((type)::text = ANY ((ARRAY['sangria'::character varying, 'suprimento'::character varying, 'abertura'::character varying, 'fechamento'::character varying])::text[])))
);


--
-- Name: cashback_consumptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cashback_consumptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    order_id uuid,
    ledger_entry_id uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    reversed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    table_session_id uuid,
    CONSTRAINT "CHK_cashback_consumptions_one_source" CHECK ((((order_id IS NOT NULL) AND (table_session_id IS NULL)) OR ((order_id IS NULL) AND (table_session_id IS NOT NULL))))
);


--
-- Name: cashback_ledger_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cashback_ledger_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    location_id uuid,
    source_type character varying(20) NOT NULL,
    source_id uuid,
    original_amount numeric(10,2) NOT NULL,
    remaining_amount numeric(10,2) NOT NULL,
    expires_at timestamp with time zone,
    notes character varying(300),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    settings_id uuid,
    notified_week_at timestamp with time zone,
    notified_two_days_at timestamp with time zone,
    CONSTRAINT "CHK_cashback_ledger_entries_remaining" CHECK ((remaining_amount >= (0)::numeric)),
    CONSTRAINT "CHK_cashback_ledger_entries_source_type" CHECK (((source_type)::text = ANY ((ARRAY['order'::character varying, 'loyalty_reward'::character varying, 'admin_adjustment'::character varying])::text[])))
);


--
-- Name: cashback_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cashback_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name character varying(80) DEFAULT 'Cashback'::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    percentage numeric(5,2) NOT NULL,
    min_order_value numeric(10,2) DEFAULT 0 NOT NULL,
    max_cashback_per_order numeric(10,2),
    expiration_days integer,
    promo_text character varying(150),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    max_cashback_per_customer_per_day numeric(10,2),
    CONSTRAINT "CHK_cashback_settings_percentage" CHECK (((percentage > (0)::numeric) AND (percentage <= (100)::numeric)))
);


--
-- Name: cashback_settings_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cashback_settings_locations (
    cashback_settings_id uuid NOT NULL,
    location_id uuid NOT NULL
);


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    key character varying(40)
);


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(150) NOT NULL,
    password_hash character varying(255) NOT NULL,
    name character varying(150) NOT NULL,
    phone character varying(20),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    tenant_id uuid NOT NULL,
    gender character varying(20),
    avatar_url text,
    address_street character varying(200),
    address_number character varying(20),
    address_neighborhood character varying(120),
    address_city character varying(120),
    address_state character varying(2),
    address_postcode character varying(12),
    address_reference_point character varying(200),
    address_formatted text,
    address_latitude numeric(10,7),
    address_longitude numeric(10,7),
    address_precise boolean,
    pix_key_type character varying(20),
    pix_key character varying(150),
    is_verified boolean DEFAULT false NOT NULL,
    verification_status character varying(20) DEFAULT 'none'::character varying NOT NULL,
    verification_photo_url text,
    verification_photo_delete_at timestamp with time zone,
    verification_requested_at timestamp with time zone,
    verification_decided_at timestamp with time zone,
    verification_rejection_reason text,
    verification_reviewed_by_admin_id uuid,
    verification_congrats_pending boolean DEFAULT false NOT NULL,
    verification_integrity_signature character varying(64),
    verification_tamper_flagged_at timestamp with time zone,
    verification_revoked_at timestamp with time zone,
    verification_revoked_reason text,
    verification_revoked_by_admin_id uuid,
    is_suspended boolean DEFAULT false NOT NULL,
    suspended_at timestamp with time zone,
    suspended_reason text,
    suspended_by_admin_id uuid,
    pronouns character varying(20),
    language character varying(8) DEFAULT 'pt-BR'::character varying NOT NULL
);


--
-- Name: internal_notification_reads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.internal_notification_reads (
    notification_id uuid NOT NULL,
    user_id uuid NOT NULL,
    read_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: internal_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.internal_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    note_id uuid,
    type character varying(30) NOT NULL,
    title character varying(120) NOT NULL,
    message character varying(300) NOT NULL,
    tag character varying(20),
    author_user_id uuid,
    author_name character varying(150) NOT NULL,
    author_role character varying(20) NOT NULL,
    target_role character varying(20) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "CHK_internal_notifications_target" CHECK (((target_role)::text = ANY ((ARRAY['owner'::character varying, 'owner_manager'::character varying, 'all'::character varying])::text[])))
);


--
-- Name: locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.locations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    name character varying(150) NOT NULL,
    whatsapp_number character varying(20),
    address text,
    latitude numeric(10,7),
    longitude numeric(10,7),
    is_open boolean DEFAULT true NOT NULL,
    opening_hours jsonb,
    delivery_fee numeric(10,2) DEFAULT 0 NOT NULL,
    delivery_fee_per_km numeric(10,2) DEFAULT 0 NOT NULL,
    delivery_max_radius_km numeric(10,2),
    min_order_value numeric(10,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    telegram_username character varying(100),
    contact_phone_number character varying(20),
    schedule_open_state boolean
);


--
-- Name: loyalty_program_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loyalty_program_locations (
    loyalty_program_id uuid NOT NULL,
    location_id uuid NOT NULL
);


--
-- Name: loyalty_programs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loyalty_programs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name character varying(80) NOT NULL,
    description character varying(300),
    stamps_required integer NOT NULL,
    reward_type character varying(20) NOT NULL,
    reward_description character varying(150) NOT NULL,
    cashback_amount numeric(10,2),
    discount_type character varying(10),
    discount_value numeric(10,2),
    min_order_value numeric(10,2) DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "CHK_loyalty_programs_reward_type" CHECK (((reward_type)::text = ANY ((ARRAY['sobremesa'::character varying, 'brinde'::character varying, 'camiseta'::character varying, 'refeicao'::character varying, 'cashback'::character varying, 'desconto'::character varying, 'outro'::character varying])::text[]))),
    CONSTRAINT "CHK_loyalty_programs_stamps_required" CHECK ((stamps_required > 0))
);


--
-- Name: loyalty_rewards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loyalty_rewards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    program_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    status character varying(15) DEFAULT 'pendente'::character varying NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    redeemed_at timestamp with time zone,
    redeemed_by_staff_user_id uuid,
    redeemed_by_staff_name character varying(150),
    CONSTRAINT "CHK_loyalty_rewards_status" CHECK (((status)::text = ANY ((ARRAY['pendente'::character varying, 'resgatado'::character varying])::text[])))
);


--
-- Name: loyalty_stamps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loyalty_stamps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    program_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    redemption_id uuid NOT NULL,
    reward_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.migrations (
    id integer NOT NULL,
    "timestamp" bigint NOT NULL,
    name character varying NOT NULL
);


--
-- Name: migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.migrations_id_seq OWNED BY public.migrations.id;


--
-- Name: notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    color character varying(9) DEFAULT '#FEF08A'::character varying NOT NULL,
    text_color character varying(9) DEFAULT '#422006'::character varying NOT NULL,
    width integer DEFAULT 260 NOT NULL,
    height integer DEFAULT 220 NOT NULL,
    pos_x integer DEFAULT 24 NOT NULL,
    pos_y integer DEFAULT 24 NOT NULL,
    is_pinned boolean DEFAULT false NOT NULL,
    is_minimized boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    author_user_id uuid,
    author_name character varying(150) NOT NULL,
    last_edited_by_name character varying(150),
    tag character varying(20) DEFAULT 'Geral'::character varying NOT NULL,
    content_updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    product_id uuid NOT NULL,
    product_name character varying(150) NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    selected_options jsonb,
    subtotal numeric(10,2) NOT NULL,
    unit_cost numeric(10,2)
);


--
-- Name: order_promotion_discounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_promotion_discounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    order_id uuid NOT NULL,
    promotion_id uuid NOT NULL,
    discount_amount numeric(10,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    customer_name character varying(150),
    customer_phone character varying(20),
    table_number character varying(20),
    order_type character varying(20) DEFAULT 'balcao'::character varying NOT NULL,
    status character varying(20) DEFAULT 'pendente'::character varying NOT NULL,
    total numeric(10,2) NOT NULL,
    delivery_fee numeric(10,2) DEFAULT 0 NOT NULL,
    payment_method character varying(20),
    payment_status character varying(20) DEFAULT 'pendente'::character varying NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    table_session_id uuid,
    deleted_at timestamp with time zone,
    flagged boolean DEFAULT false NOT NULL,
    delivery_address text,
    delivery_reference_point text,
    delivery_distance_km numeric(10,2),
    delivery_address_precise boolean,
    tip_amount numeric(10,2) DEFAULT 0 NOT NULL,
    amount_received numeric(10,2),
    customer_id uuid,
    pix_payload text,
    pix_expires_at timestamp with time zone,
    mp_payment_id character varying(60),
    location_id uuid,
    discount_amount numeric(10,2) DEFAULT 0 NOT NULL,
    promotion_id uuid,
    promotion_title_snapshot character varying(60),
    promotion_ids uuid[],
    promotion_titles_snapshot character varying(60)[],
    cashback_used numeric(10,2) DEFAULT 0 NOT NULL,
    cashback_earned numeric(10,2) DEFAULT 0 NOT NULL,
    cashback_locked boolean DEFAULT false NOT NULL,
    placed_while_at_table character varying(20),
    table_participant_id uuid,
    cancel_reason character varying(300),
    canceled_at timestamp with time zone,
    canceled_by_user_id uuid
);


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug character varying(80) NOT NULL,
    name character varying(120) NOT NULL,
    module character varying(60) NOT NULL,
    description character varying(300) DEFAULT ''::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: product_option_values; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_option_values (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    option_id uuid NOT NULL,
    label character varying(100) NOT NULL,
    price_delta numeric(10,2) DEFAULT 0 NOT NULL,
    is_available boolean DEFAULT true NOT NULL
);


--
-- Name: product_options; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_options (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    min_select integer DEFAULT 0 NOT NULL,
    max_select integer DEFAULT 1 NOT NULL
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    category_id uuid NOT NULL,
    name character varying(150) NOT NULL,
    description text,
    price numeric(10,2) NOT NULL,
    promo_price numeric(10,2),
    image_url text,
    is_available boolean DEFAULT true NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    cost_price numeric(10,2)
);


--
-- Name: promotion_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promotion_categories (
    promotion_id uuid NOT NULL,
    category_id uuid NOT NULL
);


--
-- Name: promotion_customer_resets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promotion_customer_resets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    promotion_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    reset_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: promotion_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promotion_locations (
    promotion_id uuid NOT NULL,
    location_id uuid NOT NULL
);


--
-- Name: promotion_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promotion_products (
    promotion_id uuid NOT NULL,
    product_id uuid NOT NULL
);


--
-- Name: promotions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promotions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    title character varying(60) NOT NULL,
    description text,
    image_url text,
    discount_type character varying(20) NOT NULL,
    discount_value numeric(10,2) NOT NULL,
    min_order_value numeric(10,2) DEFAULT 0 NOT NULL,
    scope character varying(20) DEFAULT 'all'::character varying NOT NULL,
    usage_limit_per_customer integer,
    max_redemptions integer,
    redemption_count integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    max_discount_amount numeric(10,2),
    allow_reuse_across_locations boolean DEFAULT false NOT NULL,
    max_eligible_quantity integer,
    usage_reset_at timestamp with time zone,
    usage_count_before_reset integer
);


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    endpoint character varying(500) NOT NULL,
    p256dh character varying(200) NOT NULL,
    auth character varying(200) NOT NULL,
    user_agent character varying(300),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: receipt_redemptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.receipt_redemptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    source_type character varying(10) NOT NULL,
    source_id uuid NOT NULL,
    customer_id uuid,
    purpose character varying(20) NOT NULL,
    loyalty_program_id uuid,
    staff_user_id uuid NOT NULL,
    staff_name character varying(150) NOT NULL,
    notes character varying(500),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    location_id uuid,
    CONSTRAINT "CHK_receipt_redemptions_purpose" CHECK (((purpose)::text = ANY ((ARRAY['reembolso'::character varying, 'reclamacao'::character varying, 'retirada'::character varying, 'fidelidade'::character varying, 'outro'::character varying])::text[]))),
    CONSTRAINT "CHK_receipt_redemptions_source_type" CHECK (((source_type)::text = ANY ((ARRAY['avulso'::character varying, 'mesa'::character varying])::text[])))
);


--
-- Name: restaurant_tables; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.restaurant_tables (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    number character varying(20) NOT NULL,
    qr_code_token character varying(64) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    location_id uuid NOT NULL,
    kind character varying(10) DEFAULT 'mesa'::character varying NOT NULL
);


--
-- Name: review_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.review_responses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    review_id uuid NOT NULL,
    response_text character varying(1000) NOT NULL,
    staff_user_id uuid NOT NULL,
    staff_name character varying(150) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    order_id uuid NOT NULL,
    location_id uuid,
    rating smallint NOT NULL,
    comment character varying(1000),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_anonymous boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    target_type character varying(20) DEFAULT 'restaurant'::character varying NOT NULL,
    product_id uuid,
    CONSTRAINT "CHK_reviews_rating" CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    role_id uuid NOT NULL,
    permission_id uuid NOT NULL
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name character varying(60) NOT NULL,
    slug character varying(80) NOT NULL,
    description character varying(200),
    is_system_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: table_session_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.table_session_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    table_session_id uuid NOT NULL,
    customer_id uuid,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    left_at timestamp with time zone,
    seat_token character varying(64) NOT NULL
);


--
-- Name: table_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.table_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    table_id uuid NOT NULL,
    status character varying(30) DEFAULT 'aberta'::character varying NOT NULL,
    opened_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_at timestamp with time zone,
    tip_amount numeric(10,2) DEFAULT 0 NOT NULL,
    payment_method character varying(20),
    amount_received numeric(10,2),
    change_given numeric(10,2),
    deleted_at timestamp with time zone,
    flagged boolean DEFAULT false NOT NULL,
    force_closed_reason text,
    force_closed_by_user_id uuid,
    force_closed_by_email character varying(255),
    opened_by_customer_id uuid,
    requested_payment_method character varying(20),
    cash_delivery_preference character varying(20),
    cashback_requested_by_customer_id uuid,
    cashback_used numeric(10,2) DEFAULT 0 NOT NULL,
    mp_payment_id character varying,
    pix_payload text,
    pix_expires_at timestamp with time zone,
    payment_status character varying(20),
    cashback_split_mode character varying(20),
    closing_requested_by_customer_id uuid,
    closed_reason character varying(30)
);


--
-- Name: tenant_backup_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_backup_settings (
    tenant_id uuid NOT NULL,
    frequency_days integer DEFAULT 0 NOT NULL,
    run_time character varying(5) DEFAULT '04:00'::character varying NOT NULL,
    retention_days integer DEFAULT 90 NOT NULL,
    next_run_at timestamp with time zone,
    last_auto_backup_at timestamp with time zone,
    updated_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "CHK_tenant_backup_settings_frequency" CHECK ((frequency_days = ANY (ARRAY[0, 3, 7, 15, 30]))),
    CONSTRAINT "CHK_tenant_backup_settings_retention" CHECK (((retention_days >= 7) AND (retention_days <= 365))),
    CONSTRAINT "CHK_tenant_backup_settings_run_time" CHECK (((run_time)::text ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'::text))
);


--
-- Name: tenant_backups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_backups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    file_name character varying(200) NOT NULL,
    storage_path character varying(300) NOT NULL,
    file_size bigint DEFAULT 0 NOT NULL,
    backup_type character varying(20) NOT NULL,
    status character varying(15) DEFAULT 'processando'::character varying NOT NULL,
    checksum_sha256 character varying(64),
    total_rows integer,
    table_counts jsonb,
    schema_head character varying(60),
    format_version smallint DEFAULT 1 NOT NULL,
    error_message character varying(500),
    created_by_user_id uuid,
    created_by_name character varying(150),
    restore_count integer DEFAULT 0 NOT NULL,
    restored_at timestamp with time zone,
    restored_by_user_id uuid,
    restored_by_name character varying(150),
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "CHK_tenant_backups_size" CHECK ((file_size >= 0)),
    CONSTRAINT "CHK_tenant_backups_status" CHECK (((status)::text = ANY ((ARRAY['processando'::character varying, 'concluido'::character varying, 'restaurando'::character varying, 'restaurado'::character varying, 'falhou'::character varying])::text[]))),
    CONSTRAINT "CHK_tenant_backups_type" CHECK (((backup_type)::text = ANY ((ARRAY['automatico'::character varying, 'manual'::character varying, 'pre_restauracao'::character varying])::text[])))
);


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug character varying(100) NOT NULL,
    name character varying(150) NOT NULL,
    logo_url text,
    cover_image_url text,
    primary_color character varying(7) DEFAULT '#3d3846'::character varying NOT NULL,
    secondary_color character varying(7) DEFAULT '#c0bfbc'::character varying NOT NULL,
    plan character varying(20) DEFAULT 'trial'::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    pix_key_type character varying(20),
    pix_key character varying(150),
    instagram_handle character varying(100),
    pix_merchant_city character varying(15),
    pix_enabled boolean DEFAULT false NOT NULL,
    mercado_pago_access_token_encrypted text,
    mercado_pago_webhook_secret_encrypted text,
    table_session_timeout_minutes integer,
    youtube_url character varying(300),
    facebook_url character varying(300),
    tiktok_handle character varying(100),
    twitter_handle character varying(100),
    messenger_username character varying(100),
    gmail_address character varying(200),
    default_cmv_percent numeric(5,2) DEFAULT 30 NOT NULL,
    card_fee_percent numeric(5,2) DEFAULT 0 NOT NULL,
    pix_fee_percent numeric(5,2) DEFAULT 0 NOT NULL,
    tax_percent numeric(5,2) DEFAULT 0 NOT NULL,
    internal_notification_target character varying(20) DEFAULT 'all'::character varying NOT NULL
);


--
-- Name: user_push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role character varying(20) NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    user_agent character varying(300),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: waiter_calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.waiter_calls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    table_session_id uuid NOT NULL,
    status character varying(20) DEFAULT 'pendente'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    attended_at timestamp with time zone,
    table_participant_id uuid,
    called_by_name character varying(60)
);


--
-- Name: migrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migrations ALTER COLUMN id SET DEFAULT nextval('public.migrations_id_seq'::regclass);


--
-- Name: migrations PK_8c82d7f526340ab734260ea46be; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migrations
    ADD CONSTRAINT "PK_8c82d7f526340ab734260ea46be" PRIMARY KEY (id);


--
-- Name: backup_audit_logs PK_backup_audit_logs; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backup_audit_logs
    ADD CONSTRAINT "PK_backup_audit_logs" PRIMARY KEY (id);


--
-- Name: cashback_consumptions PK_cashback_consumptions; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashback_consumptions
    ADD CONSTRAINT "PK_cashback_consumptions" PRIMARY KEY (id);


--
-- Name: cashback_ledger_entries PK_cashback_ledger_entries; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashback_ledger_entries
    ADD CONSTRAINT "PK_cashback_ledger_entries" PRIMARY KEY (id);


--
-- Name: cashback_settings PK_cashback_settings; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashback_settings
    ADD CONSTRAINT "PK_cashback_settings" PRIMARY KEY (id);


--
-- Name: cashback_settings_locations PK_cashback_settings_locations; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashback_settings_locations
    ADD CONSTRAINT "PK_cashback_settings_locations" PRIMARY KEY (cashback_settings_id, location_id);


--
-- Name: internal_notification_reads PK_internal_notification_reads; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_notification_reads
    ADD CONSTRAINT "PK_internal_notification_reads" PRIMARY KEY (notification_id, user_id);


--
-- Name: loyalty_program_locations PK_loyalty_program_locations; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_program_locations
    ADD CONSTRAINT "PK_loyalty_program_locations" PRIMARY KEY (loyalty_program_id, location_id);


--
-- Name: loyalty_programs PK_loyalty_programs; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_programs
    ADD CONSTRAINT "PK_loyalty_programs" PRIMARY KEY (id);


--
-- Name: loyalty_rewards PK_loyalty_rewards; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_rewards
    ADD CONSTRAINT "PK_loyalty_rewards" PRIMARY KEY (id);


--
-- Name: loyalty_stamps PK_loyalty_stamps; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_stamps
    ADD CONSTRAINT "PK_loyalty_stamps" PRIMARY KEY (id);


--
-- Name: order_promotion_discounts PK_order_promotion_discounts; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_promotion_discounts
    ADD CONSTRAINT "PK_order_promotion_discounts" PRIMARY KEY (id);


--
-- Name: promotion_categories PK_promotion_categories; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_categories
    ADD CONSTRAINT "PK_promotion_categories" PRIMARY KEY (promotion_id, category_id);


--
-- Name: promotion_customer_resets PK_promotion_customer_resets; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_customer_resets
    ADD CONSTRAINT "PK_promotion_customer_resets" PRIMARY KEY (id);


--
-- Name: promotion_locations PK_promotion_locations; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_locations
    ADD CONSTRAINT "PK_promotion_locations" PRIMARY KEY (promotion_id, location_id);


--
-- Name: promotion_products PK_promotion_products; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_products
    ADD CONSTRAINT "PK_promotion_products" PRIMARY KEY (promotion_id, product_id);


--
-- Name: promotions PK_promotions_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotions
    ADD CONSTRAINT "PK_promotions_id" PRIMARY KEY (id);


--
-- Name: push_subscriptions PK_push_subscriptions; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT "PK_push_subscriptions" PRIMARY KEY (id);


--
-- Name: receipt_redemptions PK_receipt_redemptions; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipt_redemptions
    ADD CONSTRAINT "PK_receipt_redemptions" PRIMARY KEY (id);


--
-- Name: review_responses PK_review_responses; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_responses
    ADD CONSTRAINT "PK_review_responses" PRIMARY KEY (id);


--
-- Name: reviews PK_reviews; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT "PK_reviews" PRIMARY KEY (id);


--
-- Name: tenant_backup_settings PK_tenant_backup_settings; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_backup_settings
    ADD CONSTRAINT "PK_tenant_backup_settings" PRIMARY KEY (tenant_id);


--
-- Name: tenant_backups PK_tenant_backups; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_backups
    ADD CONSTRAINT "PK_tenant_backups" PRIMARY KEY (id);


--
-- Name: loyalty_stamps UQ_loyalty_stamps_redemption; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_stamps
    ADD CONSTRAINT "UQ_loyalty_stamps_redemption" UNIQUE (redemption_id);


--
-- Name: permissions UQ_permissions_slug; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT "UQ_permissions_slug" UNIQUE (slug);


--
-- Name: push_subscriptions UQ_push_subscriptions_endpoint; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT "UQ_push_subscriptions_endpoint" UNIQUE (endpoint);


--
-- Name: review_responses UQ_review_responses_review; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_responses
    ADD CONSTRAINT "UQ_review_responses_review" UNIQUE (review_id);


--
-- Name: roles UQ_roles_tenant_slug; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT "UQ_roles_tenant_slug" UNIQUE (tenant_id, slug);


--
-- Name: table_session_participants UQ_table_session_participant; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.table_session_participants
    ADD CONSTRAINT "UQ_table_session_participant" UNIQUE (table_session_id, customer_id);


--
-- Name: admin_users admin_users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_email_key UNIQUE (email);


--
-- Name: admin_users admin_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_pkey PRIMARY KEY (id);


--
-- Name: cash_transactions cash_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_transactions
    ADD CONSTRAINT cash_transactions_pkey PRIMARY KEY (id);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: internal_notifications internal_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_notifications
    ADD CONSTRAINT internal_notifications_pkey PRIMARY KEY (id);


--
-- Name: locations locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);


--
-- Name: notes notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: product_option_values product_option_values_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_option_values
    ADD CONSTRAINT product_option_values_pkey PRIMARY KEY (id);


--
-- Name: product_options product_options_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_options
    ADD CONSTRAINT product_options_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: restaurant_tables restaurant_tables_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.restaurant_tables
    ADD CONSTRAINT restaurant_tables_pkey PRIMARY KEY (id);


--
-- Name: restaurant_tables restaurant_tables_qr_code_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.restaurant_tables
    ADD CONSTRAINT restaurant_tables_qr_code_token_key UNIQUE (qr_code_token);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission_id);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: table_session_participants table_session_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.table_session_participants
    ADD CONSTRAINT table_session_participants_pkey PRIMARY KEY (id);


--
-- Name: table_sessions table_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.table_sessions
    ADD CONSTRAINT table_sessions_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_slug_key UNIQUE (slug);


--
-- Name: user_push_subscriptions user_push_subscriptions_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_push_subscriptions
    ADD CONSTRAINT user_push_subscriptions_endpoint_key UNIQUE (endpoint);


--
-- Name: user_push_subscriptions user_push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_push_subscriptions
    ADD CONSTRAINT user_push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: waiter_calls waiter_calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waiter_calls
    ADD CONSTRAINT waiter_calls_pkey PRIMARY KEY (id);


--
-- Name: IDX_admin_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_admin_users_role" ON public.admin_users USING btree (role_id);


--
-- Name: IDX_admin_users_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_admin_users_tenant" ON public.admin_users USING btree (tenant_id);


--
-- Name: IDX_backup_audit_logs_tenant_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_backup_audit_logs_tenant_created" ON public.backup_audit_logs USING btree (tenant_id, created_at DESC);


--
-- Name: IDX_cash_transactions_tenant_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_cash_transactions_tenant_created" ON public.cash_transactions USING btree (tenant_id, created_at);


--
-- Name: IDX_cash_transactions_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_cash_transactions_type" ON public.cash_transactions USING btree (type);


--
-- Name: IDX_cashback_consumptions_ledger_entry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_cashback_consumptions_ledger_entry" ON public.cashback_consumptions USING btree (ledger_entry_id);


--
-- Name: IDX_cashback_consumptions_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_cashback_consumptions_order" ON public.cashback_consumptions USING btree (order_id);


--
-- Name: IDX_cashback_consumptions_table_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_cashback_consumptions_table_session_id" ON public.cashback_consumptions USING btree (table_session_id);


--
-- Name: IDX_cashback_consumptions_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_cashback_consumptions_tenant" ON public.cashback_consumptions USING btree (tenant_id);


--
-- Name: IDX_cashback_ledger_entries_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_cashback_ledger_entries_customer" ON public.cashback_ledger_entries USING btree (customer_id);


--
-- Name: IDX_cashback_ledger_entries_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_cashback_ledger_entries_tenant" ON public.cashback_ledger_entries USING btree (tenant_id);


--
-- Name: IDX_cashback_ledger_entries_unique_source; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_cashback_ledger_entries_unique_source" ON public.cashback_ledger_entries USING btree (source_type, source_id) WHERE (source_id IS NOT NULL);


--
-- Name: IDX_cashback_ledger_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_cashback_ledger_expiry" ON public.cashback_ledger_entries USING btree (expires_at) WHERE ((remaining_amount > (0)::numeric) AND (expires_at IS NOT NULL));


--
-- Name: IDX_cashback_settings_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_cashback_settings_tenant" ON public.cashback_settings USING btree (tenant_id);


--
-- Name: IDX_categories_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_categories_tenant" ON public.categories USING btree (tenant_id);


--
-- Name: IDX_customers_tenant_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_customers_tenant_email" ON public.customers USING btree (tenant_id, email);


--
-- Name: IDX_internal_notifications_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_internal_notifications_created" ON public.internal_notifications USING btree (created_at);


--
-- Name: IDX_internal_notifications_tenant_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_internal_notifications_tenant_created" ON public.internal_notifications USING btree (tenant_id, created_at);


--
-- Name: IDX_locations_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_locations_tenant_id" ON public.locations USING btree (tenant_id);


--
-- Name: IDX_loyalty_programs_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_loyalty_programs_tenant" ON public.loyalty_programs USING btree (tenant_id);


--
-- Name: IDX_loyalty_rewards_customer_program; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_loyalty_rewards_customer_program" ON public.loyalty_rewards USING btree (program_id, customer_id);


--
-- Name: IDX_loyalty_stamps_customer_program; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_loyalty_stamps_customer_program" ON public.loyalty_stamps USING btree (program_id, customer_id);


--
-- Name: IDX_notes_tenant_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_notes_tenant_created" ON public.notes USING btree (tenant_id, created_at);


--
-- Name: IDX_order_items_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_order_items_order" ON public.order_items USING btree (order_id);


--
-- Name: IDX_order_promotion_discounts_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_order_promotion_discounts_order" ON public.order_promotion_discounts USING btree (order_id);


--
-- Name: IDX_order_promotion_discounts_promotion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_order_promotion_discounts_promotion" ON public.order_promotion_discounts USING btree (promotion_id);


--
-- Name: IDX_order_promotion_discounts_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_order_promotion_discounts_tenant" ON public.order_promotion_discounts USING btree (tenant_id);


--
-- Name: IDX_orders_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_orders_customer_id" ON public.orders USING btree (customer_id);


--
-- Name: IDX_orders_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_orders_deleted_at" ON public.orders USING btree (deleted_at);


--
-- Name: IDX_orders_location_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_orders_location_id" ON public.orders USING btree (location_id);


--
-- Name: IDX_orders_promotion_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_orders_promotion_id" ON public.orders USING btree (promotion_id);


--
-- Name: IDX_orders_table_participant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_orders_table_participant" ON public.orders USING btree (table_participant_id);


--
-- Name: IDX_orders_table_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_orders_table_session" ON public.orders USING btree (table_session_id);


--
-- Name: IDX_orders_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_orders_tenant" ON public.orders USING btree (tenant_id);


--
-- Name: IDX_orders_tenant_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_orders_tenant_created" ON public.orders USING btree (tenant_id, created_at);


--
-- Name: IDX_orders_tenant_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_orders_tenant_status" ON public.orders USING btree (tenant_id, status);


--
-- Name: IDX_permissions_module; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_permissions_module" ON public.permissions USING btree (module);


--
-- Name: IDX_product_option_values_option; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_product_option_values_option" ON public.product_option_values USING btree (option_id);


--
-- Name: IDX_product_options_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_product_options_product" ON public.product_options USING btree (product_id);


--
-- Name: IDX_products_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_products_category" ON public.products USING btree (category_id);


--
-- Name: IDX_products_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_products_tenant" ON public.products USING btree (tenant_id);


--
-- Name: IDX_promotion_categories_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_promotion_categories_category" ON public.promotion_categories USING btree (category_id);


--
-- Name: IDX_promotion_categories_promotion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_promotion_categories_promotion" ON public.promotion_categories USING btree (promotion_id);


--
-- Name: IDX_promotion_customer_resets_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_promotion_customer_resets_tenant" ON public.promotion_customer_resets USING btree (tenant_id);


--
-- Name: IDX_promotion_customer_resets_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_promotion_customer_resets_unique" ON public.promotion_customer_resets USING btree (promotion_id, customer_id);


--
-- Name: IDX_promotion_locations_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_promotion_locations_location" ON public.promotion_locations USING btree (location_id);


--
-- Name: IDX_promotion_locations_promotion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_promotion_locations_promotion" ON public.promotion_locations USING btree (promotion_id);


--
-- Name: IDX_promotion_products_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_promotion_products_product" ON public.promotion_products USING btree (product_id);


--
-- Name: IDX_promotion_products_promotion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_promotion_products_promotion" ON public.promotion_products USING btree (promotion_id);


--
-- Name: IDX_promotions_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_promotions_tenant_id" ON public.promotions USING btree (tenant_id);


--
-- Name: IDX_push_subscriptions_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_push_subscriptions_customer" ON public.push_subscriptions USING btree (customer_id);


--
-- Name: IDX_push_subscriptions_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_push_subscriptions_tenant" ON public.push_subscriptions USING btree (tenant_id);


--
-- Name: IDX_receipt_redemptions_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_receipt_redemptions_customer" ON public.receipt_redemptions USING btree (customer_id);


--
-- Name: IDX_receipt_redemptions_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_receipt_redemptions_source" ON public.receipt_redemptions USING btree (source_type, source_id);


--
-- Name: IDX_receipt_redemptions_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_receipt_redemptions_tenant" ON public.receipt_redemptions USING btree (tenant_id);


--
-- Name: IDX_receipt_redemptions_unique_loyalty; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_receipt_redemptions_unique_loyalty" ON public.receipt_redemptions USING btree (source_type, source_id, loyalty_program_id) WHERE ((purpose)::text = 'fidelidade'::text);


--
-- Name: IDX_receipt_redemptions_unique_no_program; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_receipt_redemptions_unique_no_program" ON public.receipt_redemptions USING btree (source_type, source_id, purpose) WHERE ((purpose)::text <> 'fidelidade'::text);


--
-- Name: IDX_restaurant_tables_location_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_restaurant_tables_location_id" ON public.restaurant_tables USING btree (location_id);


--
-- Name: IDX_restaurant_tables_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_restaurant_tables_tenant" ON public.restaurant_tables USING btree (tenant_id);


--
-- Name: IDX_review_responses_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_review_responses_tenant" ON public.review_responses USING btree (tenant_id);


--
-- Name: IDX_reviews_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_reviews_customer" ON public.reviews USING btree (customer_id);


--
-- Name: IDX_reviews_customer_target_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_reviews_customer_target_product" ON public.reviews USING btree (customer_id, target_type, product_id);


--
-- Name: IDX_reviews_one_item_per_order_product; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_reviews_one_item_per_order_product" ON public.reviews USING btree (order_id, product_id) WHERE ((target_type)::text = 'item'::text);


--
-- Name: IDX_reviews_one_restaurant_per_order; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_reviews_one_restaurant_per_order" ON public.reviews USING btree (order_id) WHERE ((target_type)::text = 'restaurant'::text);


--
-- Name: IDX_reviews_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_reviews_tenant" ON public.reviews USING btree (tenant_id);


--
-- Name: IDX_role_permissions_permission; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_role_permissions_permission" ON public.role_permissions USING btree (permission_id);


--
-- Name: IDX_roles_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_roles_tenant" ON public.roles USING btree (tenant_id);


--
-- Name: IDX_table_sessions_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_table_sessions_deleted_at" ON public.table_sessions USING btree (deleted_at);


--
-- Name: IDX_table_sessions_one_active_per_table; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_table_sessions_one_active_per_table" ON public.table_sessions USING btree (table_id) WHERE (((status)::text <> 'fechada'::text) AND (deleted_at IS NULL));


--
-- Name: IDX_table_sessions_table; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_table_sessions_table" ON public.table_sessions USING btree (table_id);


--
-- Name: IDX_table_sessions_tenant_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_table_sessions_tenant_status" ON public.table_sessions USING btree (tenant_id, status);


--
-- Name: IDX_tenant_backup_settings_next_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_tenant_backup_settings_next_run" ON public.tenant_backup_settings USING btree (next_run_at) WHERE (frequency_days > 0);


--
-- Name: IDX_tenant_backups_one_in_flight; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_tenant_backups_one_in_flight" ON public.tenant_backups USING btree (tenant_id) WHERE ((status)::text = ANY ((ARRAY['processando'::character varying, 'restaurando'::character varying])::text[]));


--
-- Name: IDX_tenant_backups_tenant_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_tenant_backups_tenant_created" ON public.tenant_backups USING btree (tenant_id, created_at DESC);


--
-- Name: IDX_tenants_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_tenants_slug" ON public.tenants USING btree (slug);


--
-- Name: IDX_tsp_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_tsp_customer" ON public.table_session_participants USING btree (customer_id);


--
-- Name: IDX_tsp_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_tsp_session" ON public.table_session_participants USING btree (table_session_id);


--
-- Name: IDX_user_push_subscriptions_tenant_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_user_push_subscriptions_tenant_user" ON public.user_push_subscriptions USING btree (tenant_id, user_id);


--
-- Name: IDX_waiter_calls_tenant_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_waiter_calls_tenant_status" ON public.waiter_calls USING btree (tenant_id, status);


--
-- Name: UQ_categories_tenant_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "UQ_categories_tenant_key" ON public.categories USING btree (tenant_id, key) WHERE ((key IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: UQ_internal_notifications_note_event; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "UQ_internal_notifications_note_event" ON public.internal_notifications USING btree (note_id, type) WHERE ((note_id IS NOT NULL) AND ((type)::text = ANY ((ARRAY['note_created'::character varying, 'note_deleted'::character varying])::text[])));


--
-- Name: UQ_tsp_seat_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "UQ_tsp_seat_token" ON public.table_session_participants USING btree (seat_token);


--
-- Name: backup_audit_logs trg_backup_audit_logs_block_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_backup_audit_logs_block_update BEFORE UPDATE ON public.backup_audit_logs FOR EACH ROW EXECUTE FUNCTION public.backup_audit_logs_block_update();


--
-- Name: admin_users FK_admin_users_role; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT "FK_admin_users_role" FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE RESTRICT;


--
-- Name: backup_audit_logs FK_backup_audit_logs_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backup_audit_logs
    ADD CONSTRAINT "FK_backup_audit_logs_tenant" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: cash_transactions FK_cash_transactions_location; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_transactions
    ADD CONSTRAINT "FK_cash_transactions_location" FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: cash_transactions FK_cash_transactions_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_transactions
    ADD CONSTRAINT "FK_cash_transactions_tenant" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: cashback_consumptions FK_cashback_consumptions_customer; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashback_consumptions
    ADD CONSTRAINT "FK_cashback_consumptions_customer" FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: cashback_consumptions FK_cashback_consumptions_ledger_entry; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashback_consumptions
    ADD CONSTRAINT "FK_cashback_consumptions_ledger_entry" FOREIGN KEY (ledger_entry_id) REFERENCES public.cashback_ledger_entries(id) ON DELETE CASCADE;


--
-- Name: cashback_consumptions FK_cashback_consumptions_order; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashback_consumptions
    ADD CONSTRAINT "FK_cashback_consumptions_order" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: cashback_consumptions FK_cashback_consumptions_table_session; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashback_consumptions
    ADD CONSTRAINT "FK_cashback_consumptions_table_session" FOREIGN KEY (table_session_id) REFERENCES public.table_sessions(id) ON DELETE CASCADE;


--
-- Name: cashback_consumptions FK_cashback_consumptions_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashback_consumptions
    ADD CONSTRAINT "FK_cashback_consumptions_tenant" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: cashback_ledger_entries FK_cashback_ledger_entries_customer; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashback_ledger_entries
    ADD CONSTRAINT "FK_cashback_ledger_entries_customer" FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: cashback_ledger_entries FK_cashback_ledger_entries_location; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashback_ledger_entries
    ADD CONSTRAINT "FK_cashback_ledger_entries_location" FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: cashback_ledger_entries FK_cashback_ledger_entries_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashback_ledger_entries
    ADD CONSTRAINT "FK_cashback_ledger_entries_tenant" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: cashback_settings_locations FK_cashback_settings_locations_location; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashback_settings_locations
    ADD CONSTRAINT "FK_cashback_settings_locations_location" FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: cashback_settings_locations FK_cashback_settings_locations_settings; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashback_settings_locations
    ADD CONSTRAINT "FK_cashback_settings_locations_settings" FOREIGN KEY (cashback_settings_id) REFERENCES public.cashback_settings(id) ON DELETE CASCADE;


--
-- Name: cashback_settings FK_cashback_settings_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashback_settings
    ADD CONSTRAINT "FK_cashback_settings_tenant" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: internal_notification_reads FK_internal_notification_reads_notification; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_notification_reads
    ADD CONSTRAINT "FK_internal_notification_reads_notification" FOREIGN KEY (notification_id) REFERENCES public.internal_notifications(id) ON DELETE CASCADE;


--
-- Name: internal_notifications FK_internal_notifications_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_notifications
    ADD CONSTRAINT "FK_internal_notifications_tenant" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: loyalty_program_locations FK_loyalty_program_locations_location; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_program_locations
    ADD CONSTRAINT "FK_loyalty_program_locations_location" FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: loyalty_program_locations FK_loyalty_program_locations_program; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_program_locations
    ADD CONSTRAINT "FK_loyalty_program_locations_program" FOREIGN KEY (loyalty_program_id) REFERENCES public.loyalty_programs(id) ON DELETE CASCADE;


--
-- Name: loyalty_programs FK_loyalty_programs_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_programs
    ADD CONSTRAINT "FK_loyalty_programs_tenant" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: loyalty_rewards FK_loyalty_rewards_program; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_rewards
    ADD CONSTRAINT "FK_loyalty_rewards_program" FOREIGN KEY (program_id) REFERENCES public.loyalty_programs(id) ON DELETE CASCADE;


--
-- Name: loyalty_stamps FK_loyalty_stamps_program; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_stamps
    ADD CONSTRAINT "FK_loyalty_stamps_program" FOREIGN KEY (program_id) REFERENCES public.loyalty_programs(id) ON DELETE CASCADE;


--
-- Name: loyalty_stamps FK_loyalty_stamps_redemption; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_stamps
    ADD CONSTRAINT "FK_loyalty_stamps_redemption" FOREIGN KEY (redemption_id) REFERENCES public.receipt_redemptions(id) ON DELETE CASCADE;


--
-- Name: loyalty_stamps FK_loyalty_stamps_reward; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_stamps
    ADD CONSTRAINT "FK_loyalty_stamps_reward" FOREIGN KEY (reward_id) REFERENCES public.loyalty_rewards(id) ON DELETE SET NULL;


--
-- Name: notes FK_notes_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT "FK_notes_tenant" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: order_promotion_discounts FK_order_promotion_discounts_order; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_promotion_discounts
    ADD CONSTRAINT "FK_order_promotion_discounts_order" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_promotion_discounts FK_order_promotion_discounts_promotion; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_promotion_discounts
    ADD CONSTRAINT "FK_order_promotion_discounts_promotion" FOREIGN KEY (promotion_id) REFERENCES public.promotions(id) ON DELETE CASCADE;


--
-- Name: orders FK_orders_location; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT "FK_orders_location" FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: orders FK_orders_promotion; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT "FK_orders_promotion" FOREIGN KEY (promotion_id) REFERENCES public.promotions(id) ON DELETE SET NULL;


--
-- Name: orders FK_orders_table_participant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT "FK_orders_table_participant" FOREIGN KEY (table_participant_id) REFERENCES public.table_session_participants(id) ON DELETE SET NULL;


--
-- Name: promotion_categories FK_promotion_categories_category; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_categories
    ADD CONSTRAINT "FK_promotion_categories_category" FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE;


--
-- Name: promotion_categories FK_promotion_categories_promotion; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_categories
    ADD CONSTRAINT "FK_promotion_categories_promotion" FOREIGN KEY (promotion_id) REFERENCES public.promotions(id) ON DELETE CASCADE;


--
-- Name: promotion_customer_resets FK_promotion_customer_resets_customer; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_customer_resets
    ADD CONSTRAINT "FK_promotion_customer_resets_customer" FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: promotion_customer_resets FK_promotion_customer_resets_promotion; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_customer_resets
    ADD CONSTRAINT "FK_promotion_customer_resets_promotion" FOREIGN KEY (promotion_id) REFERENCES public.promotions(id) ON DELETE CASCADE;


--
-- Name: promotion_locations FK_promotion_locations_location; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_locations
    ADD CONSTRAINT "FK_promotion_locations_location" FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: promotion_locations FK_promotion_locations_promotion; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_locations
    ADD CONSTRAINT "FK_promotion_locations_promotion" FOREIGN KEY (promotion_id) REFERENCES public.promotions(id) ON DELETE CASCADE;


--
-- Name: promotion_products FK_promotion_products_product; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_products
    ADD CONSTRAINT "FK_promotion_products_product" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: promotion_products FK_promotion_products_promotion; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_products
    ADD CONSTRAINT "FK_promotion_products_promotion" FOREIGN KEY (promotion_id) REFERENCES public.promotions(id) ON DELETE CASCADE;


--
-- Name: promotions FK_promotions_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotions
    ADD CONSTRAINT "FK_promotions_tenant" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: push_subscriptions FK_push_subscriptions_customer; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT "FK_push_subscriptions_customer" FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: push_subscriptions FK_push_subscriptions_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT "FK_push_subscriptions_tenant" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: receipt_redemptions FK_receipt_redemptions_location; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipt_redemptions
    ADD CONSTRAINT "FK_receipt_redemptions_location" FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: receipt_redemptions FK_receipt_redemptions_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipt_redemptions
    ADD CONSTRAINT "FK_receipt_redemptions_tenant" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: review_responses FK_review_responses_review; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_responses
    ADD CONSTRAINT "FK_review_responses_review" FOREIGN KEY (review_id) REFERENCES public.reviews(id) ON DELETE CASCADE;


--
-- Name: review_responses FK_review_responses_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_responses
    ADD CONSTRAINT "FK_review_responses_tenant" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: reviews FK_reviews_customer; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT "FK_reviews_customer" FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: reviews FK_reviews_location; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT "FK_reviews_location" FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: reviews FK_reviews_order; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT "FK_reviews_order" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: reviews FK_reviews_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT "FK_reviews_tenant" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: role_permissions FK_role_permissions_permission; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT "FK_role_permissions_permission" FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON DELETE CASCADE;


--
-- Name: role_permissions FK_role_permissions_role; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT "FK_role_permissions_role" FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: roles FK_roles_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT "FK_roles_tenant" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: table_sessions FK_table_sessions_cashback_customer; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.table_sessions
    ADD CONSTRAINT "FK_table_sessions_cashback_customer" FOREIGN KEY (cashback_requested_by_customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: table_sessions FK_table_sessions_closing_customer; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.table_sessions
    ADD CONSTRAINT "FK_table_sessions_closing_customer" FOREIGN KEY (closing_requested_by_customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: restaurant_tables FK_tables_location; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.restaurant_tables
    ADD CONSTRAINT "FK_tables_location" FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: tenant_backup_settings FK_tenant_backup_settings_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_backup_settings
    ADD CONSTRAINT "FK_tenant_backup_settings_tenant" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: tenant_backups FK_tenant_backups_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_backups
    ADD CONSTRAINT "FK_tenant_backups_tenant" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: user_push_subscriptions FK_user_push_subscriptions_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_push_subscriptions
    ADD CONSTRAINT "FK_user_push_subscriptions_tenant" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: waiter_calls FK_waiter_calls_participant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waiter_calls
    ADD CONSTRAINT "FK_waiter_calls_participant" FOREIGN KEY (table_participant_id) REFERENCES public.table_session_participants(id) ON DELETE SET NULL;


--
-- Name: admin_users admin_users_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: categories categories_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: customers customers_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: locations locations_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: orders orders_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: orders orders_table_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_table_session_id_fkey FOREIGN KEY (table_session_id) REFERENCES public.table_sessions(id);


--
-- Name: orders orders_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: product_option_values product_option_values_option_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_option_values
    ADD CONSTRAINT product_option_values_option_id_fkey FOREIGN KEY (option_id) REFERENCES public.product_options(id) ON DELETE CASCADE;


--
-- Name: product_options product_options_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_options
    ADD CONSTRAINT product_options_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: products products_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE;


--
-- Name: products products_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: restaurant_tables restaurant_tables_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.restaurant_tables
    ADD CONSTRAINT restaurant_tables_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: table_session_participants table_session_participants_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.table_session_participants
    ADD CONSTRAINT table_session_participants_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: table_session_participants table_session_participants_table_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.table_session_participants
    ADD CONSTRAINT table_session_participants_table_session_id_fkey FOREIGN KEY (table_session_id) REFERENCES public.table_sessions(id) ON DELETE CASCADE;


--
-- Name: table_sessions table_sessions_table_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.table_sessions
    ADD CONSTRAINT table_sessions_table_id_fkey FOREIGN KEY (table_id) REFERENCES public.restaurant_tables(id) ON DELETE CASCADE;


--
-- Name: table_sessions table_sessions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.table_sessions
    ADD CONSTRAINT table_sessions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: waiter_calls waiter_calls_table_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waiter_calls
    ADD CONSTRAINT waiter_calls_table_session_id_fkey FOREIGN KEY (table_session_id) REFERENCES public.table_sessions(id) ON DELETE CASCADE;


--
-- Name: waiter_calls waiter_calls_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waiter_calls
    ADD CONSTRAINT waiter_calls_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict 6QfgrlGfJdCaPY7G2gxQoKIiYalBGCCUPCzo5HTCwmugDaAdfVnD5xsfHHjGOXX

