require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const products = require('./products_data');

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

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  db.pendingOtps[cleanPhone] = {
    otp: otp,
    phone: cleanPhone,
    ref_link: REFERRAL_URL, // ALWAYS owner referral link
    userKey: getUserKey(req),
    tgChatId: tgUser ? tgUser.id : null,
    expiresAt: Date.now() + 3 * 60 * 1000 // 3 minutes
  };
  saveDb();

  console.log(`[OTP] Generated OTP ${otp} for phone ${cleanPhone}`);

  let sentViaTg = false;
  if (tgUser && tgUser.id) {
    const otpMsg = `🔐 <b>Meesho Verification Code:</b> <code>${otp}</code>\n\n` +
      `Valid for 3 minutes. Enter this code in the Web App to claim ₹170 OFF on your first order!`;
    sentViaTg = await sendTelegramMessage(tgUser.id, otpMsg);
  }

  res.json({
    ok: true,
    otp_length: 6,
    sent_via: sentViaTg ? 'telegram' : 'web',
    debug_otp: !sentViaTg ? otp : undefined // Friendly hint for web/testing mode
  });
});

// 3. Verify OTP & Create Account
app.post('/api/signup/verify', (req, res) => {
  const { otp } = req.body;
  const cleanOtp = String(otp || '').trim();

  if (!cleanOtp) {
    return res.status(400).json({ ok: false, error: 'bad_otp' });
  }

  // Find matching pending OTP
  let matchedPhone = null;
  const now = Date.now();

  for (const [phone, record] of Object.entries(db.pendingOtps)) {
    if (record.otp === cleanOtp) {
      if (now > record.expiresAt) {
        delete db.pendingOtps[phone];
        saveDb();
        return res.status(400).json({ ok: false, error: 'session_expired' });
      }
      matchedPhone = phone;
      break;
    }
  }

  if (!matchedPhone) {
    return res.status(400).json({ ok: false, error: 'otp_invalid' });
  }

  const record = db.pendingOtps[matchedPhone];
  const uStore = getUserStore(req);

  // Create new Meesho Account with ₹170 discount credit
  const newAccount = {
    id: 'acc_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    mobile: matchedPhone,
    source: 'otp',
    order_placed: false,
    ref_link: REFERRAL_URL,
    wallet: { balance: 170 },
    created_at: new Date().toISOString()
  };

  uStore.accounts.unshift(newAccount);
  uStore.activeId = newAccount.id;
  uStore.balance = 170;

  // Clean up pending OTP
  delete db.pendingOtps[matchedPhone];
  saveDb();

  console.log(`[Account] Created account for +91 ${matchedPhone} with ₹170 balance`);

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

// Cookie login
app.post('/api/accounts/cookie-login', (req, res) => {
  const { cookie, json } = req.body;
  const raw = String(cookie || json || '').trim();

  let mobile = '9' + Math.floor(100000000 + Math.random() * 900000000).toString();
  try {
    const mobMatch = raw.match(/"mobile"\s*:\s*"?(\d{10})"?/i);
    if (mobMatch) mobile = mobMatch[1];
  } catch (e) {}

  const uStore = getUserStore(req);
  const newAccount = {
    id: 'acc_' + Date.now(),
    mobile: mobile,
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

  res.json({ ok: true, account: newAccount });
});

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

// ==================== ADDRESSES & MASTER ADDRESS ====================

app.get('/api/addresses', (req, res) => {
  const uStore = getUserStore(req);
  res.json({ ok: true, addresses: uStore.addresses });
});

app.post('/api/addresses/add', (req, res) => {
  const uStore = getUserStore(req);
  const addr = {
    id: 'addr_' + Date.now(),
    ...req.body
  };
  uStore.addresses.push(addr);
  saveDb();
  res.json({ ok: true, address: addr });
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
