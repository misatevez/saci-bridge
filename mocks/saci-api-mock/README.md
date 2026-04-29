# SaciERP Mock API (v0.1.0-mock)

Local development mock for the SaciERP API. Used for testing the saci-bridge integration without a live SaciERP instance.

## Quick Start

### Prerequisites

- Node.js 22+
- npm

### Installation

```bash
cd mocks/saci-api-mock
npm install
```

### Running the Mock

**Development mode (with auto-reload):**

```bash
npm run dev
```

**Production mode:**

```bash
npm run build
npm start
```

The mock will start on `http://localhost:9100` (or custom PORT via env).

## Endpoints

All endpoints except `/health` require an `Authorization: Bearer <token>` header.

### Health Check (No Auth)

```http
GET /health
```

**Response (200):**
```json
{
  "ok": true,
  "version": "0.1.0-mock",
  "ts": "2026-04-29T18:00:00.000Z"
}
```

### Create Pedido (Order)

```http
POST /pedidos
Authorization: Bearer <token>
Content-Type: application/json
```

**Request:**
```json
{
  "idDoc": "DOC-001",
  "emissionDate": "2026-04-29",
  "identificationType": "CPF",
  "identification": "12345678901",
  "socialReason": "ACME Corp",
  "address": "Rua Principal 123",
  "email": "contact@acme.com",
  "phone": "555-1234",
  "details": [
    {
      "sku": "pro001",
      "quantity": 5,
      "price": "100.00"
    }
  ]
}
```

Note: `details` can be either an **object** or an **array** — mock accepts both.

**Response (200):**
```json
{
  "ok": true,
  "idPedido": "a1b2c3d4-e5f6-7890-1234-567890abcdef",
  "received_at": "2026-04-29T18:00:00.000Z"
}
```

### Get Product by SKU

```http
GET /productos/pro001
Authorization: Bearer <token>
```

**Available demo SKUs:** `pro001`, `23456`, `demo-1`

**Response (200):**
```json
{
  "sku": "pro001",
  "nombre": "Produto demo",
  "precio": "100.00",
  "cantidad": "10",
  "categoria": "001",
  "estado": true
}
```

**Response (404) if SKU not found:**
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "SKU no encontrado"
  }
}
```

### List Products (Paginated)

```http
GET /productos?limit=10&offset=0
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "items": [
    {
      "sku": "pro001",
      "nombre": "Produto demo",
      "precio": "100.00",
      "cantidad": "10",
      "categoria": "001",
      "estado": true
    },
    ...
  ],
  "limit": 10,
  "offset": 0,
  "total": 3
}
```

### Create Cliente (Customer)

```http
POST /clientes
Authorization: Bearer <token>
Content-Type: application/json
```

**Request:**
```json
{
  "identificationType": "CPF",
  "identification": "12345678901",
  "socialReason": "ACME Corp",
  "email": "contact@acme.com",
  "phone": "555-1234",
  "address": "Rua Principal 123"
}
```

**Response (200):**
```json
{
  "ok": true,
  "idCliente": "c1a2b3d4-e5f6-7890-1234-567890abcdef"
}
```

## Configuration

Create a `.env` file in the mock directory:

```bash
cp .env.example .env
```

**Variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `9100` | HTTP server port |
| `LOG_LEVEL` | `info` | Pino log level: debug, info, warn, error |

## Testing with curl

```bash
# Health check (no auth needed)
curl http://localhost:9100/health

# Get product (requires token)
curl -H "Authorization: Bearer test-token" \
  http://localhost:9100/productos/pro001

# Create pedido (requires token)
curl -X POST http://localhost:9100/pedidos \
  -H "Authorization: Bearer test-token" \
  -H "Content-Type: application/json" \
  -d '{
    "idDoc": "DOC-001",
    "emissionDate": "2026-04-29",
    "identificationType": "CPF",
    "identification": "12345678901",
    "socialReason": "Test",
    "address": "Rua 123",
    "email": "test@test.com",
    "phone": "5555555",
    "details": [{"sku": "pro001", "qty": 1}]
  }'
```

## Running in Background

### Windows (PowerShell)

```powershell
Start-Process -NoNewWindow -FilePath "npm" -ArgumentList "start" -WorkingDirectory "mocks/saci-api-mock"
```

Or use the provided script:

```cmd
mocks/saci-api-mock/start-mock.cmd
```

### Windows (with PM2)

```bash
npm install -g pm2
pm2 start "npm start" --name "saci-mock" --cwd mocks/saci-api-mock
pm2 logs saci-mock
```

### Linux/macOS

```bash
# Background with nohup
cd mocks/saci-api-mock && nohup npm start > saci-mock.log 2>&1 &

# Or with PM2
pm2 start "npm start" --name "saci-mock" --cwd mocks/saci-api-mock
```

## Stopping the Mock

**Windows (PowerShell):**
```powershell
Stop-Process -Name node -Force
```

**Linux/macOS:**
```bash
pkill -f "saci-api-mock"
# Or if using PM2:
pm2 stop saci-mock
```

## Logging

All requests are logged with:
- Timestamp
- HTTP method + path
- Authorization token (masked, first 20 chars)
- Request ID (x-request-id header)
- Response status

Logs go to stdout (colored in dev mode, plain JSON in production).

## Notes

- This is a **MOCK** for local development only.
- The real SaciERP API URL is configured via `SACI_API_URL` env in the bridge.
- The mock hardcodes 3 demo SKUs (`pro001`, `23456`, `demo-1`).
- All client-generated IDs are UUIDs.
- No persistence — all data is ephemeral.

## Related

- `docs/implementacion.md` — SaciERP API specification (v1.1)
- `src/` in saci-bridge — Main bridge code using this mock
- INF-1199 — Creation issue
