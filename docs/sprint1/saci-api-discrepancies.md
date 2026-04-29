# SaciERP API Discrepancies

Tracked divergences between client documentation and our implementation.

## #1 — Pedido `details` field: object vs array

| | Value |
|---|---|
| **Doc version** | v1.1 |
| **Field** | `POST /pedidos` → `details` |
| **Client doc** | Shows `details` as a JSON object (single item) |
| **Our impl** | Sends `details` as a JSON array |
| **Reason** | An array is the semantically correct type for a list of line items. A single-item object would break multi-line orders. |
| **Action** | Send as array. If SaciERP rejects with a validation error referencing `details`, escalate to Architect for negotiation with SaciERP team. |
| **Status** | Open — pending first real POST to prod |
