# Sprint Deploy T5: E2E Smoke Test Plan

**Date:** 2026-05-05
**Purpose:** Verify SaciERP bridge end-to-end sync in production across all module types.

## Test Environment

- **Bridge:** https://meta-bridge.moacrm.com (should be saci-bridge when deployed)
- **Source (Firmas):** https://firmas.moacrm.com (SuiteCRM)
- **Target (SaciERP):** https://sacierp.moacrm.com (SuiteCRM instance)
- **Outbox DB:** firmascrm.saci_outbox (MariaDB @ 129.213.101.91:3306)

## Prerequisites

- SSH access to production server (ubuntu@132.145.128.135)
- MariaDB credentials for both databases
- OAuth2 client credentials for firmas API V8
- SaciERP bridge OAuth2 client credentials

## Test Cases

### T5.1: Accounts Outbound Sync

**Objective:** Verify account creation in firmas syncs to SaciERP

**Steps:**
1. Create test account record in saci_outbox:
   ```sql
   INSERT INTO saci_outbox (
     id, target_module, record_id, payload_json, status
   ) VALUES (
     UUID(), 'Accounts', UUID(),
     JSON_OBJECT(
       'id', UUID(),
       'name', 'TEST-E2E-ACCOUNT-001',
       'email1', 'test-account-001@moacrm.com',
       'phone_office', '+593999999001',
       'billing_address_street', 'Test Street 001',
       'billing_address_city', 'Quito',
       'billing_address_country', 'Ecuador',
       'account_type', 'Customer',
       'sic_code', '1234567890001'
     ),
     'pending'
   );
   ```

2. Wait 5 seconds for bridge to poll and process

3. Verify in firmas database:
   ```sql
   SELECT id, status, sent_at FROM saci_outbox 
   WHERE target_module = 'Accounts' AND status != 'pending'
   ORDER BY sent_at DESC LIMIT 1;
   ```
   ✅ Expected: status = 'sent', sent_at is recent

4. Verify in SaciERP API:
   ```bash
   curl -s https://sacierp.moacrm.com/legacy/Api/V8/Accounts?filter[0][name]=TEST-E2E-ACCOUNT-001 \
     -H "Authorization: Bearer <SACI_ACCESS_TOKEN>"
   ```
   ✅ Expected: Record exists with matching name

**Acceptance:** Account appears in SaciERP within 10 seconds of insertion

---

### T5.2: Contacts Outbound Sync

**Objective:** Verify contact creation in firmas syncs to SaciERP

**Steps:**
1. Create test contact record in saci_outbox:
   ```sql
   INSERT INTO saci_outbox (
     id, target_module, record_id, payload_json, status
   ) VALUES (
     UUID(), 'Contacts', UUID(),
     JSON_OBJECT(
       'id', UUID(),
       'first_name', 'Test',
       'last_name', 'E2E-Contact-001',
       'email1', 'test-contact-001@moacrm.com',
       'phone_mobile', '+593999999002',
       'account_id', '<linked-account-id>',
       'title', 'QA Engineer'
     ),
     'pending'
   );
   ```

2. Wait 5 seconds for bridge processing

3. Verify in firmas outbox:
   ```sql
   SELECT id, status, sent_at FROM saci_outbox 
   WHERE target_module = 'Contacts' AND status = 'sent'
   ORDER BY sent_at DESC LIMIT 1;
   ```
   ✅ Expected: status = 'sent'

4. Verify in SaciERP:
   ```bash
   curl -s "https://sacierp.moacrm.com/legacy/Api/V8/Contacts?filter[0][last_name]=E2E-Contact-001" \
     -H "Authorization: Bearer <SACI_ACCESS_TOKEN>"
   ```
   ✅ Expected: Contact exists

**Acceptance:** Contact appears in SaciERP within 10 seconds

---

### T5.3: Products Bidirectional Sync

**Objective:** Test product creation in firmas and stock update from SaciERP

**Step A: Firmas → SaciERP**
1. Insert test product in saci_outbox:
   ```sql
   INSERT INTO saci_outbox (
     id, target_module, record_id, payload_json, status
   ) VALUES (
     UUID(), 'AOS_Products', UUID(),
     JSON_OBJECT(
       'id', UUID(),
       'name', 'TEST-E2E-PRODUCT-001',
       'part_number', 'SKU-E2E-001',
       'description', 'Test product for E2E',
       'price', 99.99,
       'qty_in_stock', 50
     ),
     'pending'
   );
   ```

2. Wait 5 seconds, verify status = 'sent' in outbox

3. Verify in SaciERP API:
   ✅ Expected: Product exists with matching SKU

**Step B: SaciERP → Firmas (Stock Return Poller)**
1. Modify product stock in SaciERP API:
   ```bash
   curl -X PATCH https://sacierp.moacrm.com/legacy/Api/V8/AOS_Products/<product-id> \
     -H "Authorization: Bearer <SACI_ACCESS_TOKEN>" \
     -d '{"qty_in_stock": 35}'
   ```

2. Wait 30 seconds for bridge return-poller to detect and sync

3. Query firmas database for the product's stock_disponible_c field:
   ```sql
   SELECT stock_disponible_c FROM accounts 
   WHERE name = 'TEST-E2E-PRODUCT-001';
   ```
   ✅ Expected: stock_disponible_c = 35

**Acceptance:** 
- Product syncs firmas → SaciERP in <10s
- Stock update syncs SaciERP → firmas in <30s

---

### T5.4: Quotes Approved Filter

**Objective:** Verify only approved quotes sync; drafts are marked as skipped

**Step A: Create Quote (Draft)**
1. Insert draft quote in saci_outbox:
   ```sql
   INSERT INTO saci_outbox (
     id, target_module, record_id, payload_json, status
   ) VALUES (
     UUID(), 'AOS_Quotes', UUID(),
     JSON_OBJECT(
       'id', UUID(),
       'quote_num', 'QT-E2E-DRAFT-001',
       'status', 'Draft',
       'date_quote_expected_closed', '2026-06-01',
       'billing_account_name', 'Test Account',
       'line_items', JSON_ARRAY()
     ),
     'pending'
   );
   ```

2. Wait 5 seconds, check outbox:
   ✅ Expected: status = 'skipped' (not sent, because status != Approved)

**Step B: Create Quote (Approved)**
1. Insert approved quote in saci_outbox:
   ```sql
   INSERT INTO saci_outbox (
     id, target_module, record_id, payload_json, status
   ) VALUES (
     UUID(), 'AOS_Quotes', UUID(),
     JSON_OBJECT(
       'id', UUID(),
       'quote_num', 'QT-E2E-APPROVED-001',
       'status', 'Approved',
       'date_quote_expected_closed', '2026-06-01',
       'billing_account_name', 'Test Account',
       'billing_address_street', 'Test St',
       'billing_address_city', 'Quito',
       'line_items', JSON_ARRAY(
         JSON_OBJECT('sku', 'SKU-001', 'quantity', 5, 'unit_price', 50, 'total_amount', 250)
       )
     ),
     'pending'
   );
   ```

2. Wait 5 seconds, check outbox:
   ✅ Expected: status = 'sent'

3. Verify in SaciERP:
   ✅ Expected: Quote with number QT-E2E-APPROVED-001 exists

**Acceptance:** 
- Draft quotes → status = 'skipped'
- Approved quotes → status = 'sent' + appear in SaciERP

---

## Verification Checklist

- [ ] T5.1: Account TEST-E2E-ACCOUNT-001 exists in SaciERP
- [ ] T5.2: Contact Test E2E-Contact-001 exists in SaciERP
- [ ] T5.3a: Product SKU-E2E-001 exists in SaciERP with qty_in_stock = 50
- [ ] T5.3b: Product stock updated to 35 in firmas (stock_disponible_c field)
- [ ] T5.4a: Draft quote QT-E2E-DRAFT-001 has status = 'skipped' in outbox
- [ ] T5.4b: Approved quote QT-E2E-APPROVED-001 synced to SaciERP

## Failure Handling

If any test case fails:

1. **Check bridge logs:** SSH into server, check `/var/log/pm2/saci-bridge*.log` or run:
   ```bash
   pm2 logs saci-bridge
   ```

2. **Check outbox status:** Review failed/in_flight rows:
   ```sql
   SELECT id, target_module, status, retry_count, next_retry_at, error_message 
   FROM saci_outbox 
   WHERE status IN ('failed', 'in_flight');
   ```

3. **Create [BUG] issue** with:
   - Exact test step that failed
   - Error message from logs
   - Outbox row IDs and payloads
   - SQL queries run

## Expected Timeline

- Setup + insertions: ~2 minutes
- T5.1 + T5.2 verification: ~20 seconds (5s wait + API queries)
- T5.3 (bidirectional): ~40 seconds (5s + 30s wait + verification)
- T5.4 (quotes): ~15 seconds
- **Total:** ~5-10 minutes

## Sign-Off

Test completed by: ________________
Date: ________________
Result: ☐ PASS ☐ FAIL (see comments)

### Test Comments
[Document any issues, timing differences, or unexpected behavior here]

---

## References

- Bridge code: https://github.com/misatevez/saci-bridge
- SuiteCRM docs: https://github.com/misatevez/suitecrm/tree/main/docs
- DB schema: docs/sprint1/db-schema.md
- Reconcile tool: `npm run reconcile` (post-E2E for backfill)
