import crypto from "node:crypto";
import mysql, {
  type Pool,
  type PoolConnection,
  type RowDataPacket,
} from "mysql2/promise";
import type { ScopeProject, Workspace } from "@shared/scopepay";

let pool: Pool | null = null;

export type WorkspaceRow = RowDataPacket & {
  id: string;
  token_hash: string;
  documents: Workspace | string;
};

export type ClientTokenRow = RowDataPacket & {
  token_hash: string;
  workspace_id: string;
  project_id: string;
  document_id: string;
  document_version: number;
  revoked: number;
};

export type OrderRow = RowDataPacket & {
  id: string;
  workspace_id: string;
  project_id: string;
  document_id: string;
  document_version: number;
  amount_cents: number;
  currency: string;
  paypal_order_id: string | null;
  request_id: string;
  capture_id: string | null;
  status: string;
};

export function getScopePayPool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_UNAVAILABLE");
  if (!pool) {
    pool = mysql.createPool({
      uri: process.env.DATABASE_URL,
      connectionLimit: 8,
      waitForConnections: true,
      enableKeepAlive: true,
      decimalNumbers: true,
      namedPlaceholders: false,
    });
  }
  return pool;
}

export async function databaseReady(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    await getScopePayPool().query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

export function newId(): string {
  return crypto.randomUUID();
}

export function newCapability(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashCapability(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

export function parseWorkspace(value: unknown): Workspace {
  if (typeof value === "string") return JSON.parse(value) as Workspace;
  return value as Workspace;
}

export async function loadWorkspaceByTokenHash(
  tokenHash: string
): Promise<WorkspaceRow | null> {
  const [rows] = await getScopePayPool().execute<WorkspaceRow[]>(
    "SELECT id, token_hash, documents FROM scopepay_workspaces WHERE token_hash = ? LIMIT 1",
    [tokenHash]
  );
  return rows[0] ?? null;
}

export async function loadWorkspaceById(
  id: string
): Promise<WorkspaceRow | null> {
  const [rows] = await getScopePayPool().execute<WorkspaceRow[]>(
    "SELECT id, token_hash, documents FROM scopepay_workspaces WHERE id = ? LIMIT 1",
    [id]
  );
  return rows[0] ?? null;
}

export async function insertWorkspace(
  id: string,
  tokenHash: string,
  workspace: Workspace
): Promise<void> {
  await getScopePayPool().execute(
    "INSERT INTO scopepay_workspaces (id, token_hash, documents) VALUES (?, ?, ?)",
    [id, tokenHash, JSON.stringify(workspace)]
  );
}

export async function withWorkspaceLock<T>(
  id: string,
  work: (
    connection: PoolConnection,
    workspace: Workspace
  ) => Promise<{ value: T; workspace: Workspace }>
): Promise<T> {
  const connection = await getScopePayPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<WorkspaceRow[]>(
      "SELECT id, token_hash, documents FROM scopepay_workspaces WHERE id = ? FOR UPDATE",
      [id]
    );
    if (!rows[0]) throw new Error("WORKSPACE_NOT_FOUND");
    const current = parseWorkspace(rows[0].documents);
    const result = await work(connection, current);
    await connection.execute(
      "UPDATE scopepay_workspaces SET documents = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?",
      [JSON.stringify(result.workspace), id]
    );
    await connection.commit();
    return result.value;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function withTokenLock<T>(
  tokenHash: string,
  work: (
    connection: PoolConnection,
    workspaceRow: WorkspaceRow,
    workspace: Workspace,
    token: ClientTokenRow
  ) => Promise<{ value: T; workspace?: Workspace }>
): Promise<T> {
  const connection = await getScopePayPool().getConnection();
  try {
    await connection.beginTransaction();
    const [tokenRows] = await connection.execute<ClientTokenRow[]>(
      "SELECT token_hash, workspace_id, project_id, document_id, document_version, revoked FROM scopepay_client_tokens WHERE token_hash = ? FOR UPDATE",
      [tokenHash]
    );
    const token = tokenRows[0];
    if (!token || token.revoked) throw new Error("CLIENT_TOKEN_NOT_FOUND");
    const [workspaceRows] = await connection.execute<WorkspaceRow[]>(
      "SELECT id, token_hash, documents FROM scopepay_workspaces WHERE id = ? FOR UPDATE",
      [token.workspace_id]
    );
    const workspaceRow = workspaceRows[0];
    if (!workspaceRow) throw new Error("WORKSPACE_NOT_FOUND");
    const workspace = parseWorkspace(workspaceRow.documents);
    const result = await work(connection, workspaceRow, workspace, token);
    if (result.workspace) {
      await connection.execute(
        "UPDATE scopepay_workspaces SET documents = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?",
        [JSON.stringify(result.workspace), workspaceRow.id]
      );
    }
    await connection.commit();
    return result.value;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getClientToken(
  tokenHash: string
): Promise<ClientTokenRow | null> {
  const [rows] = await getScopePayPool().execute<ClientTokenRow[]>(
    "SELECT token_hash, workspace_id, project_id, document_id, document_version, revoked FROM scopepay_client_tokens WHERE token_hash = ? AND revoked = 0 LIMIT 1",
    [tokenHash]
  );
  return rows[0] ?? null;
}

export async function revokeDocumentTokens(
  connection: PoolConnection,
  workspaceId: string,
  projectId: string,
  documentId: string
): Promise<void> {
  await connection.execute(
    "UPDATE scopepay_client_tokens SET revoked = 1 WHERE workspace_id = ? AND project_id = ? AND document_id = ? AND revoked = 0",
    [workspaceId, projectId, documentId]
  );
}

export async function insertClientToken(
  connection: PoolConnection,
  tokenHash: string,
  workspaceId: string,
  projectId: string,
  documentId: string,
  version: number
): Promise<void> {
  await connection.execute(
    "INSERT INTO scopepay_client_tokens (token_hash, workspace_id, project_id, document_id, document_version, revoked) VALUES (?, ?, ?, ?, ?, 0)",
    [tokenHash, workspaceId, projectId, documentId, version]
  );
}

export async function findOrder(
  connection: PoolConnection,
  workspaceId: string,
  orderId: string
): Promise<OrderRow | null> {
  const [rows] = await connection.execute<OrderRow[]>(
    "SELECT id, workspace_id, project_id, document_id, document_version, amount_cents, currency, paypal_order_id, request_id, capture_id, status FROM scopepay_orders WHERE workspace_id = ? AND (id = ? OR paypal_order_id = ?) LIMIT 1 FOR UPDATE",
    [workspaceId, orderId, orderId]
  );
  return rows[0] ?? null;
}

export async function findDocumentOrder(
  connection: PoolConnection,
  workspaceId: string,
  documentId: string,
  version: number
): Promise<OrderRow | null> {
  const [rows] = await connection.execute<OrderRow[]>(
    "SELECT id, workspace_id, project_id, document_id, document_version, amount_cents, currency, paypal_order_id, request_id, capture_id, status FROM scopepay_orders WHERE workspace_id = ? AND document_id = ? AND document_version = ? LIMIT 1 FOR UPDATE",
    [workspaceId, documentId, version]
  );
  return rows[0] ?? null;
}

export async function updateOrder(
  connection: PoolConnection,
  orderId: string,
  values: { status?: string; paypalOrderId?: string; captureId?: string }
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (values.status) {
    sets.push("status = ?");
    params.push(values.status);
  }
  if (values.paypalOrderId) {
    sets.push("paypal_order_id = ?");
    params.push(values.paypalOrderId);
  }
  if (values.captureId) {
    sets.push("capture_id = ?");
    params.push(values.captureId);
  }
  if (sets.length === 0) return;
  params.push(orderId);
  await connection.execute(
    `UPDATE scopepay_orders SET ${sets.join(", ")}, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
    params
  );
}

export async function closeScopePayPool(): Promise<void> {
  if (pool) {
    const current = pool;
    pool = null;
    await current.end();
  }
}

export function projectById(
  workspace: Workspace,
  projectId: string
): ScopeProject {
  const project = workspace.projects.find(item => item.id === projectId);
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  return project;
}
