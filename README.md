# 🏘 SocietyPro — Backend API

A complete, production-ready REST API for managing residential societies.  
Built with **Node.js + Express + PostgreSQL**.

---

## 🚀 Quick Start

### 1. Prerequisites
- Node.js ≥ 18
- PostgreSQL ≥ 14
- npm

### 2. Clone & Install
```bash
git clone <repo>
cd society-api
npm install
```

### 3. Configure Environment
```bash
cp .env.example .env
# Edit .env with your database credentials, SMTP, and Razorpay keys
```

### 4. Create Database & Run Schema
```bash
createdb society_db   # (or use pgAdmin)
npm run db:init:local
```

### 5. Start Server
```bash
npm run dev     # development (with nodemon)
npm start       # production
```

Server runs at: `http://localhost:3000`

---

## 📋 API Reference

### Base URL
```
http://localhost:3000/api
```

### Authentication
All endpoints (except `/auth/login`) require:
```
Authorization: Bearer <JWT_TOKEN>
```

---

## 🔐 Auth Routes `/api/auth`

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/login` | Login, returns JWT | No |
| POST | `/register` | Create admin user | Secretary |
| POST | `/refresh` | Refresh access token | No |
| POST | `/logout` | Invalidate token | Yes |
| GET  | `/me` | Get current user profile | Yes |
| PUT  | `/change-password` | Change password | Yes |

**Login Example:**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@societypro.in","password":"Admin@123"}'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": { "id": "uuid", "name": "Rajesh Kumar", "role": "secretary" }
  }
}
```

---

## 🏠 Units & Residents `/api/units`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | `/` | List all units (filter: status, wing, search) |
| POST   | `/` | Create unit |
| GET    | `/:id` | Unit detail with members & vehicles |
| PUT    | `/:id` | Update unit |
| GET    | `/stats/summary` | Occupancy stats |
| GET    | `/:unitId/members` | List unit members |
| POST   | `/:unitId/members` | Add member |
| PUT    | `/:unitId/members/:id` | Update member |
| GET    | `/vehicles/all` | All registered vehicles |
| POST   | `/:unitId/vehicles` | Register vehicle |
| DELETE | `/:unitId/vehicles/:id` | Remove vehicle |

**Create Unit:**
```bash
curl -X POST http://localhost:3000/api/units \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "unit_number": "201-B",
    "wing": "B",
    "floor": "2nd",
    "area_sqft": 1200,
    "status": "Occupied"
  }'
```

---

## 💰 Billing & Finance `/api/billing`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | `/invoices` | List invoices (filter: status, unit, month) |
| POST   | `/invoices` | Create single invoice |
| POST   | `/invoices/bulk-generate` | Bulk monthly invoices for all units |
| GET    | `/invoices/:id` | Invoice detail |
| PUT    | `/invoices/:id/cancel` | Cancel invoice |
| POST   | `/payments/create-order` | Initiate Razorpay order |
| POST   | `/payments/verify` | Verify & record payment |
| POST   | `/payments/manual` | Record cash/offline payment |
| GET    | `/payments` | Payment ledger |
| GET    | `/expenses` | List expenses |
| POST   | `/expenses` | Add expense (with voucher upload) |
| PUT    | `/expenses/:id/approve` | Approve expense |
| GET    | `/reports/summary` | P&L summary |
| GET    | `/reports/defaulters` | Defaulter list |
| GET    | `/reports/collection-trend` | Monthly collection chart |

**Bulk Invoice Generation:**
```bash
curl -X POST http://localhost:3000/api/billing/invoices/bulk-generate \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "billing_month": "2025-05-01",
    "due_date": "2025-05-10",
    "rate_per_sqft": 3.50
  }'
```

**Record Manual Payment:**
```bash
curl -X POST http://localhost:3000/api/billing/payments/manual \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "invoice_id": "uuid-here",
    "amount": 4200,
    "payment_mode": "Cash",
    "transaction_id": "CASH-20250525"
  }'
```

---

## 🔧 Helpdesk `/api/helpdesk`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | `/` | List tickets (filter: status, category, priority) |
| GET    | `/stats` | Ticket stats & SLA status |
| POST   | `/` | Raise ticket (with file attachments) |
| GET    | `/:id` | Ticket detail with timeline |
| PUT    | `/:id` | Update status / assign |
| DELETE | `/:id` | Close ticket |

---

## 📋 Communication `/api/communication`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | `/notices` | List notices |
| POST   | `/notices` | Post notice (with email broadcast) |
| PUT    | `/notices/:id` | Edit notice |
| POST   | `/notices/:id/read` | Mark as read |
| DELETE | `/notices/:id` | Unpublish |
| GET    | `/polls` | List polls with vote counts |
| POST   | `/polls` | Create poll |
| POST   | `/polls/:id/vote` | Cast vote |
| DELETE | `/polls/:id` | Close poll |
| GET    | `/meetings` | List meetings |
| POST   | `/meetings` | Schedule meeting |
| PUT    | `/meetings/:id/mom` | Upload Minutes of Meeting |
| GET    | `/emergency` | Emergency directory |

---

## 🏊 Facilities `/api/facilities`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | `/amenities` | List amenities |
| POST   | `/amenities` | Add amenity |
| GET    | `/bookings` | List bookings |
| GET    | `/bookings/availability` | Check slot availability |
| POST   | `/bookings` | Create booking |
| PUT    | `/bookings/:id/cancel` | Cancel booking |
| GET    | `/assets` | List assets (auto-updates expiry status) |
| GET    | `/assets/alerts` | Assets expiring in 60 days |
| POST   | `/assets` | Add asset |
| PUT    | `/assets/:id` | Update asset |
| GET    | `/vendors` | Vendor list |
| POST   | `/vendors` | Add vendor |
| PUT    | `/vendors/:id` | Update vendor |

---

## 🛡 Security `/api/security`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | `/visitors` | Visitor log (default: today) |
| POST   | `/visitors` | Log visitor check-in |
| PUT    | `/visitors/:id/checkout` | Check-out visitor |
| POST   | `/visitors/pre-approve` | Generate QR pre-approval |
| GET    | `/visitors/summary` | Today's visitor summary |
| GET    | `/staff-attendance` | Staff attendance log |
| POST   | `/staff-attendance` | Record attendance |
| GET    | `/sos` | SOS alert history |
| POST   | `/sos` | Trigger panic alert |
| PUT    | `/sos/:id/resolve` | Resolve SOS |

---

## ⚙ Admin `/api/admin`

| Method | Endpoint | Description | Role |
|--------|----------|-------------|------|
| GET    | `/dashboard` | All KPIs in one call | All |
| GET    | `/documents` | Document vault | All |
| POST   | `/documents` | Upload document | All |
| DELETE | `/documents/:id` | Delete document | Secretary |
| GET    | `/audit-logs` | Full audit trail | Secretary |
| GET    | `/users` | All users | Secretary |
| PUT    | `/users/:id` | Update user role | Secretary |
| GET    | `/settings` | Society settings | Secretary |
| PUT    | `/settings` | Update settings | Secretary |

---

## 📐 Response Format

All responses follow this structure:
```json
{
  "success": true,
  "message": "Success",
  "data": { ... }
}
```

Paginated responses include:
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "total": 124,
    "page": 1,
    "limit": 30,
    "totalPages": 5,
    "hasNext": true,
    "hasPrev": false
  }
}
```

---

## 🔑 Role Permissions (RBAC)

| Role | Permissions |
|------|-------------|
| `secretary` | Full access — all endpoints |
| `treasurer` | Billing, payments, expenses, reports |
| `manager` | Units, helpdesk, facilities, vendors |
| `security` | Visitor log, staff attendance, SOS |
| `technician` | Helpdesk updates only |
| `resident` | Read notices, polls, own invoices |

---

## 💳 Razorpay Payment Flow

```
1. POST /api/billing/payments/create-order  →  { order_id, amount }
2. Frontend: Razorpay checkout popup
3. POST /api/billing/payments/verify        →  { payment confirmed }
4. Invoice marked Paid, receipt emailed
```

---

## 🔄 Cron Jobs

| Job | Schedule | Action |
|-----|----------|--------|
| Penalty Calculator | Daily midnight | Apply 1.5%/month on overdue invoices |
| Overdue Reminders | Daily 9 AM | Email all defaulters |
| AMC Alerts | Every Monday | Alert secretary of expiring contracts |

Install `node-cron` and uncomment lines in `src/jobs/scheduler.js` to activate.

---

## 📁 Project Structure

```
society-api/
├── src/
│   ├── app.js                  # Express app + startup
│   ├── config/
│   │   ├── db.js               # PostgreSQL pool
│   │   └── schema.sql          # All 18 tables + indexes + seed
│   ├── middleware/
│   │   ├── auth.js             # JWT verify + RBAC + audit logger
│   │   ├── errorHandler.js     # Centralized errors + response helpers
│   │   └── upload.js           # Multer file upload
│   ├── services/
│   │   ├── emailService.js     # Nodemailer + HTML templates
│   │   └── paymentService.js   # Razorpay integration
│   ├── routes/
│   │   ├── auth.js             # Login, register, tokens
│   │   ├── units.js            # Units, members, vehicles
│   │   ├── billing.js          # Invoices, payments, expenses, reports
│   │   ├── helpdesk.js         # Tickets, timeline, SLA
│   │   ├── communication.js    # Notices, polls, meetings
│   │   ├── facilities.js       # Amenities, assets, vendors
│   │   ├── security.js         # Visitors, attendance, SOS
│   │   └── admin.js            # Dashboard, documents, audit, settings
│   └── jobs/
│       └── scheduler.js        # Cron job definitions
├── uploads/                    # File storage
├── .env.example
├── package.json
└── README.md
```

---

## 🌐 Deployment

### Docker
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
EXPOSE 3000
CMD ["node", "src/app.js"]
```

### PM2 (production)
```bash
npm install -g pm2
pm2 start src/app.js --name society-api --instances 2
pm2 save && pm2 startup
```

### Environment Variables (production)
```env
NODE_ENV=production
PORT=3000
DB_HOST=your-rds-host
JWT_SECRET=<64-char-random-string>
RAZORPAY_KEY_ID=rzp_live_xxxxx
RAZORPAY_KEY_SECRET=xxxxx
SMTP_HOST=smtp.sendgrid.net
```
