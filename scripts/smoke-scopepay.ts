import "dotenv/config";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import {
  closeScopePayPool,
  getScopePayPool,
  hashCapability,
} from "../server/scopepay/db";
import type { ScopeProject, Workspace } from "../shared/scopepay";

const base = process.env.SCOPEPAY_TEST_ORIGIN || "http://127.0.0.1:3000";
let token: string | undefined;
const checks: Array<{ check: string; passed: boolean }> = [];
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  owner = false,
  expectedStatus = 200
): Promise<any> {
  const response = await fetch(`${base}/api/scopepay${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(owner && token ? { "X-Workspace-Token": token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(45000),
  });
  const payload = await response.json();
  assert.equal(
    response.status,
    expectedStatus,
    `${method} ${path.replace(/\/client\/[^/]+/, "/client/[redacted]")} returned ${response.status}: ${payload.error || "unexpected response"}`
  );
  return payload;
}
function passed(check: string) {
  checks.push({ check, passed: true });
  console.log(`PASS: ${check}`);
}
function terms(project: ScopeProject) {
  return {
    title: project.quote.title,
    scopeSummary: project.quote.scopeSummary,
    deliverables: [{ ...project.quote.deliverables[0], priceCents: 1234 }],
    exclusions: project.quote.exclusions,
    timeline: project.quote.timeline,
    revisionLimit: project.quote.revisionLimit,
  };
}
try {
  const status = await call("/status");
  assert.equal(status.databaseConfigured, true);
  assert.equal(status.paypalConfigured, true);
  passed("Database and PayPal sandbox configuration available");
  await call("/workspace", "GET", undefined, false, 401);
  passed("Owner workspace requires a private capability");
  const created = await call("/workspaces", "POST", undefined, false, 201);
  token = created.token;
  let project: ScopeProject = await call(
    "/projects/sample",
    "POST",
    undefined,
    true,
    201
  );
  assert.equal(project.isSample, true);
  assert.equal(project.quote.status, "draft");
  assert.equal(project.quote.source, "sample");
  passed("Fictional sample has no fake approval or payment");
  const root = `/projects/${project.id}/documents/${project.quote.id}`;
  project = await call(root, "PATCH", terms(project), true);
  assert.equal(project.quote.totalCents, 1234);
  passed("Server stores and derives exact integer-cent prices");
  project = await call(`${root}/publish`, "POST", undefined, true);
  const oldToken = project.quote.clientToken!;
  const publicReview = await call(`/client/${oldToken}`);
  assert.equal(publicReview.document.clientToken, undefined);
  assert.equal(publicReview.brief, undefined);
  assert.equal(publicReview.audit, undefined);
  assert.equal(publicReview.document.totalCents, 1234);
  passed(
    "Client review exposes exact published terms, not private drafts or brief"
  );
  await call(
    `/client/${oldToken}/orders`,
    "POST",
    { version: project.quote.version },
    false,
    409
  );
  passed("PayPal order cannot be created before explicit acceptance");
  project = await call(`${root}/share`, "POST", undefined, true);
  const reviewToken = project.quote.clientToken!;
  assert.notEqual(reviewToken, oldToken);
  await call(`/client/${oldToken}`, "GET", undefined, false, 404);
  const ownerWorkspace: Workspace = await call(
    "/workspace",
    "GET",
    undefined,
    true
  );
  assert.equal(ownerWorkspace.projects[0].quote.clientToken, undefined);
  passed(
    "Fresh share links revoke old links; owner reload does not expose raw capabilities"
  );
  await call(
    `/client/${reviewToken}/accept`,
    "POST",
    { version: project.quote.version + 1, accepted: true },
    false,
    409
  );
  passed("A different document version cannot be accepted");
  const accepted = await call(`/client/${reviewToken}/accept`, "POST", {
    version: project.quote.version,
    accepted: true,
  });
  assert.equal(accepted.document.status, "accepted");
  await call(root, "PATCH", terms(project), true, 409);
  passed("Accepted document cannot be repriced by the freelancer");
  const order = await call(
    `/client/${reviewToken}/orders`,
    "POST",
    { version: project.quote.version },
    false,
    201
  );
  assert.ok(typeof order.id === "string" && order.id.length > 3);
  const repeatedOrder = await call(
    `/client/${reviewToken}/orders`,
    "POST",
    { version: project.quote.version },
    false,
    201
  );
  assert.equal(repeatedOrder.id, order.id);
  passed(
    "PayPal sandbox creates a real order; repeated creation returns the same order"
  );
  const reconciled = await call(`/client/${reviewToken}/orders/${order.id}`);
  assert.notEqual(reconciled.document.status, "paid");
  passed("An unapproved, uncaptured sandbox order is never marked paid");
  await writeFile(
    "docs/API_SMOKE_RESULTS.json",
    JSON.stringify(
      {
        testedAt: new Date().toISOString(),
        checks,
        boundary:
          "Synthetic workspace only. Real sandbox OAuth and Orders v2 creation exercised. No buyer approval or payment capture attempted. Test-owned local records are removed after the run; the unapproved remote sandbox order expires normally.",
      },
      null,
      2
    ) + "\n"
  );
} finally {
  // Only this script's newly-created, synthetic workspace is eligible for cleanup.
  if (token) {
    const pool = getScopePayPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute<any[]>(
        "SELECT id FROM scopepay_workspaces WHERE token_hash = ?",
        [hashCapability(token)]
      );
      if (rows[0]) {
        const id = rows[0].id;
        await connection.execute(
          "DELETE FROM scopepay_orders WHERE workspace_id = ?",
          [id]
        );
        await connection.execute(
          "DELETE FROM scopepay_client_tokens WHERE workspace_id = ?",
          [id]
        );
        await connection.execute(
          "DELETE FROM scopepay_workspaces WHERE id = ?",
          [id]
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
  await closeScopePayPool();
}
