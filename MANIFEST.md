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

### Authentication Required
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/bootstrap | User session data |
| GET | /api/meesho/for-you | Product feed |
| GET | /api/account/pool_status | Account pool status |
| GET | /api/master_address | Addresses |
| POST | /api/auth/cookie-login | Login with cookies |
| POST | /api/auth/signup | Sign up with phone |
| GET | /api/cart | Get cart |
| POST | /api/cart/add | Add to cart |
| POST | /api/cart/remove | Remove from cart |
| GET | /api/orders | Get orders |
| POST | /api/orders/create | Place order |
| GET | /api/addresses | Get addresses |
| POST | /api/addresses/add | Add address |

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
