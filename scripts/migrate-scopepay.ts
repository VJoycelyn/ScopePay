import "dotenv/config";
import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const pool = mysql.createPool({
  uri: databaseUrl,
  connectionLimit: 2,
  waitForConnections: true,
});
const statements = [
  `CREATE TABLE IF NOT EXISTS scopepay_workspaces (
    id CHAR(36) NOT NULL,
    token_hash CHAR(64) NOT NULL,
    documents JSON NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY scopepay_workspaces_token_hash (token_hash)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS scopepay_client_tokens (
    token_hash CHAR(64) NOT NULL,
    workspace_id CHAR(36) NOT NULL,
    project_id CHAR(36) NOT NULL,
    document_id CHAR(36) NOT NULL,
    document_version INT NOT NULL,
    revoked TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (token_hash),
    KEY scopepay_client_tokens_document (workspace_id, project_id, document_id, document_version),
    KEY scopepay_client_tokens_active (token_hash, revoked),
    CONSTRAINT scopepay_client_tokens_workspace_fk FOREIGN KEY (workspace_id) REFERENCES scopepay_workspaces(id)
  ) ENGINE=InnoDB`,
  `CREATE TABLE IF NOT EXISTS scopepay_orders (
    id CHAR(36) NOT NULL,
    workspace_id CHAR(36) NOT NULL,
    project_id CHAR(36) NOT NULL,
    document_id CHAR(36) NOT NULL,
    document_version INT NOT NULL,
    amount_cents INT NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    paypal_order_id VARCHAR(80) NULL,
    request_id CHAR(36) NOT NULL,
    capture_id VARCHAR(80) NULL,
    status VARCHAR(24) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY scopepay_orders_paypal_order (paypal_order_id),
    UNIQUE KEY scopepay_orders_document_version (workspace_id, document_id, document_version),
    KEY scopepay_orders_lookup (workspace_id, project_id, document_id, document_version),
    CONSTRAINT scopepay_orders_workspace_fk FOREIGN KEY (workspace_id) REFERENCES scopepay_workspaces(id)
  ) ENGINE=InnoDB`,
];

try {
  for (const statement of statements) await pool.execute(statement);
  console.log("ScopePay migration complete");
} finally {
  await pool.end();
}
