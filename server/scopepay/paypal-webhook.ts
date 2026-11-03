import express, {
  type ErrorRequestHandler,
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import type { RowDataPacket } from "mysql2/promise";
import type { ScopeDocument, ScopeProject, Workspace } from "@shared/scopepay";
import {
  findOrder,
  getScopePayPool,
  newId,
  updateOrder,
  withWorkspaceLock,
} from "./db";
import {
  paypalConfigured,
  completedCapture,
  getPaypalOrder,
  paypalOrderMatches,
  verifyPaypalWebhookSignature,
} from "./paypal";

const WEBHOOK_PATH = "/api/scopepay/paypal/webhook";
const MAX_JSON_BYTES = "128kb";
const ORDER_ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,127})$/;
const CAPTURE_ID_PATTERN = /^[^\s]{1,256}$/;
const OFFICIAL_PAYPAL_CERT_HOSTS = new Set([
  "api-m.sandbox.paypal.com",
  "api.sandbox.paypal.com",
]);

type WebhookRequest = Request & { paypalWebhookRawBody?: string };

type ExistingOrderRow = RowDataPacket & {
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

type WebhookEvent = Record<string, unknown>;
type WebhookResource = Record<string, unknown>;

type WebhookHeaderValues = {
  authAlgo: string;
  certUrl: string;
  transmissionId: string;
  transmissionSig: string;
  transmissionTime: string;
};

class WebhookConflict extends Error {
  constructor() {
    super("WEBHOOK_CONFLICT");
  }
}

function responseError(
  res: Response,
  status: number,
  code:
    | "WEBHOOK_NOT_CONFIGURED"
    | "INVALID_JSON"
    | "INVALID_WEBHOOK"
    | "WEBHOOK_SIGNATURE_INVALID"
    | "WEBHOOK_VERIFICATION_UNAVAILABLE"
    | "WEBHOOK_CONFLICT"
    | "WEBHOOK_UNAVAILABLE"
): void {
  const messages: Record<typeof code, string> = {
    WEBHOOK_NOT_CONFIGURED: "PayPal webhook notifications are not configured",
    INVALID_JSON: "Invalid JSON body",
    INVALID_WEBHOOK: "Invalid PayPal webhook notification",
    WEBHOOK_SIGNATURE_INVALID: "PayPal webhook signature is invalid",
    WEBHOOK_VERIFICATION_UNAVAILABLE:
      "PayPal webhook verification is temporarily unavailable",
    WEBHOOK_CONFLICT: "PayPal webhook does not match the accepted payment",
    WEBHOOK_UNAVAILABLE: "PayPal webhook processing is temporarily unavailable",
  };
  res.status(status).json({ error: messages[code], code });
}

function configured(): boolean {
  return Boolean(process.env.PAYPAL_WEBHOOK_ID?.trim()) && paypalConfigured();
}

function boundedHeader(
  req: Request,
  name: string,
  maximum: number
): string | null {
  const value = req.get(name);
  if (!value || value.length > maximum || value.trim() !== value) return null;
  return value;
}

function validCertificateUrl(value: string): boolean {
  if (value.length > 2048) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      OFFICIAL_PAYPAL_CERT_HOSTS.has(url.hostname) &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.hash &&
      url.pathname.length > 0 &&
      url.pathname.length <= 1024
    );
  } catch {
    return false;
  }
}

function webhookHeaders(req: Request): WebhookHeaderValues | null {
  const values = {
    authAlgo: boundedHeader(req, "PAYPAL-AUTH-ALGO", 128),
    certUrl: boundedHeader(req, "PAYPAL-CERT-URL", 2048),
    transmissionId: boundedHeader(req, "PAYPAL-TRANSMISSION-ID", 256),
    transmissionSig: boundedHeader(req, "PAYPAL-TRANSMISSION-SIG", 4096),
    transmissionTime: boundedHeader(req, "PAYPAL-TRANSMISSION-TIME", 128),
  };
  if (
    !values.authAlgo ||
    !values.certUrl ||
    !values.transmissionId ||
    !values.transmissionSig ||
    !values.transmissionTime ||
    !validCertificateUrl(values.certUrl)
  )
    return null;
  return values as WebhookHeaderValues;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.length <= maximum
  );
}

function eventParts(body: unknown): {
  event: WebhookEvent;
  eventType: string;
  resource: WebhookResource;
} | null {
  if (!isRecord(body)) return null;
  const eventType =
    typeof body.event_type === "string" ? body.event_type : body.type;
  if (
    !boundedString(body.id, 256) ||
    !boundedString(eventType, 128) ||
    !isRecord(body.resource)
  )
    return null;
  return { event: body, eventType, resource: body.resource };
}

function amountCents(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{1,12}(?:\.\d{1,2})?$/.test(value))
    return null;
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(`${whole}${fraction.padEnd(2, "0")}`);
  return Number.isSafeInteger(cents) ? cents : null;
}

function providerOrderId(resource: WebhookResource): string | null {
  const supplementary = resource.supplementary_data;
  if (!isRecord(supplementary)) return null;
  const related = supplementary.related_ids;
  if (!isRecord(related)) return null;
  const orderId = related.order_id;
  return typeof orderId === "string" && ORDER_ID_PATTERN.test(orderId)
    ? orderId
    : null;
}

function eventCaptureId(resource: WebhookResource): string | null {
  const id = resource.id;
  return typeof id === "string" && CAPTURE_ID_PATTERN.test(id) ? id : null;
}

function eventAmountMatches(
  resource: WebhookResource,
  amount: number
): boolean {
  const eventAmount = resource.amount;
  if (!isRecord(eventAmount) || eventAmount.currency_code !== "USD")
    return false;
  return amountCents(eventAmount.value) === amount;
}

function documentFor(
  project: ScopeProject,
  documentId: string
): ScopeDocument | null {
  if (project.quote.id === documentId) return project.quote;
  return project.changes.find(item => item.id === documentId) ?? null;
}

function sameImmutableOrder(
  current: ExistingOrderRow,
  initial: ExistingOrderRow,
  providerId: string
): boolean {
  return (
    current.id === initial.id &&
    current.workspace_id === initial.workspace_id &&
    current.project_id === initial.project_id &&
    current.document_id === initial.document_id &&
    current.document_version === initial.document_version &&
    current.amount_cents === initial.amount_cents &&
    current.currency === initial.currency &&
    current.paypal_order_id === providerId &&
    initial.paypal_order_id === providerId
  );
}

function matchingProjectDocument(
  workspace: Workspace,
  order: ExistingOrderRow,
  providerId: string
): { project: ScopeProject; document: ScopeDocument } | null {
  const project = workspace.projects.find(item => item.id === order.project_id);
  if (!project) return null;
  const document = documentFor(project, order.document_id);
  if (!document) return null;
  if (
    project.id !== order.project_id ||
    document.id !== order.document_id ||
    document.version !== order.document_version ||
    document.totalCents !== order.amount_cents ||
    document.currency !== "USD" ||
    document.paypalOrderId !== providerId ||
    typeof document.acceptedAt !== "string" ||
    document.acceptedAt.length === 0
  )
    return null;
  return { project, document };
}

async function findExistingOrder(
  providerId: string
): Promise<ExistingOrderRow | null> {
  const [rows] = await getScopePayPool().execute<ExistingOrderRow[]>(
    "SELECT id, workspace_id, project_id, document_id, document_version, amount_cents, currency, paypal_order_id, request_id, capture_id, status FROM scopepay_orders WHERE paypal_order_id = ? LIMIT 1",
    [providerId]
  );
  return rows[0] ?? null;
}

async function processWebhook(
  existing: ExistingOrderRow,
  providerId: string,
  captureId: string,
  resource: WebhookResource
): Promise<"processed" | "ignored"> {
  if (existing.currency !== "USD") throw new WebhookConflict();
  const reference = `${existing.project_id}:${existing.document_id}:${existing.document_version}`;
  const providerPayload = await getPaypalOrder(providerId);
  if (
    !paypalOrderMatches(providerPayload, {
      amountCents: existing.amount_cents,
      reference,
      paypalOrderId: providerId,
    })
  )
    throw new WebhookConflict();
  const completed = completedCapture(providerPayload, {
    amountCents: existing.amount_cents,
    reference,
    paypalOrderId: providerId,
  });
  if (!completed || completed.captureId !== captureId)
    throw new WebhookConflict();
  if (!eventAmountMatches(resource, existing.amount_cents))
    throw new WebhookConflict();

  return withWorkspaceLock(
    existing.workspace_id,
    async (connection, workspace) => {
      const current = await findOrder(
        connection,
        existing.workspace_id,
        providerId
      );
      if (!current || !sameImmutableOrder(current, existing, providerId))
        throw new WebhookConflict();
      if (current.capture_id && current.capture_id !== captureId)
        throw new WebhookConflict();
      const matched = matchingProjectDocument(workspace, current, providerId);
      if (!matched) throw new WebhookConflict();
      const { project, document } = matched;

      const alreadyPaid =
        current.status === "captured" &&
        current.capture_id === captureId &&
        document.status === "paid" &&
        document.paypalCaptureId === captureId;
      if (alreadyPaid) return { value: "ignored", workspace };

      const documentCanBePaid =
        document.status === "accepted" || document.status === "payment_pending";
      if (
        (!documentCanBePaid &&
          !(
            document.status === "paid" &&
            document.paypalCaptureId === captureId &&
            current.capture_id === captureId
          )) ||
        document.paypalCaptureId
      )
        throw new WebhookConflict();

      const paid: ScopeDocument = {
        ...document,
        status: "paid",
        paidAt: document.paidAt || new Date().toISOString(),
        paypalOrderId: providerId,
        paypalCaptureId: captureId,
      };
      const nextProject: ScopeProject = {
        ...project,
        quote: project.quote.id === document.id ? paid : project.quote,
        changes: project.changes.map(item =>
          item.id === document.id ? paid : item
        ),
        audit: [
          ...project.audit,
          {
            id: newId(),
            type: "payment_captured",
            message: `Verified completed PayPal sandbox capture for USD ${(current.amount_cents / 100).toFixed(2)}`,
            at: new Date().toISOString(),
          },
        ],
      };
      await updateOrder(connection, current.id, {
        status: "captured",
        captureId,
      });
      return {
        value: "processed",
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

async function handleWebhook(req: Request, res: Response): Promise<void> {
  if (!configured()) {
    responseError(res, 503, "WEBHOOK_NOT_CONFIGURED");
    return;
  }
  const headers = webhookHeaders(req);
  const parts = eventParts(req.body);
  const eventJson = (req as WebhookRequest).paypalWebhookRawBody;
  if (!headers || !parts || !eventJson) {
    responseError(res, 400, "INVALID_WEBHOOK");
    return;
  }

  let verified: boolean;
  try {
    verified = await verifyPaypalWebhookSignature({
      authAlgo: headers.authAlgo,
      certUrl: headers.certUrl,
      transmissionId: headers.transmissionId,
      transmissionSig: headers.transmissionSig,
      transmissionTime: headers.transmissionTime,
      webhookId: process.env.PAYPAL_WEBHOOK_ID!.trim(),
      eventJson,
    });
  } catch {
    responseError(res, 503, "WEBHOOK_VERIFICATION_UNAVAILABLE");
    return;
  }
  if (!verified) {
    responseError(res, 400, "WEBHOOK_SIGNATURE_INVALID");
    return;
  }

  if (parts.eventType !== "PAYMENT.CAPTURE.COMPLETED") {
    res.status(200).json({ status: "ignored" });
    return;
  }

  const providerId = providerOrderId(parts.resource);
  const captureId = eventCaptureId(parts.resource);
  if (
    !providerId ||
    !captureId ||
    parts.resource.status !== "COMPLETED" ||
    !isRecord(parts.resource.amount) ||
    parts.resource.amount.currency_code !== "USD" ||
    amountCents(parts.resource.amount.value) === null
  ) {
    responseError(res, 400, "INVALID_WEBHOOK");
    return;
  }

  let existing: ExistingOrderRow | null;
  try {
    existing = await findExistingOrder(providerId);
  } catch {
    responseError(res, 503, "WEBHOOK_UNAVAILABLE");
    return;
  }
  if (!existing) {
    res.status(200).json({ status: "ignored" });
    return;
  }

  try {
    const result = await processWebhook(
      existing,
      providerId,
      captureId,
      parts.resource
    );
    res.status(200).json({ status: result });
    return;
  } catch (error) {
    if (error instanceof WebhookConflict) {
      responseError(res, 409, "WEBHOOK_CONFLICT");
      return;
    }
    responseError(res, 503, "WEBHOOK_UNAVAILABLE");
  }
}

const jsonParserError: ErrorRequestHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  const errorType =
    error && typeof error === "object"
      ? (error as { type?: string }).type
      : undefined;
  if (errorType === "entity.too.large")
    return responseError(res, 413, "INVALID_JSON");
  if (errorType === "entity.parse.failed" || error instanceof SyntaxError)
    return responseError(res, 400, "INVALID_JSON");
  return responseError(res, 503, "WEBHOOK_UNAVAILABLE");
};

export function registerPaypalWebhookRoutes(app: Express): void {
  app.post(
    WEBHOOK_PATH,
    (req: Request, res: Response, next: NextFunction) => {
      if (!configured()) {
        responseError(res, 503, "WEBHOOK_NOT_CONFIGURED");
        return;
      }
      next();
    },
    express.json({
      limit: MAX_JSON_BYTES,
      verify: (req, _res, buffer) => {
        (req as WebhookRequest).paypalWebhookRawBody = buffer.toString("utf8");
      },
    }),
    (req: Request, res: Response, next: NextFunction) => {
      void handleWebhook(req, res).catch(next);
    },
    jsonParserError
  );
}
