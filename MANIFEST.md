# MANIFEST.md - Meesho Loot Rebuild

## Project Information
- **Project Name**: Meesho Loot (Telegram Mini App)
- **Version**: 1.0.0 (Rebuilt)
- **Developer**: @tgekaiva
- **Telegram Bot**: [@meesho_offerbot](https://t.me/meesho_offerbot)
- **Support**: https://t.me/tgekaiva

## Stack
| Component | Technology |
|-----------|------------|
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| Backend | Node.js 18+, Express.js |
| Database | PostgreSQL 15 (or SQLite for dev) |
| Maps | Leaflet.js |
| Integration | Telegram Web App SDK |
| Containerization | Docker, Docker Compose |

## File Structure
```
meesho_rebuild/
├── frontend/
│   └── index.html          # Main SPA (inline CSS/JS)
├── backend/
│   └── server.js           # Express API server
├── database/
│   └── schema.sql          # Full DDL + seed data
├── assets/
│   ├── telegram-web-app.js # Telegram SDK
│   ├── leaflet.js         # Maps library
│   └── leaflet.css        # Maps styles
├── config/                 # Configuration templates
├── docs/                  # Documentation
├── tests/
│   └── smoke.test.js       # Smoke tests
├── docker-compose.yml      # Docker orchestration
├── Dockerfile             # Container build
├── package.json           # Node.js dependencies
├── .env.example           # Environment template
└── MANIFEST.md            # This file
```

## Endpoints

### Public (No Auth)
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/signup/config | Signup configuration |
| GET | /api/health | Health check |
| GET | / | Frontend SPA |

### Complete Active API Endpoints
| Category | Method | Path | Description |
|----------|--------|------|-------------|
| **Auth & Signup** | POST | /api/signup/send-otp | Send OTP (live Meesho SMS or instant Telegram/web) |
| | POST | /api/signup/verify | Verify OTP & activate account with ₹170 discount credit |
| | POST | /api/accounts/cookie-login | Direct Meesho cookie session login & parser |
| | GET | /api/bootstrap | Bootstrap session, active account, and wallet data |
| **Catalog & Feed** | GET | /api/meesho/for-you | Trending product catalog feed |
| | POST | /api/search | Real-time product search with keywords/categories |
| | GET | /api/meesho/suggest | Search auto-suggestions |
| | GET | /api/product | Get product by ID |
| | POST | /api/product/by_link | Product preview from Meesho link |
| | GET | /api/variation | Size variants for product |
| | GET | /api/meesho/reviews/:id | Customer reviews with ratings & images |
| | POST | /api/meesho/recommendations | Related product recommendations |
| | POST | /api/price/check | Multi-account discount price checker |
| **Cart & Saved** | GET | /api/cart | Get cart items, subtotal, and selected address |
| | POST | /api/cart/add | Add product to cart with size and quantity |
| | POST | /api/cart/update | Update quantity or remove from cart |
| | POST | /api/cart/remove | Remove specific cart item |
| | POST | /api/cart/location | Check destination pincode and delivery availability |
| | POST | /api/order/prices | Calculate order price with ₹170 discount deduction |
| | GET | /api/saved/list | Saved items / wishlist list |
| | POST | /api/saved/save | Save items to One-Click wishlist |
| | POST | /api/saved/remove | Remove item from saved wishlist |
| **Addresses** | GET | /api/addresses | List user shipping addresses |
| | POST | /api/addresses/create | Create new shipping address |
| | POST | /api/addresses/update | Update existing address |
| | POST | /api/addresses/set_default | Set default delivery address |
| | POST | /api/addresses/random_update | Randomize address for testing |
| | POST | /api/addresses/copy_to_active | Copy address to active account |
| | GET | /api/geocode | Reverse geocode pin for interactive Leaflet map |
| | GET | /api/master_address | Get master address templates |
| | POST | /api/master_address | Save master address |
| | POST | /api/master_address/random | Generate random master address |
| | POST | /api/master_address/delete | Delete master address |
| **Orders** | POST | /api/order/place_cod | Place Cash on Delivery order with ₹170 discount |
| | POST | /api/order/pay_online | Initiate online UPI payment (Juspay intent) |
| | POST | /api/order/payment_status | Check online payment status |
| | POST | /api/order/confirm | Confirm online prepaid order |
| | GET | /api/orders | List all placed orders |
| | GET | /api/orders/detail | Detailed tracking & timeline for an order |
| | GET | /api/orders/cancel_reasons | List of valid cancellation reasons |
| | POST | /api/orders/cancel | Cancel placed order |
| **Accounts & Wallet** | GET | /api/accounts/list | List imported & created accounts |
| | POST | /api/accounts/select | Switch active shopping account |
| | POST | /api/accounts/import | Bulk or single account session import |
| | POST | /api/accounts/refresh | Verify / refresh session token |
| | POST | /api/accounts/delete | Remove account from pool |
| | GET | /api/wallet/history | View ₹170 discount credit & transaction history |
| | GET | /api/account/fod | First Order Discount status & details |


### Reverse-Engineered Meesho Live Endpoints
| Action | Method | Real Meesho URL | Payload / Notes |
|--------|--------|-----------------|-----------------|
| **Send OTP** | POST | `https://www.meesho.com/api/v1/user/login/request-otp` | `{"phone_number": "XXXXXXXXXX"}` -> returns `request_id` |
| **Verify OTP & Login** | POST | `https://www.meesho.com/api/v1/user/login` | `{"phone_number": "...", "otp": "...", "request_id": "...", "instance_id": "<uuid>", "login_type": "meesho_sms_auth"}` -> Sets `__logged_in_user_id__`, `_is_logged_in_`, `__connect.sid__` |


## Database Tables
1. **accounts** - User accounts (mobile, cookies, wallet)
2. **sessions** - Auth sessions with tokens
3. **products** - Product catalog
4. **cart_items** - Shopping cart items
5. **orders** - Order headers
6. **order_items** - Order line items
7. **addresses** - Shipping addresses
8. **signup_config** - App configuration

## Third-Party Services
- **Google Fonts**: Plus Jakarta Sans, Sora
- **Telegram**: Web App SDK for Mini App integration
- **Leaflet/OpenStreetMap**: For address maps
- **Meesho API**: Proxied product data (simulated in rebuild)

## Known Gaps & Assumptions
1. **Authentication**: Original uses Telegram initData; rebuild simulates this
2. **Product Data**: Original fetches from Meesho API; rebuild uses seeded data
3. **Payment Gateway**: Not implemented (original likely has integration)
4. **Real Cookie Login**: Simplified for demo purposes
5. **Bulk Import**: UI present but simplified logic
6. **WebSocket/SSE**: Not observed but may exist for real-time updates

## How to Run

### Quick Start (Development)
```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Run server
npm start

# Open http://localhost:3000
```

### Docker (Production)
```bash
# Build and run with docker-compose
docker-compose up -d --build

# View logs
docker-compose logs -f app
```

### Run Tests
```bash
# Smoke tests
npm test
```

## Notes
- Meesho Offer Telegram Mini App and Bot
- Developed by @tgekaiva
- All secrets are via environment variables (never hardcoded)
- Database is seeded with sample data for immediate use
- Designed to be production-ready with proper error handling
