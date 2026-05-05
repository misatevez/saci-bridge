-- Seed schema for local E2E testing
CREATE TABLE IF NOT EXISTS saci_outbox (
  id            CHAR(36)        NOT NULL PRIMARY KEY,
  target_module VARCHAR(50)     NOT NULL,
  record_id     CHAR(36)        NOT NULL,
  payload_json  JSON            NOT NULL,
  status        ENUM('pending','in_flight','sent','failed','skipped') NOT NULL DEFAULT 'pending',
  retry_count   INT             NOT NULL DEFAULT 0,
  next_retry_at DATETIME        NULL,
  sent_at       DATETIME        NULL,
  created_at    DATETIME        NOT NULL DEFAULT NOW(),
  updated_at    DATETIME        NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  INDEX idx_status_retry (status, next_retry_at),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- AOS_Invoices: minimal schema for return-poller tests
CREATE TABLE IF NOT EXISTS AOS_Invoices (
  id                      CHAR(36)       NOT NULL PRIMARY KEY,
  name                    VARCHAR(255)   DEFAULT NULL,
  billing_account_id      CHAR(36)       DEFAULT NULL,
  aos_quotes_id           CHAR(36)       DEFAULT NULL,
  total_amount            DECIMAL(26,6)  DEFAULT 0.000000,
  total_amount_usdollar   DECIMAL(26,6)  DEFAULT 0.000000,
  currency_id             CHAR(36)       DEFAULT '-99',
  status                  VARCHAR(25)    DEFAULT 'Draft',
  date_due                DATE           DEFAULT NULL,
  date_entered            DATETIME       DEFAULT NULL,
  date_modified           DATETIME       DEFAULT NULL,
  created_by              CHAR(36)       DEFAULT '1',
  modified_user_id        CHAR(36)       DEFAULT '1',
  deleted                 TINYINT(1)     NOT NULL DEFAULT 0,
  INDEX idx_billing_account (billing_account_id),
  INDEX idx_quote (aos_quotes_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS AOS_Invoices_cstm (
  id_c           CHAR(36)     NOT NULL PRIMARY KEY,
  external_id_c  VARCHAR(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Grant read+write to saci_bridge_reader on saci_outbox only
GRANT SELECT, UPDATE ON firmascrm.saci_outbox TO 'saci_bridge_reader'@'%';
GRANT SELECT, INSERT, UPDATE ON firmascrm.AOS_Invoices TO 'saci_bridge_reader'@'%';
GRANT SELECT, INSERT, UPDATE ON firmascrm.AOS_Invoices_cstm TO 'saci_bridge_reader'@'%';
FLUSH PRIVILEGES;

-- E2E seed row: Account
INSERT INTO saci_outbox (id, target_module, record_id, payload_json) VALUES (
  'e2e-account-001',
  'Accounts',
  'acc-001',
  '{"id":"acc-001","name":"Empresa Test","email1":"test@empresa.ec","phone_office":"+593900000001","billing_address_street":"Calle Test 1","billing_address_city":"Quito","billing_address_country":"Ecuador","account_type":"RUC","sic_code":"1791234560001"}'
);

-- E2E seed row: Quote (Approved — should sync)
INSERT INTO saci_outbox (id, target_module, record_id, payload_json) VALUES (
  'e2e-quote-001',
  'AOS_Quotes',
  'q-001',
  '{"id":"q-001","quote_num":"QT-E2E-001","approval_status":"Approved","date_quote_expected_closed":"2026-05-01","billing_account_name":"Empresa Test","billing_address_street":"Calle Test 1","billing_address_city":"Quito","billing_contact_email":"test@empresa.ec","billing_contact_phone":"+593900000001","identification_type":"RUC","identification":"1791234560001","line_items":[{"sku":"pro001","name":"Producto demo","quantity":2,"unit_price":100,"total_amount":200}]}'
);

-- E2E seed row: Quote (Draft — should be skipped)
INSERT INTO saci_outbox (id, target_module, record_id, payload_json) VALUES (
  'e2e-quote-draft-001',
  'AOS_Quotes',
  'q-draft-001',
  '{"id":"q-draft-001","quote_num":"QT-DRAFT-001","approval_status":"Draft","billing_account_name":"Empresa Test","identification_type":"RUC","identification":"1791234560001","line_items":[]}'
);
