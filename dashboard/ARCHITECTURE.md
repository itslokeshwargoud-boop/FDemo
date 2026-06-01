# REPSCAN Dashboard — Architecture & Documentation

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (React SPA)                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │ Dashboard │  │  Alerts  │  │ Keywords │  │  Auth (Login/    │ │
│  │  Feature  │  │  Feature │  │  Feature │  │   Register)      │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘ │
│       │              │              │                 │           │
│  ┌────┴──────────────┴──────────────┴─────────────────┴────────┐ │
│  │               API Client (fetch wrapper)                     │ │
│  │          + React Query (caching, refetching)                  │ │
│  └──────────────────────────┬──────────────────────────────────┘ │
└─────────────────────────────┼───────────────────────────────────┘
                              │ HTTP (JSON) + HttpOnly Cookie
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      EXPRESS SERVER (Node.js)                    │
│                                                                  │
│  Request → [Helmet] → [CORS] → [Rate Limit] → [Cookie Parser]   │
│         → [JSON Parser] → [Compression] → [Request Logger]      │
│         → [Router /api/v1/...]                                   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │ Route Handler Pipeline:                                      ││
│  │  [Input Validation (Zod)] → [JWT Auth (requireAuth)]         ││
│  │  → Controller (thin) → Service (business logic)              ││
│  │  → Repository (data access) → Prisma ORM → PostgreSQL       ││
│  └──────────────────────────────────────────────────────────────┘│
│                                                                  │
│  [Centralized Error Handler] catches all errors                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     PostgreSQL Database                          │
│  Tables: users, refresh_tokens, metric_snapshots, alerts         │
└─────────────────────────────────────────────────────────────────┘
```

**Layers:**
- **Controller** — Thin; parses request, calls service, sends response
- **Service** — Business logic, orchestration, validation rules
- **Repository** — Data access via Prisma ORM (single responsibility)
- **Middleware** — Cross-cutting concerns (auth, logging, validation, rate-limiting)

---

## 2. Folder Structure

```
dashboard/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          # Database schema
│   │   └── seed.ts                # Seed script
│   ├── src/
│   │   ├── config/
│   │   │   ├── index.ts           # Environment config
│   │   │   ├── logger.ts          # Pino structured logger
│   │   │   └── database.ts        # Prisma client instance
│   │   ├── middleware/
│   │   │   ├── index.ts           # Barrel export
│   │   │   ├── auth.ts            # JWT requireAuth middleware
│   │   │   ├── errorHandler.ts    # Centralized error handler
│   │   │   ├── requestLogger.ts   # Structured request logging
│   │   │   └── validate.ts        # Zod schema validation
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   │   ├── controller/auth.controller.ts
│   │   │   │   ├── service/auth.service.ts
│   │   │   │   ├── repository/auth.repository.ts
│   │   │   │   └── validation/auth.validation.ts
│   │   │   ├── metrics/
│   │   │   │   ├── controller/metrics.controller.ts
│   │   │   │   ├── service/metrics.service.ts
│   │   │   │   ├── repository/metrics.repository.ts
│   │   │   │   └── validation/metrics.validation.ts
│   │   │   └── alerts/
│   │   │       ├── controller/alerts.controller.ts
│   │   │       ├── service/alerts.service.ts
│   │   │       ├── repository/alerts.repository.ts
│   │   │       └── validation/alerts.validation.ts
│   │   ├── routes/
│   │   │   └── v1.ts              # /api/v1 route definitions
│   │   ├── shared/
│   │   │   ├── errors/            # AppError hierarchy
│   │   │   ├── types/             # Shared TypeScript types
│   │   │   └── utils/             # asyncHandler, response helpers
│   │   ├── app.ts                 # Express app setup
│   │   └── server.ts              # Server entry + graceful shutdown
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
│
└── frontend/
    ├── src/
    │   ├── api/
    │   │   ├── client.ts          # Fetch wrapper with auto-refresh
    │   │   ├── endpoints.ts       # Typed API endpoint functions
    │   │   └── index.ts
    │   ├── features/
    │   │   ├── auth/
    │   │   │   ├── AuthContext.tsx # Auth state management
    │   │   │   └── LoginPage.tsx   # Login/Register UI
    │   │   ├── dashboard/
    │   │   │   ├── DashboardPage.tsx
    │   │   │   ├── KpiCard.tsx
    │   │   │   ├── TrendChart.tsx
    │   │   │   ├── RecentAlerts.tsx
    │   │   │   └── useDashboardMetrics.ts
    │   │   ├── alerts/
    │   │   │   ├── AlertsPage.tsx
    │   │   │   └── useAlerts.ts
    │   │   └── keywords/
    │   │       └── KeywordsPage.tsx
    │   ├── shared/
    │   │   └── types/index.ts     # Shared TypeScript interfaces
    │   ├── App.tsx                # Router + providers
    │   ├── main.tsx               # Entry point
    │   └── index.css              # Global styles
    ├── .env.example
    ├── package.json
    ├── vite.config.ts
    └── tsconfig.json
```

---

## 3. API Request Lifecycle

Step-by-step flow for `GET /api/v1/metrics/dashboard?range=7d`:

1. **Client** — React component calls `useDashboardMetrics('7d')` hook
2. **React Query** — Checks cache. If stale (>60s), makes fetch via `apiFetch()`
3. **API Client** — Sends `GET` with `Authorization: Bearer <accessToken>` header + HttpOnly cookie
4. **Express receives request** and runs middleware stack:
   - **Helmet** — Sets security headers (X-Frame-Options, CSP, etc.)
   - **CORS** — Validates origin matches `CORS_ORIGIN` env var
   - **Rate Limiter** — Checks IP hasn't exceeded 100 req/15min
   - **Body Parser** — Parses JSON body (if any)
   - **Cookie Parser** — Parses cookies (for refresh token)
   - **Compression** — Compresses response with gzip
   - **Request Logger** — Logs method, URL, status, duration (Pino)
5. **Router** matches `/api/v1/metrics/dashboard`
6. **Validation Middleware** — Zod validates `req.query` against `dashboardQuerySchema` (validates `range` is one of: 1d, 7d, 14d, 30d, 90d)
7. **Auth Middleware (`requireAuth`)** — Extracts JWT from `Authorization` header, verifies signature + expiry, attaches `req.user`
8. **Controller** (`MetricsController.getDashboard`) — Extracts `range` from `req.query`, calls service
9. **Service** (`MetricsService.getDashboardMetrics`) — Calculates date range, runs parallel queries, computes KPI changes + trends
10. **Repository** (`MetricsRepository.getSnapshotsInRange`) — Executes Prisma query against `metric_snapshots` table
11. **Database** — PostgreSQL returns rows within date range (uses index on `date`)
12. **Service** — Aggregates results, calculates percentage changes, formats response
13. **Controller** — Calls `sendSuccess(res, data)` which wraps in `{ success: true, data: ... }`
14. **Response** — JSON sent back through compression middleware
15. **React Query** — Caches response, updates component via re-render

**Error path:** If any step throws, `asyncHandler` catches the error and forwards to the centralized `errorHandler` middleware, which returns `{ success: false, error: { message, code } }` with appropriate HTTP status.

---

## 4. Frontend Caching Strategy (React Query)

### Configuration
```typescript
// Global defaults
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,        // Data considered fresh for 1 minute
      retry: 2,                     // Retry failed requests twice
      refetchOnWindowFocus: true,   // Refetch when user returns to tab
    },
  },
});

// Dashboard-specific
useQuery({
  queryKey: ['dashboard', range],   // Cache key includes range parameter
  staleTime: 60 * 1000,            // Fresh for 1 minute
  refetchInterval: 5 * 60 * 1000,  // Auto-refetch every 5 minutes
});

// Alerts-specific
useQuery({
  queryKey: ['alerts', params],     // Cache key includes all filter params
  staleTime: 30 * 1000,            // Fresh for 30 seconds (more volatile)
});
```

### How it works
1. **First load:** Query fires immediately, shows loading state
2. **Cache hit (fresh):** Returns cached data instantly, no network request
3. **Cache hit (stale):** Returns cached data instantly, fires background refetch
4. **Window focus:** If data is stale, refetches when user tabs back
5. **Interval refetch:** Dashboard auto-refreshes every 5 minutes
6. **Query key changes:** When user changes range (7d → 30d), new query fires
7. **Error handling:** Failed queries retry twice, then show error state

---

## 5. Scaling Strategy

### Pre-Aggregation
- `metric_snapshots` table stores **pre-aggregated daily snapshots** rather than raw events
- A background job (cron or worker) should aggregate raw data into this table daily
- Dashboard queries read from this small, indexed table instead of scanning raw data

### Database Indexing
```sql
-- Automatically created by Prisma schema:
CREATE INDEX idx_metric_snapshots_date ON metric_snapshots(date);
CREATE UNIQUE INDEX idx_metric_snapshots_date_unique ON metric_snapshots(date);
CREATE INDEX idx_alerts_status ON alerts(status);
CREATE INDEX idx_alerts_severity ON alerts(severity);
CREATE INDEX idx_alerts_created_at ON alerts(created_at);
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token);
```

### Pagination
- Alerts endpoint uses **offset-based pagination**: `GET /api/v1/alerts?page=1&pageSize=20`
- Response includes `meta: { page, pageSize, total, totalPages }`
- Prevents loading unbounded datasets

### Connection Pooling
- Prisma handles connection pooling automatically
- For high traffic, configure `connection_limit` in DATABASE_URL

### Horizontal Scaling
- Backend is stateless (JWT + cookies) — can run multiple instances behind a load balancer
- Refresh tokens stored in DB, so any instance can validate them
- Add Redis for rate limiting in multi-instance deployments

### Background Workers (Optional)
- Use a job queue (Bull/BullMQ with Redis) for:
  - Metric aggregation (daily cron)
  - Alert notification delivery
  - Expired refresh token cleanup

---

## 6. Common Mistakes Avoided

| Mistake | How This System Avoids It |
|---------|--------------------------|
| **Fat controllers** | Controllers are thin — only parse request and call service |
| **Scattered error handling** | `asyncHandler` + centralized `errorHandler` — no try/catch in controllers |
| **Hardcoded secrets** | All config via environment variables + dotenv |
| **JWT in localStorage** | Refresh token in HttpOnly cookie; access token short-lived (15m) |
| **No input validation** | Zod schemas validate all inputs before reaching controller |
| **Crashing on errors** | Centralized handler catches all errors + `unhandledRejection` handler |
| **No rate limiting** | `express-rate-limit` on all API routes + stricter limit on auth |
| **Missing CORS** | Explicit CORS config with credentials support |
| **No security headers** | Helmet middleware adds all standard security headers |
| **Spaghetti code** | Strict MVC + service + repository layers with dependency injection |
| **No caching** | React Query with staleTime, refetchInterval, and query key invalidation |
| **Slow metrics queries** | Pre-aggregated snapshots table with date index |
| **No pagination** | All list endpoints paginated with standardized meta |
| **No logging** | Structured logging with Pino (JSON in production, pretty in dev) |
| **Secrets in frontend** | Only `VITE_API_URL` exposed; all secrets backend-only |
| **No graceful shutdown** | SIGTERM/SIGINT handlers close server + DB connections |

---

## 7. Run Instructions

### Prerequisites
- Node.js ≥ 18
- PostgreSQL running locally (or a remote instance)

### Backend Setup

```bash
cd dashboard/backend

# Install dependencies
npm install

# Copy and configure environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL and secrets

# Run database migrations
npx prisma migrate dev --name init

# Seed the database
npx prisma db seed

# Start development server
npm run dev
```

### Frontend Setup

```bash
cd dashboard/frontend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Start development server (runs on port 3000)
npm run dev
```

### Production Build

```bash
# Backend
cd dashboard/backend
npm run build
NODE_ENV=production node dist/server.js

# Frontend
cd dashboard/frontend
npm run build
# Serve the dist/ folder with any static file server (nginx, etc.)
```

---

## 8. Verification (curl commands)

### Health Check
```bash
curl http://localhost:4000/health
# Expected: {"success":true,"data":{"status":"ok","timestamp":"...","uptime":...,"environment":"development"}}
```

### Register
```bash
curl -X POST http://localhost:4000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","name":"Test User","password":"password123"}' \
  -c cookies.txt
# Expected: {"success":true,"data":{"user":{"id":"...","email":"test@example.com","name":"Test User"},"accessToken":"eyJ..."}}
```

### Login
```bash
curl -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@repscan.io","password":"password123"}' \
  -c cookies.txt
# Expected: {"success":true,"data":{"user":{...},"accessToken":"eyJ..."}}
# Save the accessToken value for subsequent requests
```

### Get Dashboard Metrics
```bash
curl http://localhost:4000/api/v1/metrics/dashboard?range=7d \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
# Expected: {"success":true,"data":{"kpis":{...},"trends":[...],"recentAlerts":[...],"range":"7d",...}}
```

### Get Alerts (paginated)
```bash
curl "http://localhost:4000/api/v1/alerts?page=1&pageSize=5" \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
# Expected: {"success":true,"data":[...],"meta":{"page":1,"pageSize":5,"total":8,"totalPages":2}}
```

### Refresh Token
```bash
curl -X POST http://localhost:4000/api/v1/auth/refresh \
  -b cookies.txt -c cookies.txt
# Expected: {"success":true,"data":{"accessToken":"eyJ..."}}
```

### Logout
```bash
curl -X POST http://localhost:4000/api/v1/auth/logout \
  -b cookies.txt
# Expected: {"success":true,"data":{"message":"Logged out successfully"}}
```

### Get Profile
```bash
curl http://localhost:4000/api/v1/auth/me \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
# Expected: {"success":true,"data":{"user":{"id":"...","email":"...","name":"...","createdAt":"..."}}}
```

---

## 9. Environment Variables

### Backend `.env`
| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `4000` |
| `NODE_ENV` | Environment | `development` |
| `DATABASE_URL` | PostgreSQL connection string | — |
| `JWT_ACCESS_SECRET` | Secret for signing access tokens | — |
| `JWT_REFRESH_SECRET` | Secret for signing refresh tokens | — |
| `CORS_ORIGIN` | Allowed frontend origin | `http://localhost:3000` |
| `LOG_LEVEL` | Pino log level | `info` |

### Frontend `.env`
| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API base URL | `http://localhost:4000` |

> ⚠️ No secrets are exposed in frontend environment variables. Only `VITE_`-prefixed vars are bundled by Vite.
