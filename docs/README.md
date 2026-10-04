# 🛒 Meesho Loot - Rebuilt

> **Telegram Mini App for Meesho Account Management & Shopping**

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18.0-green)
![License](https://img.shields.io/badge/license-MIT-yellow)

## 📋 Overview

Meesho Offer Bot is a **Telegram Mini App** for browsing top deals, managing Meesho accounts, shopping, claiming wallet bonuses, and tracking orders. Built and maintained by **@tgekaiva**.

## ✨ Features

- 🔐 **Account Import** - Login via cookies or sign up with phone
- 🛍️ **Product Browsing** - Shop from product catalog
- 🛒 **Cart Management** - Add/remove items, view totals
- 📦 **Order Tracking** - Place and track orders
- 📍 **Address Management** - Save multiple addresses
- 💰 **Wallet System** - Signup bonuses and balance tracking
- 📱 **Telegram Integration** - Native Telegram Web App experience

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn
- PostgreSQL 15+ (or use Docker)

### Installation

```bash
# Clone or download the project
cd meesho-rebuild

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your configuration

# Run database migrations (if using PostgreSQL)
psql -f database/schema.sql

# Start server
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Docker (Recommended)

```bash
# Build and run all services
docker-compose up -d --build

# App will be available at http://localhost:3000
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│              Frontend (SPA)                 │
│         HTML + CSS + Vanilla JS            │
│         Telegram WebApp SDK               │
└────────────────────┬──────────────────────┘
                     │ HTTP/REST API
┌────────────────────▼──────────────────────┐
│            Backend (Express)                │
│  ┌─────────┬──────────┬────────────────┐  │
│  │ Auth    │ Products │ Orders        │  │
│  │ Service │ Service  │ Service       │  │
│  └─────────┴──────────┴────────────────┘  │
└────────────────────┬──────────────────────┘
                     │
┌────────────────────▼──────────────────────┐
│           Database (PostgreSQL)            │
│  ┌──────────┬──────────┬──────────────┐   │
│  │ Accounts │ Products │ Orders      │   │
│  └──────────┴──────────┴──────────────┘   │
└──────────────────────────────────────────┘
```

## 📡 API Endpoints

See [MANIFEST.md](./MANIFEST.md) for complete API documentation.

## 🧪 Testing

```bash
# Run smoke tests
npm test
```

## 📁 Project Structure

See [MANIFEST.md](./MANIFEST.md) for detailed file structure.

## 🔒 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment | `development` |
| `PORT` | Server port | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | - |
| `JWT_SECRET` | JWT signing key | - |
| `TG_BOT_TOKEN` | Telegram bot token | - |

## 🤝 Contact & Developer

Developed and maintained by **[@tgekaiva](https://t.me/tgekaiva)**.
Telegram Bot: **[@meesho_offerbot](https://t.me/meesho_offerbot)**

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

**Developed by [@tgekaiva](https://t.me/tgekaiva)** ⚡
