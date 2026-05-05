-- Bridge-local DB: ID mapping table for upsert idempotency
CREATE TABLE IF NOT EXISTS saci_id_mapping (
  module      VARCHAR(50)  NOT NULL,
  firmas_id   CHAR(36)     NOT NULL,
  saci_id     VARCHAR(100) NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT NOW(),
  updated_at  DATETIME     NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  PRIMARY KEY (module, firmas_id),
  INDEX idx_saci_id (module, saci_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
