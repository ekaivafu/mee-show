/**
 * Meesho Offer Bot - Backend Server & Telegram Mini App
 * Developer: @tgekaiva
 * 
 * API Endpoints:
 * - GET /api/signup/config - Signup configuration
 * - GET /api/meesho/for-you - Product feed (requires auth)
 * - GET /api/account/pool_status - Account pool status (requires auth)
 * - GET /api/bootstrap - Bootstrap data (requires auth)
 * - GET /api/master_address - Master address (requires auth)
 * - POST /api/auth/cookie-login - Login with cookies
 * - POST /api/auth/signup - Sign up with phone
 * - POST /api/telegram-webhook - Telegram webhook listener
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN || '8921829426:AAGrTjKbs0QYNu5p_TeEdq2IcfVPt1x90PI';
const TG_WEBAPP_URL = process.env.TG_WEBAPP_URL || '';
const ADMIN_TELEGRAM = process.env.ADMIN_TELEGRAM || 'tgekaiva';

// Middleware
app.use(helmet({
    contentSecurityPolicy: false // Allow Telegram inline scripts
}));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../frontend')));

// In-memory database (replace with real DB in production)
const db = {
    accounts: [],
    orders: [],
    carts: {},
    addresses: [],
    products: generateSeedProducts(),
    sessions: {}
};

// Generate seed products
function generateSeedProducts() {
    const categories = ['Fashion', 'Electronics', 'Home & Kitchen', 'Beauty', 'Sports'];
    const products = [];
    
    for (let i = 1; i <= 50; i++) {
        const category = categories[Math.floor(Math.random() * categories.length)];
        const discount = Math.floor(Math.random() * 70) + 10;
        const originalPrice = Math.floor(Math.random() * 5000) + 200;
        
        products.push({
            id: `prod_${uuidv4().substring(0, 8)}`,
            name: `${category} Product ${i}`,
            description: `High quality ${category.toLowerCase()} item with amazing features and great value for money.`,
            price: originalPrice,
            discount: discount,
            finalPrice: Math.floor(originalPrice * (100 - discount) / 100),
            image: `https://picsum.photos/400/400?random=${i}`,
            category: category,
            rating: (3.5 + Math.random() * 1.5).toFixed(1),
            reviews: Math.floor(Math.random() * 500) + 10,
            inStock: Math.random() > 0.1
        });
    }
    
    return products;
}

// ==================== PUBLIC ENDPOINTS ====================

/**
 * Verify Telegram Mini App initData using HMAC-SHA256
 */
function verifyTelegramInitData(initData, botToken) {
    if (!initData || !botToken) return null;
    try {
        const urlParams = new URLSearchParams(initData);
        const hash = urlParams.get('hash');
        if (!hash) return null;
        urlParams.delete('hash');
        const params = Array.from(urlParams.entries())
            .map(([key, value]) => `${key}=${value}`)
            .sort()
            .join('\n');
        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
        const calculatedHash = crypto.createHmac('sha256', secretKey).update(params).digest('hex');
        if (calculatedHash === hash) {
            const userStr = urlParams.get('user');
            return userStr ? JSON.parse(userStr) : null;
        }
        return null;
    } catch (e) {
        return null;
    }
}

/**
 * GET /api/signup/config
 * Returns signup configuration
 */
app.get('/api/signup/config', (req, res) => {
    res.json({
        ok: true,
        enabled: true,
        banner: "Sign up & claim ₹170 OFF",
        developer: `@${ADMIN_TELEGRAM}`,
        support_url: `https://t.me/${ADMIN_TELEGRAM}`,
        default_ref: `https://t.me/${ADMIN_TELEGRAM}`
    });
});

// ==================== AUTH REQUIRED ENDPOINTS ====================

// Auth middleware
const requireAuth = (req, res, next) => {
    const authHeader = req.headers['x-tg-init-data'] || req.query.tgib || req.headers.authorization;
    
    if (!authHeader) {
        return res.status(401).json({ error: 'no_account', message: 'Authentication required' });
    }
    
    // Check if verified Telegram user
    const tgUser = verifyTelegramInitData(authHeader, TG_BOT_TOKEN);
    let session = null;
    const sessionId = tgUser ? `tg_${tgUser.id}` : authHeader.substring(0, 50);
    
    if (db.sessions[sessionId]) {
        session = db.sessions[sessionId];
    } else {
        // Create new session
        session = {
            id: sessionId,
            accountId: null,
            createdAt: new Date()
        };
        db.sessions[sessionId] = session;
    }

    // Auto-create/sync account if logged in through Telegram WebApp
    if (tgUser && !session.accountId) {
        let account = db.accounts.find(a => a.telegramId === tgUser.id);
        if (!account) {
            account = {
                id: uuidv4(),
                telegramId: tgUser.id,
                name: [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || tgUser.username || 'User',
                username: tgUser.username || null,
                createdAt: new Date(),
                wallet: { balance: parseInt(process.env.SIGNUP_BONUS_AMOUNT, 10) || 170 }
            };
            db.accounts.push(account);
        }
        session.accountId = account.id;
    }
    
    req.session = session;
    next();
};

/**
 * GET /api/bootstrap
 * Returns bootstrap data for authenticated users
 */
app.get('/api/bootstrap', requireAuth, (req, res) => {
    const account = req.session.accountId ? 
        db.accounts.find(a => a.id === req.session.accountId) : null;
    
    res.json({
        ok: true,
        user: account ? {
            id: account.id,
            mobile: account.mobile,
            name: account.name
        } : null,
        wallet: account ? account.wallet : { balance: 0 },
        cartCount: Object.keys(db.carts[req.session.id] || {}).length
    });
});

/**
 * GET /api/meesho/for-you
 * Returns product feed
 */
app.get('/api/meesho/for-you', requireAuth, (req, res) => {
    const limit = parseInt(req.query.limit) || 12;
    const offset = parseInt(req.query.offset) || 0;
    
    const products = db.products
        .filter(p => p.inStock)
        .slice(offset, offset + limit);
    
    res.json({
        ok: true,
        products: products,
        total: products.length,
        hasMore: offset + limit < db.products.length
    });
});

/**
 * GET /api/account/pool_status
 * Returns available account pool status
 */
app.get('/api/account/pool_status', requireAuth, (req, res) => {
    res.json({
        ok: true,
        available: Math.floor(Math.random() * 10), // Simulated
        price: 40,
        currency: 'INR'
    });
});

/**
 * GET /api/master_address
 * Returns master addresses
 */
app.get('/api/master_address', requireAuth, (req, res) => {
    res.json({
        ok: true,
        addresses: [
            {
                id: 'addr_1',
                name: 'Primary Warehouse',
                fullAddress: '123 MG Road, Bangalore, Karnataka 560001',
                pincode: '560001',
                isDefault: true
            }
        ]
    });
});

/**
 * POST /api/auth/cookie-login
 * Login with Meesho cookies
 */
app.post('/api/auth/cookie-login', (req, res) => {
    const { cookies } = req.body;
    
    if (!cookies) {
        return res.status(400).json({ 
            ok: false, 
            error: 'missing_cookies',
            message: 'Cookies are required' 
        });
    }
    
    // Create account from cookies
    const account = {
        id: uuidv4(),
        cookies: cookies,
        createdAt: new Date(),
        wallet: { balance: 0 },
        name: 'Imported Account'
    };
    
    db.accounts.push(account);
    
    // Create session
    const sessionId = uuidv4();
    db.sessions[sessionId] = {
        id: sessionId,
        accountId: account.id,
        createdAt: new Date()
    };
    
    res.json({
        ok: true,
        account: {
            id: account.id,
            name: account.name
        },
        token: sessionId
    });
});

/**
 * POST /api/auth/signup
 * Sign up with phone number
 */
app.post('/api/auth/signup', (req, res) => {
    const { mobile, name, ref } = req.body;
    
    if (!mobile) {
        return res.status(400).json({ 
            ok: false, 
            error: 'missing_mobile',
            message: 'Mobile number is required' 
        });
    }
    
    // Check if account exists
    let account = db.accounts.find(a => a.mobile === mobile);
    
    if (!account) {
        account = {
            id: uuidv4(),
            mobile: mobile,
            name: name || 'User',
            createdAt: new Date(),
            wallet: { balance: 170 }, // Signup bonus
            referrer: ref || null
        };
        db.accounts.push(account);
    }
    
    // Create session
    const sessionId = uuidv4();
    db.sessions[sessionId] = {
        id: sessionId,
        accountId: account.id,
        createdAt: new Date()
    };
    
    res.json({
        ok: true,
        account: {
            id: account.id,
            mobile: account.mobile,
            name: account.name,
            wallet: account.wallet
        },
        token: sessionId,
        isNew: !db.accounts.find(a => a.mobile === mobile && a.id !== account.id)
    });
});

// ==================== CART ENDPOINTS ====================

/**
 * GET /api/cart
 * Get user's cart
 */
app.get('/api/cart', requireAuth, (req, res) => {
    const cart = db.carts[req.session.id] || {};
    const items = Object.values(cart);
    
    res.json({
        ok: true,
        items: items,
        count: items.length,
        total: items.reduce((sum, item) => sum + (item.price * item.qty), 0)
    });
});

/**
 * POST /api/cart/add
 * Add item to cart
 */
app.post('/api/cart/add', requireAuth, (req, res) => {
    const { productId, qty = 1 } = req.body;
    const product = db.products.find(p => p.id === productId);
    
    if (!product) {
        return res.status(404).json({ ok: false, error: 'Product not found' });
    }
    
    if (!db.carts[req.session.id]) {
        db.carts[req.session.id] = {};
    }
    
    if (db.carts[req.session.id][productId]) {
        db.carts[req.session.id][productId].qty += qty;
    } else {
        db.carts[req.session.id][productId] = {
            productId: product.id,
            name: product.name,
            price: product.finalPrice,
            image: product.image,
            qty: qty
        };
    }
    
    res.json({ ok: true, message: 'Added to cart' });
});

/**
 * POST /api/cart/remove
 * Remove item from cart
 */
app.post('/api/cart/remove', requireAuth, (req, res) => {
    const { productId } = req.body;
    
    if (db.carts[req.session.id] && db.carts[req.session.id][productId]) {
        delete db.carts[req.session.id][productId];
    }
    
    res.json({ ok: true, message: 'Removed from cart' });
});

// ==================== ORDER ENDPOINTS ====================

/**
 * GET /api/orders
 * Get user's orders
 */
app.get('/api/orders', requireAuth, (req, res) => {
    const orders = db.orders.filter(o => o.sessionId === req.session.id);
    
    res.json({
        ok: true,
        orders: orders.reverse() // Newest first
    });
});

/**
 * POST /api/orders/create
 * Create new order
 */
app.post('/api/orders/create', requireAuth, (req, res) => {
    const { items, addressId } = req.body;
    const cart = db.carts[req.session.id] || {};
    const orderItems = items || Object.values(cart);
    
    if (orderItems.length === 0) {
        return res.status(400).json({ ok: false, error: 'Cart is empty' });
    }
    
    const order = {
        id: `ORD_${uuidv4().substring(0, 8).toUpperCase()}`,
        sessionId: req.session.id,
        items: orderItems,
        total: orderItems.reduce((sum, item) => sum + (item.price * item.qty), 0),
        status: 'placed',
        addressId: addressId || null,
        createdAt: new Date()
    };
    
    db.orders.push(order);
    
    // Clear cart
    db.carts[req.session.id] = {};
    
    res.json({
        ok: true,
        order: order,
        message: 'Order placed successfully!'
    });
});

// ==================== ADDRESS ENDPOINTS ====================

/**
 * GET /api/addresses
 * Get user's addresses
 */
app.get('/api/addresses', requireAuth, (req, res) => {
    const addresses = db.addresses.filter(a => a.sessionId === req.session.id);
    
    res.json({
        ok: true,
        addresses: addresses
    });
});

/**
 * POST /api/addresses/add
 * Add new address
 */
app.post('/api/addresses/add', requireAuth, (req, res) => {
    const { name, fullAddress, pincode, phone, isDefault } = req.body;
    
    if (!fullAddress || !pincode) {
        return res.status(400).json({ ok: false, error: 'Address and pincode required' });
    }
    
    const address = {
        id: uuidv4(),
        sessionId: req.session.id,
        name: name || 'Home',
        fullAddress,
        pincode,
        phone: phone || '',
        isDefault: isDefault || false,
        createdAt: new Date()
    };
    
    db.addresses.push(address);
    
    res.json({
        ok: true,
        address: address,
        message: 'Address added successfully'
    });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        ok: true, 
        status: 'healthy',
        timestamp: new Date(),
        uptime: process.uptime()
    });
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ==================== TELEGRAM BOT HANDLER ====================

// Webhook endpoint (optional alternative to polling)
app.post('/api/telegram-webhook', async (req, res) => {
    res.sendStatus(200);
    if (req.body && req.body.message) {
        await handleBotMessage(TG_BOT_TOKEN, req.body.message);
    }
});

// Bot message responder
async function handleBotMessage(token, msg) {
    if (!token || !msg) return;
    const chatId = msg.chat.id;
    const firstName = msg.from ? msg.from.first_name : 'Friend';
    const webAppUrl = process.env.TG_WEBAPP_URL || TG_WEBAPP_URL;

    const welcomeText = `👋 *Hey ${firstName}! Welcome to Meesho Offer Bot!*\n\n` +
        `🛍️ Browse top-trending fashion, gadgets & accessories at up to *70% OFF*.\n` +
        `💰 Instant *₹170 OFF* credited to your wallet upon joining.\n` +
        `📦 Easy ordering with fast delivery.\n\n` +
        `✨ *Developer & Support:* @${ADMIN_TELEGRAM}`;

    const inlineKeyboard = [];
    if (webAppUrl) {
        inlineKeyboard.push([{ text: "🛒 Open Meesho Mini App", web_app: { url: webAppUrl } }]);
    }
    inlineKeyboard.push([
        { text: `💬 Contact Developer (@${ADMIN_TELEGRAM})`, url: `https://t.me/${ADMIN_TELEGRAM}` }
    ]);

    try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: welcomeText,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: inlineKeyboard
                }
            })
        });
    } catch (e) {
        console.error('Error sending Telegram message:', e.message);
    }
}

// Telegram Bot polling loop
async function startTelegramBot(token) {
    if (!token) {
        console.log('⚠️ No TG_BOT_TOKEN provided. Telegram bot listener disabled.');
        return;
    }
    console.log('🤖 Telegram Bot listener started for @meesho_offerbot');

    // Automatically configure Menu Button if TG_WEBAPP_URL is set
    if (process.env.TG_WEBAPP_URL) {
        try {
            await fetch(`https://api.telegram.org/bot${token}/setChatMenuButton`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    menu_button: {
                        type: 'web_app',
                        text: '🛒 Open Meesho Loot',
                        web_app: { url: process.env.TG_WEBAPP_URL }
                    }
                })
            });
            console.log(`✅ Telegram Menu Button configured: ${process.env.TG_WEBAPP_URL}`);
        } catch (e) {
            console.error('Failed to configure menu button:', e.message);
        }
    }

    let offset = 0;
    while (true) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 35000);
            const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=25`, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            const data = await res.json();
            if (data.ok && Array.isArray(data.result)) {
                for (const update of data.result) {
                    offset = update.update_id + 1;
                    if (update.message) {
                        await handleBotMessage(token, update.message);
                    }
                }
            }
        } catch (err) {
            // Wait 3 seconds on error / timeout before next cycle
            await new Promise(r => setTimeout(r, 3000));
        }
    }
}

// Start server
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🛒 MEESHO OFFER BOT - SERVER ONLINE                     ║
║   Developer: @${ADMIN_TELEGRAM.padEnd(43)}║
║                                                           ║
║   Running on: http://localhost:${String(PORT).padEnd(27)}║
║   Environment: ${String(process.env.NODE_ENV || 'development').padEnd(26)}║
║   Time: ${new Date().toISOString()}         ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);

    // Start telegram bot polling in background
    if (TG_BOT_TOKEN) {
        startTelegramBot(TG_BOT_TOKEN);
    }
});

module.exports = app;

