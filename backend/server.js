/**
 * Meesho Offer Bot — Backend Server
 * Developer: @tgekaiva
 *
 * A clean Telegram Mini App that drives users to Meesho
 * via a referral link for 40% OFF (up to ₹100) on first order.
 *
 * Endpoints:
 *   GET  /api/health       — Health check
 *   POST /api/track-click  — Track referral link clicks
 *   GET  /api/stats        — View click stats (admin)
 *   POST /api/telegram-webhook — Telegram webhook
 */

require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const morgan   = require('morgan');
const path     = require('path');

const app = express();
const PORT          = process.env.PORT          || 3000;
const TG_BOT_TOKEN  = process.env.TG_BOT_TOKEN  || '';
const TG_WEBAPP_URL = process.env.TG_WEBAPP_URL  || '';
const ADMIN_TG      = process.env.ADMIN_TELEGRAM || 'tgekaiva';
const REFERRAL_URL  = process.env.REFERRAL_URL   ||
    'https://app.meesho.com/2yoV/r99th0qd?via=9xrkok&from=account_section';

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '../frontend')));

// ── Simple in-memory stats ────────────────────────────────────────────────────
const stats = {
    clicks: 0,
    botStarts: 0,
    firstSeen: new Date()
};

// ── Routes ────────────────────────────────────────────────────────────────────

/** Health check */
app.get('/api/health', (req, res) => {
    res.json({
        ok: true,
        status: 'healthy',
        timestamp: new Date(),
        uptime: process.uptime()
    });
});

/** Track a referral link click from the Mini App */
app.post('/api/track-click', (req, res) => {
    stats.clicks++;
    console.log(`📊 Referral clicks: ${stats.clicks}`);
    res.json({ ok: true, total_clicks: stats.clicks });
});

/** Admin stats — GET /api/stats */
app.get('/api/stats', (req, res) => {
    res.json({
        ok: true,
        referral_url: REFERRAL_URL,
        clicks: stats.clicks,
        bot_starts: stats.botStarts,
        running_since: stats.firstSeen,
        uptime_seconds: Math.floor(process.uptime())
    });
});

/** Serve frontend for all other routes */
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ── Telegram Bot ──────────────────────────────────────────────────────────────

/** Webhook endpoint (used in production instead of polling) */
app.post('/api/telegram-webhook', async (req, res) => {
    res.sendStatus(200);
    const update = req.body;
    if (update?.message) {
        await handleBotMessage(update.message);
    } else if (update?.callback_query) {
        await handleCallbackQuery(update.callback_query);
    }
});

/** Handle incoming bot messages */
async function handleBotMessage(msg) {
    if (!TG_BOT_TOKEN || !msg) return;

    const chatId     = msg.chat.id;
    const firstName  = msg.from?.first_name || 'Friend';
    const text       = msg.text || '';

    stats.botStarts++;

    const hasWebApp = !!TG_WEBAPP_URL;

    const welcomeText =
        `👋 *Hey ${firstName}! Welcome to Meesho Offer Bot!*\n\n` +
        `🛍️ Get *40% OFF* on your first Meesho order — save up to *₹100*!\n\n` +
        `✅ *What you get:*\n` +
        `• 40% OFF on first order (up to ₹100)\n` +
        `• 🏠 Free home delivery\n` +
        `• 💵 Cash on delivery available\n` +
        `• 🔄 Easy 7-day returns\n\n` +
        `👇 *Tap below to claim your discount!*`;

    const inlineKeyboard = [];

    if (hasWebApp) {
        inlineKeyboard.push([{
            text: '🎉 Claim 40% OFF Now',
            web_app: { url: TG_WEBAPP_URL }
        }]);
    }

    inlineKeyboard.push([{
        text: '🔗 Get Meesho Referral Link',
        callback_data: 'get_link'
    }]);

    inlineKeyboard.push([{
        text: `💬 Support — @${ADMIN_TG}`,
        url: `https://t.me/${ADMIN_TG}`
    }]);

    await tgApi('sendMessage', {
        chat_id: chatId,
        text: welcomeText,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: inlineKeyboard }
    });
}

/** Handle inline keyboard button presses */
async function handleCallbackQuery(query) {
    if (!TG_BOT_TOKEN) return;
    const chatId = query.message.chat.id;

    // Answer the callback so the loading spinner goes away
    await tgApi('answerCallbackQuery', { callback_query_id: query.id });

    if (query.data === 'get_link') {
        stats.clicks++;
        await tgApi('sendMessage', {
            chat_id: chatId,
            text:
                `🔗 *Your exclusive Meesho link:*\n\n` +
                `${REFERRAL_URL}\n\n` +
                `📲 *Steps to claim:*\n` +
                `1️⃣ Tap the link above to open Meesho\n` +
                `2️⃣ Sign up with your phone number\n` +
                `3️⃣ Place your first order\n` +
                `4️⃣ 40% OFF (up to ₹100) applied automatically! 🎉\n\n` +
                `⚡ New users only. Share this link with friends too!`,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[{
                    text: '🛍️ Open Meesho Now',
                    url: REFERRAL_URL
                }]]
            }
        });
    }
}

/** Telegram API helper */
async function tgApi(method, body) {
    if (!TG_BOT_TOKEN) return;
    try {
        const res = await fetch(
            `https://api.telegram.org/bot${TG_BOT_TOKEN}/${method}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            }
        );
        return res.json();
    } catch (e) {
        console.error(`tgApi ${method} error:`, e.message);
    }
}

/** Configure Telegram Menu Button automatically on startup */
async function setupBotMenuButton() {
    if (!TG_BOT_TOKEN || !TG_WEBAPP_URL) return;
    try {
        await tgApi('setChatMenuButton', {
            menu_button: {
                type: 'web_app',
                text: '🛍️ Get 40% OFF',
                web_app: { url: TG_WEBAPP_URL }
            }
        });
        console.log(`✅ Menu button set → ${TG_WEBAPP_URL}`);
    } catch (e) {
        console.error('Failed to set menu button:', e.message);
    }
}

/** Long-polling loop (used in development / free tier) */
async function startPolling() {
    if (!TG_BOT_TOKEN) {
        console.log('⚠️  No TG_BOT_TOKEN — bot polling disabled');
        return;
    }
    console.log('🤖 Telegram bot polling started...');
    let offset = 0;

    while (true) {
        try {
            const controller  = new AbortController();
            const timeout     = setTimeout(() => controller.abort(), 35_000);
            const res = await fetch(
                `https://api.telegram.org/bot${TG_BOT_TOKEN}/getUpdates?offset=${offset}&timeout=25`,
                { signal: controller.signal }
            );
            clearTimeout(timeout);
            const data = await res.json();
            if (data.ok && Array.isArray(data.result)) {
                for (const update of data.result) {
                    offset = update.update_id + 1;
                    if (update.message)        await handleBotMessage(update.message);
                    if (update.callback_query) await handleCallbackQuery(update.callback_query);
                }
            }
        } catch {
            await new Promise(r => setTimeout(r, 3000));
        }
    }
}

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
    console.log(`
╔═══════════════════════════════════════════════════════╗
║   🛍️  MEESHO OFFER BOT — ONLINE                       ║
║   Developer : @${ADMIN_TG.padEnd(38)}║
║   Port      : ${String(PORT).padEnd(39)}║
║   Env       : ${String(process.env.NODE_ENV || 'development').padEnd(39)}║
╚═══════════════════════════════════════════════════════╝
    `);

    await setupBotMenuButton();
    startPolling();
});

module.exports = app;
