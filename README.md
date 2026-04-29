# saci-bridge

Bridge **SuiteCRM `firmas`** ↔ **SaciERP**.

Servicio Node 22 + Express + TypeScript. Aísla la integración firmas ↔ SaciERP
fuera del CRM: encola pedidos vía `saci_outbox` en MariaDB, traduce payloads al
contrato JSON de SaciERP y reintenta cuando uno de los lados está caído. Las
credenciales del API SaciERP nunca tocan el código de SuiteCRM.

> Sprint 1 — Integración SaciERP. Este repo es el esqueleto del bridge. Las
> piezas reales (poller del outbox, transformers a JSON SaciERP, cliente OAuth2
> contra API V8 de firmas, schema DB) se irán poblando en issues siguientes.

## Stack

- Node 22
- Express 4
- TypeScript 5 (strict, `noUncheckedIndexedAccess`)
- pino + pino-http (logs estructurados)
- vitest + supertest (tests)
- tsx (dev runner)
- pm2 (proceso en server, en una issue posterior)

## Setup local

```bash
npm install
cp .env.example .env       # editar con creds reales
npm run typecheck          # 0 errores esperados
npm test                   # smoke test /health
npm run dev                # arranca en http://127.0.0.1:3100
curl http://127.0.0.1:3100/health
# → { "status": "ok", "uptime": <number> }
```

## Estructura

```
saci-bridge/
├── README.md
├── package.json        scripts: dev, build, start, test, typecheck
├── tsconfig.json       strict, ES2022, ESM
├── vitest.config.ts
├── .env.example        SACIERP_API_URL/TOKEN, SUITECRM_*, DB_*, PORT, LOG_LEVEL
├── .gitignore          node_modules, .env, dist, coverage
├── src/
│   ├── server.ts       bootstrap + SIGINT/SIGTERM handlers
│   ├── app.ts          factory Express + GET /health
│   ├── config.ts       carga dotenv, tipa todo
│   ├── logger.ts       pino instance
│   ├── routes/         (vacío — se popula en issues siguientes)
│   ├── services/       (vacío — cliente SaciERP, cliente SuiteCRM)
│   └── db/             (vacío — pool MariaDB + queries del outbox)
└── tests/
    ├── setup.ts        silencia logs en test
    └── smoke.test.ts   GET /health → 200, status="ok", uptime numérico
```

## Variables de entorno

Definidas en `.env.example`. **Nunca commitear `.env` real.**

| Var | Descripción |
|-----|-------------|
| `SACIERP_API_URL` | Base URL del API SaciERP. Placeholder hasta que el equipo SaciERP entregue la URL definitiva (ver `docs/implementacion.md`). |
| `SACIERP_API_TOKEN` | Token / API key de SaciERP. Pendiente de entrega. |
| `SUITECRM_BASE_URL` | URL del CRM firmas (`https://firmas.moacrm.com`). |
| `SUITECRM_OAUTH_CLIENT_ID/SECRET` | Cliente OAuth2 del API V8 de firmas, emitido para el bridge. |
| `DB_HOST/PORT/USER/PASS/NAME` | MariaDB OCI managed (database `saci_bridge`). |
| `HOST` | Por defecto `127.0.0.1` (loopback) en producción, detrás de Apache reverse proxy. |
| `PORT` | Por defecto `3100` (meta-bridge usa `3000`). |
| `LOG_LEVEL` | `info` por defecto, `silent` en tests. |
| `NODE_ENV` | `development` / `production` / `test`. |

## Próximos pasos (issues siguientes)

- INF-1192 — `firmas`: custom fields para sync (`external_id_c`, `sku_saci_c`).
- INF-1193 — `firmas`: tabla `saci_outbox` + logic hooks (sin envío todavía).
- INF-1194 — `saci-bridge`: poller `saci_outbox` → SaciERP API (transformers + retry).
- INF-1195 — SaciERP API smoke test + URL/creds request (BLOCKED hasta llegar).
- INF-1196 — Doc: contrato API SaciERP v2 (revisado vs `implementacion.md`).

## Referencias

- Matriz de decisión Sprint 1: `misatevez/suitecrm` → `docs/sprint1/saciERP-decision-matrix.md`
- Contrato API SaciERP (v1, placeholder): `misatevez/suitecrm` → `docs/implementacion.md`
- Research previo: `misatevez/suitecrm` → `docs/07-sacierp-research.md` (INF-952)
- Repo gemelo: [`meta-bridge`](https://github.com/misatevez/meta-bridge) — mismo stack y patrón de deploy.
