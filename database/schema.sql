-- Meesho Loot Database Schema
-- Developer: @tgekaiva

-- ==================== USERS/ACCOUNTS TABLE ====================
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mobile VARCHAR(20) UNIQUE,
    name VARCHAR(100) NOT NULL DEFAULT 'User',
    cookies TEXT,
    wallet_balance DECIMAL(10,2) DEFAULT 0,
    referrer_id UUID REFERENCES accounts(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on mobile for fast lookups
CREATE INDEX IF NOT EXISTS idx_accounts_mobile ON accounts(mobile);

-- ==================== SESSIONS TABLE ====================
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) UNIQUE NOT NULL,
    user_agent TEXT,
    ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 days'),
    is_active BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions(account_id);

-- ==================== PRODUCTS TABLE ====================
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    price DECIMAL(10,2) NOT NULL,
    discount_percent INTEGER DEFAULT 0,
    final_price DECIMAL(10,2) GENERATED ALWAYS AS (
        ROUND(price * (1 - discount_percent / 100.0), 2)
    ) STORED,
    image_url TEXT,
    rating DECIMAL(3,2) DEFAULT 0,
    review_count INTEGER DEFAULT 0,
    in_stock BOOLEAN DEFAULT true,
    meesho_product_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_in_stock ON products(in_stock);

-- ==================== CART ITEMS TABLE ====================
CREATE TABLE IF NOT EXISTS cart_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    quantity INTEGER NOT NULL DEFAULT 1,
    price_at_addition DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(session_id, product_id)
);

-- ==================== ORDERS TABLE ====================
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    session_id UUID REFERENCES sessions(id),
    account_id UUID REFERENCES accounts(id),
    total_amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(50) DEFAULT 'placed' CHECK (status IN ('placed','confirmed','shipped','delivered','cancelled')),
    shipping_address_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_account ON orders(account_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);

-- ==================== ORDER ITEMS TABLE ====================
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    product_name VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL,
    price_per_unit DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) GENERATED ALWAYS AS (quantity * price_per_unit) STORED
);

-- ==================== ADDRESSES TABLE ====================
CREATE TABLE IF NOT EXISTS addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    account_id UUID REFERENCES accounts(id),
    name VARCHAR(100) NOT NULL DEFAULT 'Home',
    full_address TEXT NOT NULL,
    pincode VARCHAR(10) NOT NULL,
    city VARCHAR(100),
    state VARCHAR(100),
    phone VARCHAR(20),
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_addresses_account ON addresses(account_id);

-- ==================== SIGNUP CONFIG TABLE ====================
CREATE TABLE IF NOT EXISTS signup_config (
    id SERIAL PRIMARY KEY,
    is_enabled BOOLEAN DEFAULT true,
    banner_text VARCHAR(255),
    bonus_amount DECIMAL(10,2) DEFAULT 170,
    default_referral_link TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default config
INSERT INTO signup_config (is_enabled, banner_text, bonus_amount, default_referral_link)
VALUES (true, 'Sign up & claim ₹170 OFF', 170, 'https://app.meesho.com/2yoV/r99th0qd?via=d5392&from=home_page_pill')
ON CONFLICT (id) DO NOTHING;

-- ==================== SEED DATA ====================
-- Insert sample products
INSERT INTO products (name, description, category, price, discount_percent, image_url, rating, review_count, in_stock) VALUES
('Fashion T-Shirt', 'Cotton blend t-shirt, comfortable and stylish', 'Fashion', 599, 40, 'https://picsum.photos/400/400?random=1', 4.2, 156, true),
('Wireless Earbuds', 'Bluetooth 5.0 earbuds with noise cancellation', 'Electronics', 1499, 25, 'https://picsum.photos/400/400?random=2', 4.5, 89, true),
('Kitchen Organizer Set', 'Premium quality kitchen storage set', 'Home & Kitchen', 899, 30, 'https://picsum.photos/400/400?random=3', 4.0, 234, true),
('Face Serum', 'Vitamin C serum for glowing skin', 'Beauty', 699, 50, 'https://picsum.photos/400/400?random=4', 4.7, 567, true),
('Yoga Mat', 'Anti-slip yoga mat with carrying strap', 'Sports', 1299, 20, 'https://picsum.photos/400/400?random=5', 4.3, 78, true)
ON CONFLICT DO NOTHING;
