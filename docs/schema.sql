-- ============================================================
-- SCHEMA MULTI-TENANT - CARDÁPIO DIGITAL SAAS
-- Stack: PostgreSQL (Render ou Supabase)
-- ============================================================

-- 1. TENANTS (cada estabelecimento cliente do SaaS)
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(100) UNIQUE NOT NULL,        -- ex: "hamburgueria-do-joao" (usado na URL)
  name VARCHAR(150) NOT NULL,               -- nome exibido do estabelecimento
  logo_url TEXT,                            -- Supabase Storage
  cover_image_url TEXT,                     -- banner do topo do cardápio
  primary_color VARCHAR(7) DEFAULT '#E63946', -- cor do tema (hex)
  secondary_color VARCHAR(7) DEFAULT '#1D3557',
  whatsapp_number VARCHAR(20),              -- pra onde vai o pedido
  address TEXT,
  is_open BOOLEAN DEFAULT true,             -- liga/desliga recebimento de pedidos
  opening_hours JSONB,                      -- {"mon": "18:00-23:00", ...}
  plan VARCHAR(20) DEFAULT 'trial',         -- trial, basico, pro
  is_active BOOLEAN DEFAULT true,           -- suspende cliente inadimplente sem deletar dados
  delivery_fee NUMERIC(10,2) DEFAULT 0,
  min_order_value NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  deleted_at TIMESTAMP                       -- soft delete: nunca apagar tenant de verdade
);

-- 2. ADMIN USERS (donos/gerentes do estabelecimento — quem loga no painel)
CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email VARCHAR(150) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(150),
  role VARCHAR(20) DEFAULT 'owner',         -- owner, staff (se quiser múltiplos logins depois)
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  deleted_at TIMESTAMP
);

-- 3. CATEGORIES (Bebidas, Pratos, Sobremesas...)
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  display_order INT DEFAULT 0,              -- ordem de exibição no cardápio
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  deleted_at TIMESTAMP
);

-- 4. PRODUCTS (itens do cardápio)
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL,
  promo_price NUMERIC(10,2),                -- preço promocional opcional
  image_url TEXT,                           -- Supabase Storage
  is_available BOOLEAN DEFAULT true,        -- dono desliga item que acabou, sem deletar
  display_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  deleted_at TIMESTAMP
);

-- 5. PRODUCT VARIANTS/OPTIONS (opcional — ex: tamanho P/M/G, ponto da carne)
CREATE TABLE product_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,               -- ex: "Tamanho"
  is_required BOOLEAN DEFAULT false,
  allow_multiple BOOLEAN DEFAULT false,     -- checkbox vs radio
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE product_option_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  option_id UUID NOT NULL REFERENCES product_options(id) ON DELETE CASCADE,
  label VARCHAR(100) NOT NULL,              -- ex: "Grande"
  price_delta NUMERIC(10,2) DEFAULT 0       -- acréscimo no preço
);

-- 6. ORDERS (pedidos feitos pelos clientes finais)
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_name VARCHAR(150),
  customer_phone VARCHAR(20),
  table_number VARCHAR(20),                 -- se for consumo no local
  order_type VARCHAR(20) DEFAULT 'balcao',  -- balcao, mesa, entrega
  status VARCHAR(20) DEFAULT 'pendente',    -- pendente, confirmado, preparando, pronto, entregue, cancelado
  total NUMERIC(10,2) NOT NULL,
  delivery_fee NUMERIC(10,2) DEFAULT 0,
  payment_method VARCHAR(20),                -- dinheiro, pix, cartao, indefinido
  payment_status VARCHAR(20) DEFAULT 'pendente', -- pendente, pago, falhou
  notes TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- 7. ORDER ITEMS
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  product_name VARCHAR(150) NOT NULL,       -- snapshot (caso o produto mude depois)
  quantity INT NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL,
  selected_options JSONB,                   -- snapshot das opções escolhidas
  subtotal NUMERIC(10,2) NOT NULL
);

-- ============================================================
-- ÍNDICES (performance em queries filtradas por tenant)
-- ============================================================
CREATE INDEX idx_categories_tenant ON categories(tenant_id);
CREATE INDEX idx_products_tenant ON products(tenant_id);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_orders_tenant ON orders(tenant_id);
CREATE INDEX idx_orders_status ON orders(tenant_id, status);
CREATE INDEX idx_tenants_slug ON tenants(slug);
