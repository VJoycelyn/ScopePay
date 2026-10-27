import crypto from "node:crypto";
import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import type { PoolConnection } from "mysql2/promise";
import type {
  AuditEvent,
  ChangeAnalysis,
  ClientReview,
  Deliverable,
  DocumentStatus,
  EditDocumentInput,
  ScopeDocument,
  ScopeProject,
  Workspace,
} from "@shared/scopepay";
import {
  analyzeChange,
  aiConfigured,
  generateQuote,
  SCOPEPAY_MODEL,
} from "./ai";
import {
  databaseReady,
  getClientToken,
  getScopePayPool,
  hashCapability,
  insertClientToken,
  insertWorkspace,
  loadWorkspaceById,
  loadWorkspaceByTokenHash,
  newCapability,
  newId,
  parseWorkspace,
  projectById,
  revokeDocumentTokens,
  withTokenLock,
  withWorkspaceLock,
  findDocumentOrder,
  findOrder,
  updateOrder,
} from "./db";
import {
  capturePaypalOrder,
  completedCapture,
  createPaypalOrder,
  extractApprovalUrl,
  getPaypalOrder,
  paypalClientId,
  paypalConfigured,
  paypalOrderMatches,
  paypalPaymentStatus,
  recoveryStatus,
} from "./paypal";
import { createPaymentTrace, safePaymentErrorCode } from "./payment-trace";

const router = Router();
const MAX_TOTAL_CENTS = 100_000_000;
const tokenPattern = /^[A-Za-z0-9_-]{40,64}$/;
const rateEntries = new Map<string, { start: number; count: number }>();

const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(160),
  clientName: z.string().trim().min(1).max(160),
  brief: z.string().trim().min(1).max(12_000),
  hourlyRateCents: z.number().int().min(1).max(1_000_000),
  budgetCents: z.number().int().min(0).max(MAX_TOTAL_CENTS).nullable(),
});
const editDocumentSchema = z.object({
  title: z.string().trim().min(1).max(180),
  scopeSummary: z.string().trim().min(1).max(2_000),
  deliverables: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(80),
        title: z.string().trim().min(1).max(180),
        description: z.string().trim().min(1).max(800),
        hours: z.number().finite().min(0).max(1000),
        priceCents: z.number().int().min(0).max(MAX_TOTAL_CENTS),
      })
    )
    .min(1)
    .max(24),
  exclusions: z.array(z.string().trim().min(1).max(400)).max(24),
  timeline: z.string().trim().min(1).max(300),
  revisionLimit: z.string().trim().min(1).max(300),
});
const analysisInputSchema = z.object({
  request: z.string().trim().min(1).max(8_000),
});
const acceptanceSchema = z.object({
  version: z.number().int().positive(),
  accepted: z.literal(true),
});
const orderSchema = z.object({ version: z.number().int().positive() });
const recoverySchema = z.object({
  version: z.number().int().positive(),
  confirmedNoPayment: z.literal(true),
});
const DEFAULT_PUBLIC_ORIGIN = "https://scopepay.manus.space";

function now(): string {
  return new Date().toISOString();
}
function audit(type: string, message: string): AuditEvent {
  return { id: newId(), type, message: message.slice(0, 600), at: now() };
}
function workspaceEmpty(): Workspace {
  return { projects: [] };
}
function requestToken(req: Request): string | null {
  const raw = req.header("x-workspace-token");
  return raw && tokenPattern.test(raw) ? raw : null;
}
function publicToken(req: Request): string | null {
  const raw = req.params.token;
  return typeof raw === "string" && tokenPattern.test(raw) ? raw : null;
}
function rateLimit(req: Request, key: string, limit: number): boolean {
  const nowMs = Date.now();
  const bucketKey = `${key}:${req.ip}`;
  const current = rateEntries.get(bucketKey);
  if (!current || nowMs - current.start >= 60_000) {
    rateEntries.set(bucketKey, { start: nowMs, count: 1 });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}
function sendError(
  res: Response,
  status: number,
  error: string,
  code?: string
): void {
  res.status(status).json(code ? { error, code } : { error });
}
function parsedBody<T>(schema: z.ZodType<T>, body: unknown): T | null {
  const result = schema.safeParse(body);
  return result.success ? result.data : null;
}
function safeProviderStatus(error: unknown): {
  status: number;
  message: string;
  code: string;
} {
  const message = error instanceof Error ? error.message : "";
  if (message === "CLIENT_TOKEN_NOT_FOUND")
    return {
      status: 404,
      message: "Review link not found",
      code: "CLIENT_LINK_NOT_FOUND",
    };
  if (message === "PAYPAL_ORDER_NOT_FOUND")
    return {
      status: 404,
      message: "PayPal order not found",
      code: "PAYPAL_ORDER_NOT_FOUND",
    };
  if (message === "ORDER_NOT_FOUND")
    return { status: 404, message: "Order not found", code: "ORDER_NOT_FOUND" };
  if (message === "ORDER_NOT_READY")
    return {
      status: 409,
      message: "Order is still being created; retry shortly",
      code: "ORDER_PENDING",
    };
  if (message === "PAYMENT_MISMATCH")
    return {
      status: 409,
      message: "Payment verification did not match the stored order",
      code: "PAYMENT_MISMATCH",
    };
  if (message === "PAYMENT_PENDING")
    return {
      status: 409,
      message:
        "Payment is pending verification; verify payment before retrying",
      code: "PAYMENT_PENDING",
    };
  if (message === "PAYMENT_UNKNOWN")
    return {
      status: 503,
      message: "Payment status is uncertain; verify payment before retrying",
      code: "PAYMENT_UNKNOWN",
    };
  if (message === "PAYMENT_RETRY")
    return {
      status: 409,
      message: "PayPal has no completed capture; retry the accepted order",
      code: "PAYMENT_RETRY",
    };
  if (message === "AI_NOT_CONFIGURED")
    return {
      status: 503,
      message: "AI drafting is not configured",
      code: "AI_NOT_CONFIGURED",
    };
  if (message === "PAYPAL_NOT_CONFIGURED")
    return {
      status: 503,
      message: "PayPal checkout is not configured",
      code: "PAYPAL_NOT_CONFIGURED",
    };
  if (message === "PAYPAL_PROVIDER_REJECTED")
    return {
      status: 502,
      message: "PayPal did not accept the request",
      code: "PAYPAL_UNAVAILABLE",
    };
  if (message === "PAYPAL_UNAVAILABLE")
    return {
      status: 503,
      message: "PayPal is temporarily unavailable",
      code: "PAYPAL_UNAVAILABLE",
    };
  if (message.startsWith("AI_"))
    return {
      status: 502,
      message: "AI did not return a usable draft",
      code: "AI_UNAVAILABLE",
    };
  return {
    status: 500,
    message: "Request could not be completed",
    code: "INTERNAL_ERROR",
  };
}
function publicOrigin(): string {
  const configured = process.env.SCOPEPAY_PUBLIC_ORIGIN?.trim();
  if (!configured) return DEFAULT_PUBLIC_ORIGIN;
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" || url.username || url.password)
      return DEFAULT_PUBLIC_ORIGIN;
    return url.origin;
  } catch {
    return DEFAULT_PUBLIC_ORIGIN;
  }
}
function sumPrices(deliverables: Deliverable[]): number {
  const total = deliverables.reduce((sum, item) => sum + item.priceCents, 0);
  if (!Number.isSafeInteger(total) || total < 0 || total > MAX_TOTAL_CENTS)
    throw new Error("INVALID_TOTAL");
  return total;
}
function scopeFingerprint(document: ScopeDocument): string {
  const evidence = {
    title: document.title,
    scopeSummary: document.scopeSummary,
    deliverables: document.deliverables.map(item => ({
      title: item.title,
      description: item.description,
      hours: item.hours,
      priceCents: item.priceCents,
    })),
    exclusions: document.exclusions,
    timeline: document.timeline,
    revisionLimit: document.revisionLimit,
    currency: document.currency,
    totalCents: document.totalCents,
  };
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(evidence), "utf8")
    .digest("hex");
}
function copyDocument(
  document: ScopeDocument,
  includeClientToken = false
): ScopeDocument {
  const result: ScopeDocument = {
    ...document,
    deliverables: document.deliverables.map(item => ({ ...item })),
    exclusions: [...document.exclusions],
  };
  if (!includeClientToken) delete result.clientToken;
  return result;
}
function ownerProject(
  project: ScopeProject,
  publishedToken?: string,
  publishedDocumentId?: string
): ScopeProject {
  const result: ScopeProject = JSON.parse(
    JSON.stringify(project)
  ) as ScopeProject;
  delete result.quote.clientToken;
  result.changes = result.changes.map(item => {
    const doc = { ...item };
    delete doc.clientToken;
    return doc;
  });
  if (publishedToken) {
    const current = [result.quote, ...result.changes].find(
      doc => doc.id === publishedDocumentId && doc.status !== "draft"
    );
    if (current) current.clientToken = publishedToken;
  }
  return result;
}
function ownerWorkspace(workspace: Workspace): Workspace {
  return { projects: workspace.projects.map(project => ownerProject(project)) };
}
function makeDocument(args: {
  id: string;
  kind: "quote" | "change";
  title: string;
  scopeSummary: string;
  deliverables: Deliverable[];
  exclusions: string[];
  timeline: string;
  revisionLimit: string;
  status: DocumentStatus;
  source: "live_ai" | "sample" | "manual";
}): ScopeDocument {
  return {
    id: args.id,
    kind: args.kind,
    title: args.title,
    scopeSummary: args.scopeSummary,
    deliverables: args.deliverables,
    exclusions: args.exclusions,
    timeline: args.timeline,
    revisionLimit: args.revisionLimit,
    currency: "USD",
    totalCents: sumPrices(args.deliverables),
    status: args.status,
    version: 1,
    createdAt: now(),
    source: args.source,
  };
}
function publicReview(
  project: ScopeProject,
  document: ScopeDocument
): ClientReview {
  const safe: ScopeDocument = {
    id: document.id,
    kind: document.kind,
    title: document.title,
    scopeSummary: document.scopeSummary,
    deliverables: document.deliverables.map(item => ({ ...item })),
    exclusions: [...document.exclusions],
    timeline: document.timeline,
    revisionLimit: document.revisionLimit,
    currency: "USD",
    totalCents: document.totalCents,
    status: document.status,
    version: document.version,
    createdAt: document.createdAt,
    source: document.source,
    acceptedAt: document.acceptedAt,
    paidAt: document.paidAt,
    paypalOrderId: document.paypalOrderId,
    paypalCaptureId:
      document.status === "paid" ? document.paypalCaptureId : undefined,
  };
  return {
    projectName: project.name,
    clientName: project.clientName,
    document: safe,
    sandbox: true,
    merchantNotice:
      "Sandbox payment to one configured merchant; no escrow or production money movement.",
  };
}
function documentFromProject(
  project: ScopeProject,
  documentId: string
): ScopeDocument {
  if (project.quote.id === documentId) return project.quote;
  const document = project.changes.find(item => item.id === documentId);
  if (!document) throw new Error("DOCUMENT_NOT_FOUND");
  return document;
}
function requireOwner(
  req: Request,
  res: Response
): { token: string; hash: string } | null {
  const token = requestToken(req);
  if (!token) {
    sendError(res, 401, "Workspace token required", "WORKSPACE_TOKEN_REQUIRED");
    return null;
  }
  return { token, hash: hashCapability(token) };
}
function requireClient(
  req: Request,
  res: Response
): { token: string; hash: string } | null {
  const token = publicToken(req);
  if (!token) {
    sendError(res, 404, "Review link not found", "CLIENT_LINK_NOT_FOUND");
    return null;
  }
  return { token, hash: hashCapability(token) };
}

router.get("/status", async (_req, res) => {
  res.json({
    aiConfigured: aiConfigured(),
    paypalConfigured: paypalConfigured(),
    databaseConfigured: await databaseReady(),
    paypalClientId: paypalClientId(),
    aiModel: SCOPEPAY_MODEL,
    environment: "sandbox",
  });
});

router.post("/workspaces", async (_req, res) => {
  if (!process.env.DATABASE_URL)
    return sendError(
      res,
      503,
      "Database is not configured",
      "DATABASE_NOT_CONFIGURED"
    );
  if (!rateLimit(_req, "workspace-create", 10))
    return sendError(res, 429, "Too many workspace requests", "RATE_LIMITED");
  try {
    const token = newCapability();
    const workspace = workspaceEmpty();
    await insertWorkspace(newId(), hashCapability(token), workspace);
    res.status(201).json({ token, workspace });
  } catch {
    sendError(res, 503, "Database is not ready", "DATABASE_UNAVAILABLE");
  }
});

router.get("/workspace", async (req, res) => {
  const owner = requireOwner(req, res);
  if (!owner) return;
  if (!rateLimit(req, "workspace-read", 120))
    return sendError(res, 429, "Too many requests", "RATE_LIMITED");
  try {
    const row = await loadWorkspaceByTokenHash(owner.hash);
    if (!row)
      return sendError(
        res,
        401,
        "Workspace token is invalid",
        "WORKSPACE_TOKEN_INVALID"
      );
    res.json(ownerWorkspace(parseWorkspace(row.documents)));
  } catch {
    sendError(res, 503, "Database is not ready", "DATABASE_UNAVAILABLE");
  }
});

router.post("/projects", async (req, res) => {
  const owner = requireOwner(req, res);
  if (!owner) return;
  const input = parsedBody(createProjectSchema, req.body);
  if (!input)
    return sendError(res, 400, "Invalid project input", "INVALID_INPUT");
  if (!rateLimit(req, "project-ai", 5))
    return sendError(res, 429, "Too many AI requests", "RATE_LIMITED");
  try {
    const row = await loadWorkspaceByTokenHash(owner.hash);
    if (!row)
      return sendError(
        res,
        401,
        "Workspace token is invalid",
        "WORKSPACE_TOKEN_INVALID"
      );
    const draft = await generateQuote(input.brief);
    const deliverables: Deliverable[] = draft.deliverables.map(
      (item, index) => ({
        id: newId(),
        title: item.title,
        description: item.description,
        hours: item.hours,
        priceCents: Math.round(item.hours * input.hourlyRateCents),
      })
    );
    const quote = makeDocument({
      id: newId(),
      kind: "quote",
      title: input.name,
      scopeSummary:
        draft.scopeSummary +
        (draft.questions.length
          ? "\n\nClarify before publishing:\n" +
            draft.questions.map(question => `• ${question}`).join("\n")
          : ""),
      deliverables,
      exclusions: draft.exclusions,
      timeline: draft.timeline,
      revisionLimit: draft.revisionLimit,
      status: "draft",
      source: "live_ai",
    });
    const project: ScopeProject = {
      id: newId(),
      name: input.name,
      clientName: input.clientName,
      brief: input.brief,
      hourlyRateCents: input.hourlyRateCents,
      budgetCents: input.budgetCents,
      quote,
      changes: [],
      analyses: [],
      audit: [
        audit(
          "ai_quote_generated",
          `Live AI quote generated with model ${SCOPEPAY_MODEL}`
        ),
      ],
      createdAt: now(),
      isSample: false,
      aiModel: SCOPEPAY_MODEL,
    };
    const created = await withWorkspaceLock(
      row.id,
      async (_connection, workspace) => ({
        value: project,
        workspace: { ...workspace, projects: [...workspace.projects, project] },
      })
    );
    res.status(201).json(ownerProject(created));
  } catch (error) {
    const result = safeProviderStatus(error);
    sendError(res, result.status, result.message, result.code);
  }
});

router.post("/projects/sample", async (req, res) => {
  const owner = requireOwner(req, res);
  if (!owner) return;
  if (!rateLimit(req, "sample", 10))
    return sendError(res, 429, "Too many requests", "RATE_LIMITED");
  try {
    const row = await loadWorkspaceByTokenHash(owner.hash);
    if (!row)
      return sendError(
        res,
        401,
        "Workspace token is invalid",
        "WORKSPACE_TOKEN_INVALID"
      );
    const deliverables: Deliverable[] = [
      {
        id: newId(),
        title: "Fictional landing page direction",
        description:
          "Wireframe and visual direction for the fictional Harbor & Pine studio landing page.",
        hours: 6,
        priceCents: 90000,
      },
      {
        id: newId(),
        title: "Fictional responsive build",
        description:
          "A responsive front-end implementation for the fictional sample brand.",
        hours: 10,
        priceCents: 150000,
      },
      {
        id: newId(),
        title: "Fictional handoff review",
        description: "One review pass and a clearly labeled handoff checklist.",
        hours: 2,
        priceCents: 30000,
      },
    ];
    const quote = makeDocument({
      id: newId(),
      kind: "quote",
      title: "Harbor & Pine landing page (fictional sample)",
      scopeSummary:
        "A fictional sample scope showing how a small studio landing page can move from brief to explicit deliverables.",
      deliverables,
      exclusions: [
        "Brand naming or trademark clearance",
        "Paid media management",
        "Production hosting charges",
      ],
      timeline: "Fictional sample: two weeks from kickoff",
      revisionLimit: "One review pass per deliverable",
      status: "draft",
      source: "sample",
    });
    const project: ScopeProject = {
      id: newId(),
      name: "Harbor & Pine landing page (fictional sample)",
      clientName: "Fictional client — not a real engagement",
      brief:
        "This is explicitly fictional sample data for a design studio landing page demonstration.",
      hourlyRateCents: 15000,
      budgetCents: 270000,
      quote,
      changes: [],
      analyses: [],
      audit: [
        audit(
          "sample_created",
          "Fictional source sample created; no accepted or paid state"
        ),
      ],
      createdAt: now(),
      isSample: true,
    };
    const created = await withWorkspaceLock(
      row.id,
      async (_connection, workspace) => ({
        value: project,
        workspace: { ...workspace, projects: [...workspace.projects, project] },
      })
    );
    res.status(201).json(ownerProject(created));
  } catch {
    sendError(res, 503, "Database is not ready", "DATABASE_UNAVAILABLE");
  }
});

router.patch("/projects/:projectId/documents/:documentId", async (req, res) => {
  const owner = requireOwner(req, res);
  if (!owner) return;
  const input = parsedBody(editDocumentSchema, req.body);
  if (!input)
    return sendError(res, 400, "Invalid document input", "INVALID_INPUT");
  try {
    const row = await loadWorkspaceByTokenHash(owner.hash);
    if (!row)
      return sendError(
        res,
        401,
        "Workspace token is invalid",
        "WORKSPACE_TOKEN_INVALID"
      );
    const updated = await withWorkspaceLock(
      row.id,
      async (connection, workspace) => {
        const project = projectById(workspace, String(req.params.projectId));
        const document = documentFromProject(
          project,
          String(req.params.documentId)
        );
        if (document.status !== "draft" && document.status !== "published")
          throw new Error("DOCUMENT_LOCKED");
        const totalCents = sumPrices(input.deliverables as Deliverable[]);
        const wasPublished = document.status === "published";
        const replacement: ScopeDocument = {
          ...document,
          ...(input as EditDocumentInput),
          totalCents,
          status: "draft",
          version: document.version + 1,
          acceptedAt: undefined,
          paidAt: undefined,
          paypalOrderId: undefined,
          paypalCaptureId: undefined,
          clientToken: undefined,
        };
        const nextProject = {
          ...project,
          quote: project.quote.id === document.id ? replacement : project.quote,
          changes: project.changes.map(item =>
            item.id === document.id ? replacement : item
          ),
          audit: [
            ...project.audit,
            audit(
              "document_edited",
              wasPublished
                ? "Published document edited; old client link revoked and document returned to draft"
                : "Draft document edited"
            ),
          ],
        };
        if (wasPublished)
          await revokeDocumentTokens(
            connection,
            row.id,
            project.id,
            document.id
          );
        const nextWorkspace = {
          ...workspace,
          projects: workspace.projects.map(item =>
            item.id === project.id ? nextProject : item
          ),
        };
        return { value: nextProject, workspace: nextWorkspace };
      }
    );
    res.json(ownerProject(updated));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "DOCUMENT_LOCKED")
      return sendError(
        res,
        409,
        "Accepted or payment-started documents cannot be edited",
        "DOCUMENT_LOCKED"
      );
    if (message === "INVALID_TOTAL")
      return sendError(res, 400, "Document total is invalid", "INVALID_TOTAL");
    if (message === "PROJECT_NOT_FOUND" || message === "DOCUMENT_NOT_FOUND")
      return sendError(res, 404, "Project or document not found", "NOT_FOUND");
    sendError(res, 503, "Database is not ready", "DATABASE_UNAVAILABLE");
  }
});

router.post(
  "/projects/:projectId/documents/:documentId/publish",
  async (req, res) => {
    const owner = requireOwner(req, res);
    if (!owner) return;
    try {
      const row = await loadWorkspaceByTokenHash(owner.hash);
      if (!row)
        return sendError(
          res,
          401,
          "Workspace token is invalid",
          "WORKSPACE_TOKEN_INVALID"
        );
      const token = newCapability();
      const result = await withWorkspaceLock(
        row.id,
        async (connection, workspace) => {
          const project = projectById(workspace, String(req.params.projectId));
          const document = documentFromProject(
            project,
            String(req.params.documentId)
          );
          if (document.status !== "draft")
            throw new Error("DOCUMENT_NOT_DRAFT");
          if (document.totalCents !== sumPrices(document.deliverables))
            throw new Error("INVALID_TOTAL");
          await revokeDocumentTokens(
            connection,
            row.id,
            project.id,
            document.id
          );
          await insertClientToken(
            connection,
            hashCapability(token),
            row.id,
            project.id,
            document.id,
            document.version
          );
          const published = {
            ...document,
            status: "published" as const,
            clientToken: undefined,
          };
          const nextProject = {
            ...project,
            quote: project.quote.id === document.id ? published : project.quote,
            changes: project.changes.map(item =>
              item.id === document.id ? published : item
            ),
            audit: [
              ...project.audit,
              audit(
                "document_published",
                `Published ${document.kind} version ${document.version}; client review capability issued`
              ),
            ],
          };
          const nextWorkspace = {
            ...workspace,
            projects: workspace.projects.map(item =>
              item.id === project.id ? nextProject : item
            ),
          };
          return {
            value: { project: nextProject, token },
            workspace: nextWorkspace,
          };
        }
      );
      res.json(
        ownerProject(
          result.project,
          result.token,
          String(req.params.documentId)
        )
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "DOCUMENT_NOT_DRAFT")
        return sendError(
          res,
          409,
          "Only draft documents can be published",
          "DOCUMENT_NOT_DRAFT"
        );
      if (message === "INVALID_TOTAL")
        return sendError(
          res,
          400,
          "Document total is invalid",
          "INVALID_TOTAL"
        );
      if (message === "PROJECT_NOT_FOUND" || message === "DOCUMENT_NOT_FOUND")
        return sendError(
          res,
          404,
          "Project or document not found",
          "NOT_FOUND"
        );
      sendError(res, 503, "Database is not ready", "DATABASE_UNAVAILABLE");
    }
  }
);

router.post(
  "/projects/:projectId/documents/:documentId/share",
  async (req, res) => {
    const owner = requireOwner(req, res);
    if (!owner) return;
    if (!rateLimit(req, "share-reissue", 20))
      return sendError(
        res,
        429,
        "Too many share-link requests",
        "RATE_LIMITED"
      );
    try {
      const row = await loadWorkspaceByTokenHash(owner.hash);
      if (!row)
        return sendError(
          res,
          401,
          "Workspace token is invalid",
          "WORKSPACE_TOKEN_INVALID"
        );
      const token = newCapability();
      const result = await withWorkspaceLock(
        row.id,
        async (connection, workspace) => {
          const project = projectById(workspace, String(req.params.projectId));
          const document = documentFromProject(
            project,
            String(req.params.documentId)
          );
          if (document.status === "draft") throw new Error("DOCUMENT_DRAFT");
          await revokeDocumentTokens(
            connection,
            row.id,
            project.id,
            document.id
          );
          await insertClientToken(
            connection,
            hashCapability(token),
            row.id,
            project.id,
            document.id,
            document.version
          );
          const nextProject = {
            ...project,
            audit: [
              ...project.audit,
              audit(
                "client_link_reissued",
                `Fresh client review capability issued for ${document.kind} version ${document.version}; previous links revoked`
              ),
            ],
          };
          return {
            value: { project: nextProject, token },
            workspace: {
              ...workspace,
              projects: workspace.projects.map(item =>
                item.id === project.id ? nextProject : item
              ),
            },
          };
        }
      );
      res.json(
        ownerProject(
          result.project,
          result.token,
          String(req.params.documentId)
        )
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "DOCUMENT_DRAFT")
        return sendError(
          res,
          409,
          "Only published documents can receive a review link",
          "DOCUMENT_DRAFT"
        );
      if (message === "PROJECT_NOT_FOUND" || message === "DOCUMENT_NOT_FOUND")
        return sendError(
          res,
          404,
          "Project or document not found",
          "NOT_FOUND"
        );
      sendError(res, 503, "Database is not ready", "DATABASE_UNAVAILABLE");
    }
  }
);

router.post("/projects/:projectId/analyze", async (req, res) => {
  const owner = requireOwner(req, res);
  if (!owner) return;
  const input = parsedBody(analysisInputSchema, req.body);
  if (!input)
    return sendError(res, 400, "Invalid change request", "INVALID_INPUT");
  if (!rateLimit(req, "change-ai", 8))
    return sendError(res, 429, "Too many AI requests", "RATE_LIMITED");
  try {
    const row = await loadWorkspaceByTokenHash(owner.hash);
    if (!row)
      return sendError(
        res,
        401,
        "Workspace token is invalid",
        "WORKSPACE_TOKEN_INVALID"
      );
    const workspace = parseWorkspace(row.documents);
    const project = projectById(workspace, String(req.params.projectId));
    const scope = project.quote;
    const scopeEvidence = {
      scopeDocumentId: scope.id,
      scopeVersion: scope.version,
      scopeFingerprint: scopeFingerprint(scope),
      scopeStatus: scope.status,
    };
    const referenceLabel =
      scope.status === "draft"
        ? "CURRENT DRAFT REFERENCE — NOT CLIENT-APPROVED"
        : "CURRENT PUBLISHED REFERENCE";
    const aiScope = {
      ...scope,
      title: `${referenceLabel} · ${scope.title}`,
      scopeSummary: `${referenceLabel}\n${scope.scopeSummary}`,
    };
    const draft = await analyzeChange(input.request, aiScope);
    const result = await withWorkspaceLock(
      row.id,
      async (_connection, current) => {
        const currentProject = projectById(
          current,
          String(req.params.projectId)
        );
        const currentScope = currentProject.quote;
        if (
          currentScope.id !== scopeEvidence.scopeDocumentId ||
          currentScope.version !== scopeEvidence.scopeVersion ||
          scopeFingerprint(currentScope) !== scopeEvidence.scopeFingerprint
        )
          throw new Error("SCOPE_CHANGED");
        const analysis: ChangeAnalysis = {
          id: newId(),
          request: input.request,
          verdict: draft.verdict,
          summary: draft.summary,
          items: draft.items,
          suggestedReply: draft.suggestedReply,
          suggestedDeliverables: draft.suggestedDeliverables,
          totalSuggestedHours: draft.suggestedDeliverables.reduce(
            (sum, item) => sum + item.hours,
            0
          ),
          model: SCOPEPAY_MODEL,
          generatedAt: now(),
          source: "live_ai",
          ...scopeEvidence,
        };
        const nextProject = {
          ...currentProject,
          analyses: [...currentProject.analyses, analysis],
          audit: [
            ...currentProject.audit,
            audit(
              "ai_change_analyzed",
              `Live AI change analysis generated with model ${SCOPEPAY_MODEL}`
            ),
          ],
        };
        return {
          value: { project: nextProject, analysis },
          workspace: {
            ...current,
            projects: current.projects.map(item =>
              item.id === nextProject.id ? nextProject : item
            ),
          },
        };
      }
    );
    res.json({
      project: ownerProject(result.project),
      analysis: result.analysis,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "PROJECT_NOT_FOUND")
      return sendError(res, 404, "Project not found", "NOT_FOUND");
    if (message === "SCOPE_CHANGED")
      return sendError(
        res,
        409,
        "The quote changed while the AI analysis was running; analyze the current scope again",
        "SCOPE_CHANGED"
      );
    const result = safeProviderStatus(error);
    sendError(res, result.status, result.message, result.code);
  }
});

router.post("/projects/:projectId/changes", async (req, res) => {
  const owner = requireOwner(req, res);
  if (!owner) return;
  const body = req.body as { analysisId?: unknown };
  if (typeof body?.analysisId !== "string" || body.analysisId.length > 80)
    return sendError(res, 400, "Invalid analysis id", "INVALID_INPUT");
  try {
    const row = await loadWorkspaceByTokenHash(owner.hash);
    if (!row)
      return sendError(
        res,
        401,
        "Workspace token is invalid",
        "WORKSPACE_TOKEN_INVALID"
      );
    const result = await withWorkspaceLock(
      row.id,
      async (_connection, workspace) => {
        const project = projectById(workspace, String(req.params.projectId));
        const analysis = project.analyses.find(
          item => item.id === body.analysisId
        );
        if (!analysis) throw new Error("ANALYSIS_NOT_FOUND");
        if (
          !analysis.scopeDocumentId ||
          !analysis.scopeVersion ||
          !analysis.scopeFingerprint ||
          !analysis.scopeStatus
        )
          throw new Error("ANALYSIS_UNBOUND");
        if (
          analysis.scopeDocumentId !== project.quote.id ||
          analysis.scopeVersion !== project.quote.version ||
          analysis.scopeFingerprint !== scopeFingerprint(project.quote)
        )
          throw new Error("ANALYSIS_STALE");
        const existing = project.changes.find(
          item => item.analysisId === analysis.id
        );
        if (existing) return { value: { project, created: false }, workspace };
        if (analysis.suggestedDeliverables.length === 0)
          throw new Error("NO_EXTRA_WORK");
        const deliverables: Deliverable[] = analysis.suggestedDeliverables.map(
          item => ({
            id: newId(),
            title: item.title,
            description: item.description,
            hours: item.hours,
            priceCents: 0,
          })
        );
        const document: ScopeDocument = {
          ...makeDocument({
            id: newId(),
            kind: "change",
            title: `Change order: ${analysis.request.slice(0, 120)}`,
            scopeSummary: analysis.summary,
            deliverables,
            exclusions: ["Any work not explicitly listed in this change order"],
            timeline: "To be confirmed after client acceptance",
            revisionLimit: "As stated in the parent quote",
            status: "draft",
            source: "manual",
          }),
          analysisId: analysis.id,
        };
        const nextProject = {
          ...project,
          changes: [...project.changes, document],
          audit: [
            ...project.audit,
            audit(
              "change_draft_created",
              "Freelancer created a draft change order from AI suggestions; prices remain for freelancer review"
            ),
          ],
        };
        return {
          value: { project: nextProject, created: true },
          workspace: {
            ...workspace,
            projects: workspace.projects.map(item =>
              item.id === project.id ? nextProject : item
            ),
          },
        };
      }
    );
    res.status(result.created ? 201 : 200).json(ownerProject(result.project));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "ANALYSIS_NOT_FOUND")
      return sendError(res, 404, "Analysis not found", "NOT_FOUND");
    if (message === "ANALYSIS_UNBOUND")
      return sendError(
        res,
        409,
        "This analysis is not bound to an exact quote snapshot; analyze the current scope again",
        "ANALYSIS_UNBOUND"
      );
    if (message === "ANALYSIS_STALE")
      return sendError(
        res,
        409,
        "This analysis is stale because the quote changed; analyze the current scope again",
        "ANALYSIS_STALE"
      );
    if (message === "NO_EXTRA_WORK")
      return sendError(
        res,
        422,
        "The analysis found no extra work to turn into a change order",
        "NO_EXTRA_WORK"
      );
    if (message === "PROJECT_NOT_FOUND")
      return sendError(res, 404, "Project not found", "NOT_FOUND");
    sendError(res, 503, "Database is not ready", "DATABASE_UNAVAILABLE");
  }
});

async function loadPublicContext(hash: string): Promise<{
  row: Awaited<ReturnType<typeof getClientToken>>;
  workspace: Workspace;
  project: ScopeProject;
  document: ScopeDocument;
} | null> {
  const token = await getClientToken(hash);
  if (!token) return null;
  const row = await loadWorkspaceById(token.workspace_id);
  if (!row) return null;
  const workspace = parseWorkspace(row.documents);
  const project = workspace.projects.find(item => item.id === token.project_id);
  if (!project) return null;
  const document = documentFromProject(project, token.document_id);
  if (
    document.version !== token.document_version ||
    document.status === "draft"
  )
    return null;
  return { row: token, workspace, project, document };
}

router.get("/client/:token", async (req, res) => {
  const client = requireClient(req, res);
  if (!client) return;
  if (!rateLimit(req, "client-read", 120))
    return sendError(res, 429, "Too many requests", "RATE_LIMITED");
  try {
    const context = await loadPublicContext(client.hash);
    if (!context)
      return sendError(
        res,
        404,
        "Review link not found",
        "CLIENT_LINK_NOT_FOUND"
      );
    res.json(publicReview(context.project, context.document));
  } catch {
    sendError(res, 404, "Review link not found", "CLIENT_LINK_NOT_FOUND");
  }
});

router.post("/client/:token/accept", async (req, res) => {
  const client = requireClient(req, res);
  if (!client) return;
  const input = parsedBody(acceptanceSchema, req.body);
  if (!input)
    return sendError(
      res,
      400,
      "Explicit acceptance and version are required",
      "INVALID_INPUT"
    );
  if (!rateLimit(req, "client-accept", 20))
    return sendError(res, 429, "Too many requests", "RATE_LIMITED");
  try {
    const result = await withTokenLock(
      client.hash,
      async (_connection, _row, workspace, token) => {
        const project = projectById(workspace, token.project_id);
        const document = documentFromProject(project, token.document_id);
        if (
          input.version !== token.document_version ||
          input.version !== document.version
        )
          throw new Error("VERSION_MISMATCH");
        if (document.status === "paid" || document.status === "payment_pending")
          throw new Error("DOCUMENT_LOCKED");
        if (document.status === "accepted")
          return { value: publicReview(project, document), workspace };
        if (document.status !== "published")
          throw new Error("DOCUMENT_NOT_PUBLISHED");
        const accepted = {
          ...document,
          status: "accepted" as const,
          acceptedAt: document.acceptedAt || now(),
        };
        const nextProject = {
          ...project,
          quote: project.quote.id === document.id ? accepted : project.quote,
          changes: project.changes.map(item =>
            item.id === document.id ? accepted : item
          ),
          audit: [
            ...project.audit,
            audit(
              "document_accepted",
              `Client explicitly accepted published ${document.kind} version ${document.version}`
            ),
          ],
        };
        return {
          value: publicReview(nextProject, accepted),
          workspace: {
            ...workspace,
            projects: workspace.projects.map(item =>
              item.id === project.id ? nextProject : item
            ),
          },
        };
      }
    );
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "VERSION_MISMATCH")
      return sendError(
        res,
        409,
        "This review link is for a different published version",
        "VERSION_MISMATCH"
      );
    if (message === "DOCUMENT_LOCKED")
      return sendError(
        res,
        409,
        "This document can no longer be accepted",
        "DOCUMENT_LOCKED"
      );
    if (message === "DOCUMENT_NOT_PUBLISHED")
      return sendError(
        res,
        409,
        "Document is not available for acceptance",
        "DOCUMENT_NOT_PUBLISHED"
      );
    sendError(res, 404, "Review link not found", "CLIENT_LINK_NOT_FOUND");
  }
});

router.post(
  "/projects/:projectId/documents/:documentId/orders/reissue",
  async (req, res) => {
    const owner = requireOwner(req, res);
    if (!owner) return;
    const input = parsedBody(recoverySchema, req.body);
    if (!input)
      return sendError(
        res,
        400,
        "Positive version and confirmedNoPayment are required",
        "INVALID_INPUT"
      );
    if (!paypalConfigured())
      return sendError(
        res,
        503,
        "PayPal checkout is not configured",
        "PAYPAL_NOT_CONFIGURED"
      );
    if (!rateLimit(req, "owner-order-reissue", 5))
      return sendError(res, 429, "Too many recovery requests", "RATE_LIMITED");
    try {
      const row = await loadWorkspaceByTokenHash(owner.hash);
      if (!row)
        return sendError(
          res,
          401,
          "Workspace token is invalid",
          "WORKSPACE_TOKEN_INVALID"
        );
      const projectId = String(req.params.projectId);
      const documentId = String(req.params.documentId);
      const first = await withWorkspaceLock(
        row.id,
        async (connection, workspace) => {
          const project = projectById(workspace, projectId);
          const document = documentFromProject(project, documentId);
          if (document.version !== input.version)
            throw new Error("VERSION_MISMATCH");
          if (
            document.status !== "accepted" &&
            document.status !== "payment_pending"
          )
            throw new Error("PAYMENT_PENDING");
          if (document.paidAt || document.paypalCaptureId)
            throw new Error("PAYMENT_PENDING");
          const order = await findDocumentOrder(
            connection,
            row.id,
            document.id,
            document.version
          );
          if (!order) throw new Error("ORDER_NOT_FOUND");
          if (
            order.project_id !== project.id ||
            order.document_id !== document.id ||
            order.document_version !== document.version ||
            order.currency !== "USD" ||
            order.amount_cents !== document.totalCents ||
            order.capture_id ||
            order.status === "captured"
          )
            throw new Error("PAYMENT_MISMATCH");
          if (order.status !== "created") throw new Error("PAYMENT_PENDING");
          if (!order.paypal_order_id) throw new Error("ORDER_NOT_READY");
          return {
            value: {
              projectId: project.id,
              documentId: document.id,
              version: document.version,
              amountCents: document.totalCents,
              paypalOrderId: order.paypal_order_id,
              requestId: order.request_id,
              status: order.status,
            },
            workspace,
          };
        }
      );

      if (first.paypalOrderId) {
        let provider: Record<string, unknown>;
        try {
          provider = await getPaypalOrder(first.paypalOrderId);
        } catch (error) {
          if (
            !(error instanceof Error) ||
            error.message !== "PAYPAL_ORDER_NOT_FOUND"
          )
            throw error;
          provider = {};
        }
        if (Object.keys(provider).length > 0) {
          if (
            !paypalOrderMatches(provider, {
              amountCents: first.amountCents,
              reference: `${first.projectId}:${first.documentId}:${first.version}`,
              paypalOrderId: first.paypalOrderId,
            })
          )
            throw new Error("PAYMENT_MISMATCH");
          const state = paypalPaymentStatus(provider);
          if (state === "COMPLETED") throw new Error("PAYMENT_PENDING");
          if (
            state === "PENDING" ||
            state === "CREATED" ||
            state === "APPROVED"
          )
            throw new Error("PAYMENT_PENDING");
          if (state !== "VOIDED" && state !== "DENIED" && state !== "FAILED")
            throw new Error("PAYMENT_UNKNOWN");
        }
      }

      const requestId = newId();
      const clientToken = newCapability();
      const prepared = await withWorkspaceLock(
        row.id,
        async (connection, workspace) => {
          const project = projectById(workspace, projectId);
          const document = documentFromProject(project, documentId);
          const order = await findDocumentOrder(
            connection,
            row.id,
            documentId,
            input.version
          );
          if (
            document.version !== input.version ||
            (document.status !== "accepted" &&
              document.status !== "payment_pending") ||
            document.paidAt ||
            document.paypalCaptureId ||
            !order ||
            order.project_id !== projectId ||
            order.document_id !== documentId ||
            order.document_version !== input.version ||
            order.amount_cents !== document.totalCents ||
            document.totalCents !== first.amountCents ||
            order.currency !== "USD" ||
            order.capture_id ||
            order.status !== "created" ||
            order.request_id !== first.requestId ||
            order.paypal_order_id !== first.paypalOrderId
          )
            throw new Error("RECOVERY_CHANGED");
          await insertClientToken(
            connection,
            hashCapability(clientToken),
            row.id,
            projectId,
            documentId,
            input.version
          );
          await updateOrder(connection, order.id, {
            status: "creating",
            paypalOrderId: null,
            requestId,
          });
          const nextProject = {
            ...project,
            audit: [
              ...project.audit,
              audit(
                "sandbox_order_recovery_confirmed",
                `Owner attested no Sandbox payment completed before recovery for ${document.kind} version ${input.version}; no capture was performed`
              ),
            ],
          };
          return {
            value: { project: nextProject, orderId: order.id },
            workspace: {
              ...workspace,
              projects: workspace.projects.map(item =>
                item.id === project.id ? nextProject : item
              ),
            },
          };
        }
      );
      const created = await createPaypalOrder({
        amountCents: first.amountCents,
        localReference: `${projectId}:${documentId}:${input.version}`,
        requestId,
        returnUrl: `${publicOrigin()}/client/${clientToken}?paypal=return`,
        cancelUrl: `${publicOrigin()}/client/${clientToken}?paypal=cancel`,
      });
      const saved = await withWorkspaceLock(
        row.id,
        async (connection, workspace) => {
          const project = projectById(workspace, projectId);
          const document = documentFromProject(project, documentId);
          const order = await findDocumentOrder(
            connection,
            row.id,
            documentId,
            input.version
          );
          if (
            !order ||
            order.id !== prepared.orderId ||
            order.status !== "creating" ||
            order.request_id !== requestId ||
            document.version !== input.version ||
            document.totalCents !== first.amountCents
          )
            throw new Error("RECOVERY_CHANGED");
          await updateOrder(connection, order.id, {
            paypalOrderId: created.id,
            status: "created",
          });
          const nextDocument = { ...document, paypalOrderId: created.id };
          const nextProject = {
            ...project,
            quote:
              project.quote.id === document.id ? nextDocument : project.quote,
            changes: project.changes.map(item =>
              item.id === document.id ? nextDocument : item
            ),
          };
          return {
            value: nextProject,
            workspace: {
              ...workspace,
              projects: workspace.projects.map(item =>
                item.id === project.id ? nextProject : item
              ),
            },
          };
        }
      );
      res.status(201).json({
        project: ownerProject(saved, clientToken, documentId),
        approvalUrl: created.approvalUrl,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "VERSION_MISMATCH")
        return sendError(
          res,
          409,
          "This document version is no longer current",
          "VERSION_MISMATCH"
        );
      if (message === "RECOVERY_CHANGED")
        return sendError(
          res,
          409,
          "The order changed while recovery was running",
          "ORDER_PENDING"
        );
      const result = safeProviderStatus(error);
      sendError(res, result.status, result.message, result.code);
    }
  }
);

router.post("/client/:token/orders", async (req, res) => {
  const client = requireClient(req, res);
  if (!client) return;
  const input = parsedBody(orderSchema, req.body);
  if (!input)
    return sendError(
      res,
      400,
      "Published version is required",
      "INVALID_INPUT"
    );
  if (!paypalConfigured())
    return sendError(
      res,
      503,
      "PayPal checkout is not configured",
      "PAYPAL_NOT_CONFIGURED"
    );
  if (!rateLimit(req, "client-order", 10))
    return sendError(res, 429, "Too many checkout requests", "RATE_LIMITED");
  let order: {
    localId: string;
    paypalOrderId: string | null;
    requestId: string;
    approvalUrl: string | null;
    amountCents: number;
    projectId: string;
    documentId: string;
    version: number;
  };
  try {
    order = await withTokenLock(
      client.hash,
      async (connection, _row, workspace, token) => {
        const project = projectById(workspace, token.project_id);
        const document = documentFromProject(project, token.document_id);
        if (
          input.version !== document.version ||
          input.version !== token.document_version
        )
          throw new Error("VERSION_MISMATCH");
        if (
          document.status !== "accepted" &&
          document.status !== "payment_pending"
        )
          throw new Error("ACCEPTANCE_REQUIRED");
        const existing = await findDocumentOrder(
          connection,
          token.workspace_id,
          document.id,
          document.version
        );
        if (existing) {
          if (
            existing.project_id !== project.id ||
            existing.document_id !== document.id ||
            existing.document_version !== document.version ||
            existing.currency !== "USD" ||
            existing.amount_cents !== document.totalCents
          )
            throw new Error("PAYMENT_MISMATCH");
          if (existing.capture_id || existing.status === "captured")
            throw new Error("PAYMENT_PENDING");
          if (existing.status !== "creating" && existing.status !== "created")
            throw new Error(
              existing.status === "pending"
                ? "PAYMENT_PENDING"
                : "ORDER_NOT_READY"
            );
          return {
            value: {
              localId: existing.id,
              paypalOrderId: existing.paypal_order_id,
              requestId: existing.request_id,
              approvalUrl: null,
              amountCents: existing.amount_cents,
              projectId: existing.project_id,
              documentId: existing.document_id,
              version: existing.document_version,
            },
            workspace,
          };
        }
        const localId = newId();
        const requestId = newId();
        await connection.execute(
          "INSERT INTO scopepay_orders (id, workspace_id, project_id, document_id, document_version, amount_cents, currency, paypal_order_id, request_id, capture_id, status) VALUES (?, ?, ?, ?, ?, ?, 'USD', NULL, ?, NULL, 'creating')",
          [
            localId,
            token.workspace_id,
            project.id,
            document.id,
            document.version,
            document.totalCents,
            requestId,
          ]
        );
        const nextProject = {
          ...project,
          audit: [
            ...project.audit,
            audit(
              "order_created",
              `PayPal sandbox order prepared for accepted USD ${(document.totalCents / 100).toFixed(2)}`
            ),
          ],
        };
        return {
          value: {
            localId,
            paypalOrderId: null,
            requestId,
            approvalUrl: null,
            amountCents: document.totalCents,
            projectId: project.id,
            documentId: document.id,
            version: document.version,
          },
          workspace: {
            ...workspace,
            projects: workspace.projects.map(item =>
              item.id === project.id ? nextProject : item
            ),
          },
        };
      }
    );
    if (order.paypalOrderId) {
      const savedPayload = await getPaypalOrder(order.paypalOrderId);
      if (
        !paypalOrderMatches(savedPayload, {
          amountCents: order.amountCents,
          reference: `${order.projectId}:${order.documentId}:${order.version}`,
          paypalOrderId: order.paypalOrderId,
        })
      )
        throw new Error("PAYMENT_MISMATCH");
      const savedStatus = paypalPaymentStatus(savedPayload);
      if (savedStatus !== "CREATED" && savedStatus !== "APPROVED")
        throw new Error(
          savedStatus === "PENDING" ? "PAYMENT_PENDING" : "ORDER_NOT_READY"
        );
      order.approvalUrl = extractApprovalUrl(savedPayload);
    } else {
      // A concurrent request may observe the creating lease. Reusing its
      // persisted request_id is intentional: PayPal idempotency prevents two
      // provider orders while the first request is uncertain.
      const created = await createPaypalOrder({
        amountCents: order.amountCents,
        localReference: `${order.projectId}:${order.documentId}:${order.version}`,
        requestId: order.requestId,
        returnUrl: `${publicOrigin()}/client/${client.token}?paypal=return`,
        cancelUrl: `${publicOrigin()}/client/${client.token}?paypal=cancel`,
      });
      await withTokenLock(
        client.hash,
        async (connection, _row, workspace, token) => {
          const saved = await findOrder(
            connection,
            token.workspace_id,
            order.localId
          );
          if (
            !saved ||
            saved.project_id !== order.projectId ||
            saved.document_id !== order.documentId ||
            saved.document_version !== order.version ||
            saved.amount_cents !== order.amountCents ||
            saved.currency !== "USD"
          )
            throw new Error("ORDER_NOT_FOUND");
          if (saved.paypal_order_id && saved.paypal_order_id !== created.id)
            throw new Error("ORDER_NOT_READY");
          await updateOrder(connection, saved.id, {
            paypalOrderId: created.id,
            status: "created",
          });
          const project = projectById(workspace, token.project_id);
          const document = documentFromProject(project, token.document_id);
          const nextDocument = {
            ...document,
            paypalOrderId: created.id,
          };
          const nextProject = {
            ...project,
            quote:
              project.quote.id === document.id ? nextDocument : project.quote,
            changes: project.changes.map(item =>
              item.id === document.id ? nextDocument : item
            ),
          };
          return {
            value: undefined,
            workspace: {
              ...workspace,
              projects: workspace.projects.map(item =>
                item.id === project.id ? nextProject : item
              ),
            },
          };
        }
      );
      order.paypalOrderId = created.id;
      order.approvalUrl = created.approvalUrl;
    }
    res.status(201).json({
      id: order.paypalOrderId || order.localId,
      approvalUrl: order.approvalUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "VERSION_MISMATCH")
      return sendError(
        res,
        409,
        "This review version is no longer current",
        "VERSION_MISMATCH"
      );
    if (message === "ACCEPTANCE_REQUIRED")
      return sendError(
        res,
        409,
        "Client acceptance is required before checkout",
        "ACCEPTANCE_REQUIRED"
      );
    const result = safeProviderStatus(error);
    sendError(res, result.status, result.message, result.code);
  }
});

async function finalizeCapture(
  clientHash: string,
  orderId: string,
  expectedPaypalOrderId: string,
  capture: { captureId: string }
): Promise<{
  status: "paid";
  orderId: string;
  captureId: string;
  amountCents: number;
  currency: "USD";
}> {
  return withTokenLock(
    clientHash,
    async (connection, _row, workspace, token) => {
      const order = await findOrder(connection, token.workspace_id, orderId);
      if (
        !order ||
        order.project_id !== token.project_id ||
        order.document_id !== token.document_id ||
        order.document_version !== token.document_version
      )
        throw new Error("ORDER_NOT_FOUND");
      if (order.paypal_order_id !== expectedPaypalOrderId)
        throw new Error("ORDER_SUPERSEDED");
      const project = projectById(workspace, token.project_id);
      const document = documentFromProject(project, token.document_id);
      if (
        document.version !== order.document_version ||
        document.totalCents !== order.amount_cents ||
        order.currency !== "USD"
      )
        throw new Error("PAYMENT_MISMATCH");
      if (order.status === "captured") {
        if (!order.capture_id) throw new Error("PAYMENT_MISMATCH");
        return {
          value: {
            status: "paid",
            orderId: expectedPaypalOrderId,
            captureId: order.capture_id,
            amountCents: order.amount_cents,
            currency: "USD" as const,
          },
          workspace,
        };
      }
      const paid = {
        ...document,
        status: "paid" as const,
        paidAt: document.paidAt || now(),
        paypalOrderId: expectedPaypalOrderId,
        paypalCaptureId: capture.captureId,
      };
      const nextProject = {
        ...project,
        quote: project.quote.id === document.id ? paid : project.quote,
        changes: project.changes.map(item =>
          item.id === document.id ? paid : item
        ),
        audit: [
          ...project.audit,
          audit(
            "payment_captured",
            `Verified completed PayPal sandbox capture for USD ${(order.amount_cents / 100).toFixed(2)}`
          ),
        ],
      };
      await updateOrder(connection, order.id, {
        status: "captured",
        captureId: capture.captureId,
      });
      return {
        value: {
          status: "paid",
          orderId: expectedPaypalOrderId,
          captureId: capture.captureId,
          amountCents: order.amount_cents,
          currency: "USD" as const,
        },
        workspace: {
          ...workspace,
          projects: workspace.projects.map(item =>
            item.id === project.id ? nextProject : item
          ),
        },
      };
    }
  );
}

// Compare-and-set every payment transition against the exact provider order.
// The capturing state blocks owner reissue while a provider request is in flight.
async function transitionPaymentState(
  clientHash: string,
  orderId: string,
  expectedPaypalOrderId: string,
  orderStatus: "pending" | "capturing",
  allowCapturing = false
): Promise<void> {
  await withTokenLock(
    clientHash,
    async (connection, _row, workspace, token) => {
      const order = await findOrder(connection, token.workspace_id, orderId);
      if (
        !order ||
        order.project_id !== token.project_id ||
        order.document_id !== token.document_id ||
        order.document_version !== token.document_version
      )
        throw new Error("ORDER_NOT_FOUND");
      if (order.paypal_order_id !== expectedPaypalOrderId)
        throw new Error("ORDER_SUPERSEDED");
      if (order.status === "capturing" && !allowCapturing) {
        const ageMs = Date.now() - new Date(order.updated_at).getTime();
        const recent = !Number.isFinite(ageMs) || ageMs < 120_000;
        if (orderStatus !== "capturing" || recent)
          throw new Error("CAPTURE_IN_PROGRESS");
      }
      if (order.status === "captured") {
        if (!order.capture_id) throw new Error("PAYMENT_MISMATCH");
        return { value: undefined, workspace };
      }
      const project = projectById(workspace, token.project_id);
      const document = documentFromProject(project, token.document_id);
      if (
        document.version !== order.document_version ||
        document.totalCents !== order.amount_cents ||
        order.currency !== "USD"
      )
        throw new Error("PAYMENT_MISMATCH");
      const nextDocument =
        document.status === "accepted"
          ? { ...document, status: "payment_pending" as const }
          : document;
      const nextProject = {
        ...project,
        quote: project.quote.id === document.id ? nextDocument : project.quote,
        changes: project.changes.map(item =>
          item.id === document.id ? nextDocument : item
        ),
        audit:
          document.status === "accepted"
            ? [
                ...project.audit,
                audit(
                  "payment_pending",
                  "PayPal capture needs verification; payment remains recoverable"
                ),
              ]
            : project.audit,
      };
      await updateOrder(connection, order.id, { status: orderStatus });
      return {
        value: undefined,
        workspace: {
          ...workspace,
          projects: workspace.projects.map(item =>
            item.id === project.id ? nextProject : item
          ),
        },
      };
    }
  );
}

async function markPaymentPending(
  clientHash: string,
  orderId: string,
  expectedPaypalOrderId: string,
  allowCapturing = false
): Promise<void> {
  return transitionPaymentState(
    clientHash,
    orderId,
    expectedPaypalOrderId,
    "pending",
    allowCapturing
  );
}

async function markPaymentCapturing(
  clientHash: string,
  orderId: string,
  expectedPaypalOrderId: string
): Promise<void> {
  return transitionPaymentState(
    clientHash,
    orderId,
    expectedPaypalOrderId,
    "capturing"
  );
}

async function resetPaymentAttempt(
  clientHash: string,
  orderId: string,
  expectedPaypalOrderId: string,
  allowCapturing = false
): Promise<void> {
  await withTokenLock(
    clientHash,
    async (connection, _row, workspace, token) => {
      const order = await findOrder(connection, token.workspace_id, orderId);
      if (
        !order ||
        order.project_id !== token.project_id ||
        order.document_id !== token.document_id ||
        order.document_version !== token.document_version
      )
        throw new Error("ORDER_NOT_FOUND");
      if (order.paypal_order_id !== expectedPaypalOrderId)
        throw new Error("ORDER_SUPERSEDED");
      if (order.status === "capturing" && !allowCapturing) {
        const ageMs = Date.now() - new Date(order.updated_at).getTime();
        if (!Number.isFinite(ageMs) || ageMs < 120_000)
          throw new Error("CAPTURE_IN_PROGRESS");
      }
      if (order.status === "captured") {
        if (!order.capture_id) throw new Error("PAYMENT_MISMATCH");
        return { value: undefined, workspace };
      }
      const project = projectById(workspace, token.project_id);
      const document = documentFromProject(project, token.document_id);
      if (
        document.version !== order.document_version ||
        document.totalCents !== order.amount_cents ||
        order.currency !== "USD"
      )
        throw new Error("PAYMENT_MISMATCH");
      const nextDocument =
        document.status === "payment_pending"
          ? { ...document, status: "accepted" as const }
          : document;
      const nextProject = {
        ...project,
        quote: project.quote.id === document.id ? nextDocument : project.quote,
        changes: project.changes.map(item =>
          item.id === document.id ? nextDocument : item
        ),
        audit: [
          ...project.audit,
          audit(
            "payment_retryable",
            "PayPal has no completed or pending capture; the accepted order can be retried"
          ),
        ],
      };
      await updateOrder(connection, order.id, { status: "created" });
      return {
        value: undefined,
        workspace: {
          ...workspace,
          projects: workspace.projects.map(item =>
            item.id === project.id ? nextProject : item
          ),
        },
      };
    }
  );
}

function paymentStatusError(status: ReturnType<typeof paypalPaymentStatus>): {
  message: string;
  code: string;
} {
  if (status === "PENDING")
    return {
      message:
        "Payment is pending verification; use Verify payment before retrying",
      code: "PAYMENT_PENDING",
    };
  if (status === "VOIDED" || status === "DENIED" || status === "FAILED")
    return {
      message:
        "PayPal has no completed capture; the accepted order is ready to retry",
      code: "PAYMENT_RETRY",
    };
  if (status === "APPROVED")
    return {
      message:
        "Payment approval was received but capture status is uncertain; verify payment before retrying",
      code: "PAYMENT_UNKNOWN",
    };
  if (status === "CREATED")
    return {
      message: "PayPal approval is still required before capture",
      code: "PAYMENT_PENDING",
    };
  return {
    message: "Payment status is unknown; verify payment before retrying",
    code: "PAYMENT_UNKNOWN",
  };
}

router.post("/client/:token/orders/:orderId/capture", async (req, res) => {
  const trace = createPaymentTrace(req, res);
  trace.info("capture.route_enter", {
    hasOrderId: Boolean(req.params.orderId),
  });
  const client = requireClient(req, res);
  if (!client) {
    trace.warn("capture.client_rejected", { httpStatus: res.statusCode });
    return;
  }
  if (!paypalConfigured()) {
    trace.warn("capture.not_configured", {
      errorCode: "PAYPAL_NOT_CONFIGURED",
    });
    return sendError(
      res,
      503,
      "PayPal checkout is not configured",
      "PAYPAL_NOT_CONFIGURED"
    );
  }
  if (!rateLimit(req, "client-capture", 10)) {
    trace.warn("capture.rate_limited", { errorCode: "RATE_LIMITED" });
    return sendError(res, 429, "Too many capture requests", "RATE_LIMITED");
  }
  let pending: {
    paypalOrderId: string;
    amountCents: number;
    reference: string;
    localId: string;
    captureId?: string;
    alreadyCaptured?: boolean;
  } | null = null;
  let captureClaimed = false;
  try {
    trace.info("capture.order_lookup");
    pending = await withTokenLock(
      client.hash,
      async (connection, _row, workspace, token) => {
        const order = await findOrder(
          connection,
          token.workspace_id,
          String(req.params.orderId)
        );
        if (
          !order ||
          order.project_id !== token.project_id ||
          order.document_id !== token.document_id ||
          order.document_version !== token.document_version
        )
          throw new Error("ORDER_NOT_FOUND");
        if (order.currency !== "USD") throw new Error("PAYMENT_MISMATCH");
        trace.info("capture.order_loaded", {
          version: order.document_version,
          amountCents: order.amount_cents,
          currency: order.currency,
          hasOrderId: Boolean(order.paypal_order_id),
          alreadyCaptured:
            order.status === "captured" && Boolean(order.capture_id),
        });
        if (order.status === "captured" && order.capture_id)
          return {
            value: {
              paypalOrderId: order.paypal_order_id || order.id,
              amountCents: order.amount_cents,
              reference: `${order.project_id}:${order.document_id}:${order.document_version}`,
              localId: order.id,
              captureId: order.capture_id,
              alreadyCaptured: true,
            },
            workspace,
          } as never;
        if (!order.paypal_order_id) throw new Error("ORDER_NOT_READY");
        const project = projectById(workspace, token.project_id);
        const document = documentFromProject(project, token.document_id);
        if (
          document.version !== order.document_version ||
          document.totalCents !== order.amount_cents
        )
          throw new Error("PAYMENT_MISMATCH");
        if (
          document.status !== "accepted" &&
          document.status !== "payment_pending"
        )
          throw new Error("ACCEPTANCE_REQUIRED");
        return {
          value: {
            paypalOrderId: order.paypal_order_id,
            amountCents: order.amount_cents,
            reference: `${order.project_id}:${order.document_id}:${order.document_version}`,
            localId: order.id,
            alreadyCaptured: false,
          },
          workspace,
        } as never;
      }
    );
    if (!pending) throw new Error("ORDER_NOT_FOUND");
    if (pending.alreadyCaptured) {
      trace.info("capture.already_recorded", { captureVerified: true });
      return res.json({
        status: "paid",
        orderId: pending.paypalOrderId,
        captureId: pending.captureId || "already-captured",
        amountCents: pending.amountCents,
        currency: "USD" as const,
      });
    }

    // Always inspect the provider before a retry. This makes repeated clicks
    // safe and avoids issuing a second capture after an uncertain timeout.
    trace.info("capture.provider_lookup");
    const before = await getPaypalOrder(pending.paypalOrderId);
    if (
      !paypalOrderMatches(before, {
        paypalOrderId: pending.paypalOrderId,
        amountCents: pending.amountCents,
        reference: pending.reference,
      })
    )
      throw new Error("PAYMENT_MISMATCH");
    const beforeStatus = recoveryStatus(before);
    trace.info("capture.provider_before", {
      providerStatus: paypalPaymentStatus(before),
      recoveryStatus: beforeStatus,
    });
    if (beforeStatus === "completed") {
      const completed = completedCapture(before, {
        amountCents: pending.amountCents,
        reference: pending.reference,
        paypalOrderId: pending.paypalOrderId,
      });
      if (!completed) throw new Error("PAYMENT_MISMATCH");
      trace.info("capture.before_verified", { captureVerified: true });
      await markPaymentCapturing(
        client.hash,
        pending.localId,
        pending.paypalOrderId
      );
      captureClaimed = true;
      trace.info("capture.mark_inflight");
      trace.info("capture.finalize_start");
      const result = await finalizeCapture(
        client.hash,
        pending.localId,
        pending.paypalOrderId,
        completed
      );
      trace.info("capture.finalize_complete", { captureVerified: true });
      return res.json(result);
    }
    if (beforeStatus === "pending") {
      trace.warn("capture.provider_pending", { providerStatus: "PENDING" });
      await markPaymentPending(
        client.hash,
        pending.localId,
        pending.paypalOrderId,
        captureClaimed
      );
      const result = paymentStatusError(paypalPaymentStatus(before));
      return sendError(res, 409, result.message, result.code);
    }
    if (beforeStatus === "retryable") {
      trace.warn("capture.provider_retryable", {
        providerStatus: paypalPaymentStatus(before),
      });
      await resetPaymentAttempt(
        client.hash,
        pending.localId,
        pending.paypalOrderId,
        captureClaimed
      );
      const result = paymentStatusError(paypalPaymentStatus(before));
      return sendError(res, 409, result.message, result.code);
    }
    if (paypalPaymentStatus(before) !== "APPROVED") {
      trace.warn("capture.approval_required", {
        providerStatus: paypalPaymentStatus(before),
      });
      if (paypalPaymentStatus(before) === "CREATED")
        await resetPaymentAttempt(
          client.hash,
          pending.localId,
          pending.paypalOrderId,
          captureClaimed
        );
      else
        await markPaymentPending(
          client.hash,
          pending.localId,
          pending.paypalOrderId,
          captureClaimed
        );
      const result = paymentStatusError(paypalPaymentStatus(before));
      return sendError(res, 409, result.message, result.code);
    }

    await markPaymentCapturing(
      client.hash,
      pending.localId,
      pending.paypalOrderId
    );
    captureClaimed = true;
    trace.info("capture.mark_inflight");
    trace.info("capture.provider_request");
    const payload = await capturePaypalOrder(pending.paypalOrderId);
    const completed = completedCapture(payload, {
      amountCents: pending.amountCents,
      reference: pending.reference,
      paypalOrderId: pending.paypalOrderId,
    });
    trace.info("capture.provider_response", {
      providerStatus: paypalPaymentStatus(payload),
      captureVerified: Boolean(completed),
    });
    if (completed) {
      trace.info("capture.finalize_start");
      const result = await finalizeCapture(
        client.hash,
        pending.localId,
        pending.paypalOrderId,
        completed
      );
      trace.info("capture.finalize_complete", { captureVerified: true });
      return res.json(result);
    }
    trace.warn("capture.verify_failed", { captureVerified: false });
    const result = paymentStatusError(paypalPaymentStatus(payload));
    if (result.code === "PAYMENT_RETRY")
      await resetPaymentAttempt(
        client.hash,
        pending.localId,
        pending.paypalOrderId,
        captureClaimed
      );
    else
      await markPaymentPending(
        client.hash,
        pending.localId,
        pending.paypalOrderId,
        captureClaimed
      );
    return sendError(res, 409, result.message, result.code);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    trace.error("capture.failed", { errorCode: safePaymentErrorCode(error) });
    if (message === "ORDER_SUPERSEDED")
      return sendError(
        res,
        409,
        "The Sandbox order changed during checkout. Refresh the same review and verify PayPal Activity before taking another payment action.",
        "ORDER_SUPERSEDED"
      );
    if (message === "CAPTURE_IN_PROGRESS")
      return sendError(
        res,
        409,
        "A PayPal capture is still being processed. Wait briefly and retry the same order; do not create another.",
        "ORDER_PENDING"
      );
    if (message === "ORDER_NOT_FOUND")
      return sendError(res, 404, "Order not found", "ORDER_NOT_FOUND");
    if (message === "ORDER_NOT_READY")
      return sendError(
        res,
        409,
        "Order is still being created; retry shortly",
        "ORDER_PENDING"
      );
    if (message === "ACCEPTANCE_REQUIRED")
      return sendError(
        res,
        409,
        "Client acceptance is required before capture",
        "ACCEPTANCE_REQUIRED"
      );
    if (message === "PAYMENT_MISMATCH")
      return sendError(
        res,
        409,
        "Payment verification did not match the stored order",
        "PAYMENT_MISMATCH"
      );
    if (message === "PAYPAL_ORDER_NOT_FOUND") {
      try {
        if (pending)
          await markPaymentPending(
            client.hash,
            pending.localId,
            pending.paypalOrderId,
            captureClaimed
          );
      } catch {
        /* Preserve the safe missing-order response if state preservation fails. */
      }
      return sendError(
        res,
        404,
        "PayPal order not found",
        "PAYPAL_ORDER_NOT_FOUND"
      );
    }
    if (pending) {
      // A timeout or provider rejection is not proof of failure. Reconcile
      // first; only a conclusive no-capture state resets the accepted order.
      try {
        trace.info("capture.reconcile_start");
        const reconciled = await getPaypalOrder(pending.paypalOrderId);
        const status = recoveryStatus(reconciled);
        trace.info("capture.reconcile_result", {
          providerStatus: paypalPaymentStatus(reconciled),
          recoveryStatus: status,
        });
        if (status === "completed") {
          const completed = completedCapture(reconciled, {
            amountCents: pending.amountCents,
            reference: pending.reference,
            paypalOrderId: pending.paypalOrderId,
          });
          if (!completed)
            return sendError(
              res,
              409,
              "Payment verification did not match the stored order",
              "PAYMENT_MISMATCH"
            );
          if (!captureClaimed) {
            await markPaymentCapturing(
              client.hash,
              pending.localId,
              pending.paypalOrderId
            );
            captureClaimed = true;
            trace.info("capture.mark_inflight");
          }
          trace.info("capture.finalize_start");
          const result = await finalizeCapture(
            client.hash,
            pending.localId,
            pending.paypalOrderId,
            completed
          );
          trace.info("capture.finalize_complete", { captureVerified: true });
          return res.json(result);
        }
        if (
          status === "retryable" ||
          paypalPaymentStatus(reconciled) === "CREATED"
        ) {
          await resetPaymentAttempt(
            client.hash,
            pending.localId,
            pending.paypalOrderId,
            captureClaimed
          );
          return sendError(
            res,
            409,
            "PayPal has no completed or pending capture; retry the accepted order",
            "PAYMENT_RETRY"
          );
        }
        await markPaymentPending(
          client.hash,
          pending.localId,
          pending.paypalOrderId,
          captureClaimed
        );
        return sendError(
          res,
          503,
          "Payment status is uncertain; verify payment before retrying",
          "PAYMENT_UNKNOWN"
        );
      } catch (reconcileError) {
        trace.error("capture.reconcile_failed", {
          errorCode: safePaymentErrorCode(reconcileError),
        });
        try {
          await markPaymentPending(
            client.hash,
            pending.localId,
            pending.paypalOrderId,
            captureClaimed
          );
        } catch (pendingError) {
          trace.error("capture.preserve_pending_failed", {
            errorCode: safePaymentErrorCode(pendingError),
          });
          /* preserve the original provider uncertainty */
        }
        return sendError(
          res,
          503,
          "Payment status is uncertain; verify payment before retrying",
          "PAYMENT_UNKNOWN"
        );
      }
    }
    const result = safeProviderStatus(error);
    sendError(res, result.status, result.message, result.code);
  }
});

router.get("/client/:token/orders/:orderId", async (req, res) => {
  const client = requireClient(req, res);
  if (!client) return;
  if (!rateLimit(req, "client-reconcile", 60))
    return sendError(res, 429, "Too many requests", "RATE_LIMITED");
  try {
    const context = await loadPublicContext(client.hash);
    if (!context)
      return sendError(
        res,
        404,
        "Review link not found",
        "CLIENT_LINK_NOT_FOUND"
      );
    const pool = getScopePayPool();
    const connection = await pool.getConnection();
    let order;
    try {
      order = await findOrder(
        connection,
        context.row!.workspace_id,
        String(req.params.orderId)
      );
    } finally {
      connection.release();
    }
    if (
      !order ||
      order.project_id !== context.project.id ||
      order.document_id !== context.document.id ||
      order.document_version !== context.document.version
    )
      return sendError(res, 404, "Order not found", "ORDER_NOT_FOUND");
    if (
      order.amount_cents !== context.document.totalCents ||
      order.currency !== "USD"
    )
      return sendError(
        res,
        409,
        "Order does not match this accepted scope",
        "PAYMENT_MISMATCH"
      );
    if (order.status === "capturing")
      return sendError(
        res,
        409,
        "A PayPal capture is still being processed. Retry this same order shortly; do not create another.",
        "ORDER_PENDING"
      );
    if (
      order.status !== "captured" &&
      order.paypal_order_id &&
      paypalConfigured()
    ) {
      try {
        const payload = await getPaypalOrder(order.paypal_order_id);
        const expected = {
          amountCents: order.amount_cents,
          reference: `${order.project_id}:${order.document_id}:${order.document_version}`,
          paypalOrderId: order.paypal_order_id,
        };
        const completed = completedCapture(payload, expected);
        if (completed) {
          await markPaymentCapturing(
            client.hash,
            order.id,
            order.paypal_order_id
          );
          await finalizeCapture(
            client.hash,
            order.id,
            order.paypal_order_id,
            completed
          );
          const fresh = await loadPublicContext(client.hash);
          if (fresh)
            return res.json(publicReview(fresh.project, fresh.document));
        }
        if (!paypalOrderMatches(payload, expected))
          return sendError(
            res,
            409,
            "PayPal order does not match the accepted scope",
            "PAYMENT_MISMATCH"
          );
        const status = recoveryStatus(payload);
        if (status === "pending")
          await markPaymentPending(
            client.hash,
            order.id,
            order.paypal_order_id
          );
        else if (
          status === "retryable" ||
          paypalPaymentStatus(payload) === "CREATED"
        )
          await resetPaymentAttempt(
            client.hash,
            order.id,
            order.paypal_order_id
          );
      } catch (error) {
        const result = safeProviderStatus(error);
        return sendError(res, result.status, result.message, result.code);
      }
    }
    const fresh = await loadPublicContext(client.hash);
    if (!fresh)
      return sendError(
        res,
        404,
        "Review link not found",
        "CLIENT_LINK_NOT_FOUND"
      );
    res.json(publicReview(fresh.project, fresh.document));
  } catch {
    sendError(
      res,
      503,
      "Payment status is temporarily unavailable",
      "PAYMENT_UNAVAILABLE"
    );
  }
});

export function registerScopePayRoutes(app: {
  use: (path: string, handler: typeof router) => unknown;
}): void {
  app.use("/api/scopepay", router);
}
export default router;
