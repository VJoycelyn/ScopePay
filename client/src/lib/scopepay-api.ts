import type {
  ChangeAnalysis,
  ClientReview,
  CreateProjectInput,
  EditDocumentInput,
  PaymentResult,
  ScopeProject,
  ServiceStatus,
  Workspace,
} from "@shared/scopepay";

const API_ROOT = "/api/scopepay";
const TOKEN_KEY = "scopepay.workspace.token";
let sessionToken: string | null = null;

type JsonObject = Record<string, unknown>;
type ApiError = { error?: unknown; code?: unknown };
type RequestOptions = { capture?: boolean };

export type CreateOrderResult = {
  id: string;
  approvalUrl: string | null;
};

export type ReissueOrderResult = {
  project: ScopeProject;
  approvalUrl: string | null;
};

export class ScopePayApiError extends Error {
  code?: string;
  status: number;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ScopePayApiError";
    this.status = status;
    this.code = code;
  }
}

// Only codes intentionally emitted by the ScopePay backend cross the client
// boundary. An arbitrary response code could contain secrets or provider data.
const SAFE_BACKEND_CODES = new Set([
  "ACCEPTANCE_REQUIRED",
  "AI_EMPTY_OUTPUT",
  "AI_INVALID_OUTPUT",
  "AI_NOT_CONFIGURED",
  "AI_PROVIDER_REJECTED",
  "AI_UNAVAILABLE",
  "ANALYSIS_NOT_FOUND",
  "ANALYSIS_STALE",
  "ANALYSIS_UNBOUND",
  "CAPTURE_IN_PROGRESS",
  "CLIENT_LINK_NOT_FOUND",
  "CLIENT_TOKEN_NOT_FOUND",
  "DATABASE_NOT_CONFIGURED",
  "DATABASE_UNAVAILABLE",
  "DOCUMENT_DRAFT",
  "DOCUMENT_LOCKED",
  "DOCUMENT_NOT_DRAFT",
  "DOCUMENT_NOT_FOUND",
  "DOCUMENT_NOT_PUBLISHED",
  "INTERNAL_ERROR",
  "INVALID_INPUT",
  "INVALID_RESOURCE_ID",
  "INVALID_TOTAL",
  "NO_EXTRA_WORK",
  "NOT_FOUND",
  "ORDER_NOT_FOUND",
  "ORDER_NOT_READY",
  "ORDER_PENDING",
  "ORDER_SUPERSEDED",
  "PAYMENT_MISMATCH",
  "PAYMENT_PENDING",
  "PAYMENT_RETRY",
  "PAYMENT_UNAVAILABLE",
  "PAYMENT_UNKNOWN",
  "PAYPAL_NOT_CONFIGURED",
  "PAYPAL_ORDER_NOT_FOUND",
  "PAYPAL_PROVIDER_REJECTED",
  "PAYPAL_UNAVAILABLE",
  "PROJECT_NOT_FOUND",
  "RATE_LIMITED",
  "RECOVERY_CHANGED",
  "SCOPE_CHANGED",
  "VERSION_MISMATCH",
]);

const SAFE_ERROR_MESSAGES: Record<string, string> = {
  ACCEPTANCE_REQUIRED: "Client acceptance is required before payment.",
  CAPTURE_IN_PROGRESS:
    "A payment capture is still being processed. Verify payment before trying again.",
  ORDER_NOT_FOUND: "The payment order could not be found.",
  ORDER_NOT_READY: "The payment order is still being prepared.",
  ORDER_PENDING:
    "The payment order is still being processed. Verify payment before trying again.",
  ORDER_SUPERSEDED:
    "The payment order changed. Refresh the review and verify payment before trying again.",
  PAYMENT_MISMATCH: "Payment verification did not match the stored order.",
  PAYMENT_PENDING:
    "Payment is pending verification; verify payment before trying again.",
  PAYMENT_RETRY:
    "The payment was not completed; the accepted order can be tried again.",
  PAYMENT_UNKNOWN:
    "Payment status is unknown; verify payment before trying again.",
  PAYPAL_NOT_CONFIGURED: "PayPal checkout is not configured.",
  PAYPAL_ORDER_NOT_FOUND: "The PayPal order could not be found.",
  PAYPAL_PROVIDER_REJECTED: "PayPal could not complete the payment request.",
  SERVICE_UNAVAILABLE:
    "ScopePay's payment service is temporarily unavailable. Verify the saved order before retrying.",
  PAYPAL_UNAVAILABLE: "PayPal is temporarily unavailable.",
  RATE_LIMITED: "Too many payment requests. Please wait and try again.",
};

function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? sessionToken;
  } catch {
    return sessionToken;
  }
}

function setToken(token: string) {
  sessionToken = token;
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // A private browsing context can deny storage. The current session still works.
  }
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function safeBackendCode(value: unknown): string | undefined {
  return typeof value === "string" && SAFE_BACKEND_CODES.has(value)
    ? value
    : undefined;
}

function safeMessage(code: string): string {
  return (
    SAFE_ERROR_MESSAGES[code] ??
    "ScopePay could not complete the request. Please try again."
  );
}

function unknownPaymentError(status = 503): ScopePayApiError {
  return new ScopePayApiError(
    "Payment status is unknown; verify payment before trying again.",
    status,
    "PAYMENT_UNKNOWN"
  );
}

function invalidResponseError(
  status: number,
  capture: boolean
): ScopePayApiError {
  return capture
    ? unknownPaymentError(status)
    : [502, 503, 504].includes(status)
      ? new ScopePayApiError(
          "ScopePay's payment service is temporarily unavailable. Verify the saved order before retrying.",
          status,
          "SERVICE_UNAVAILABLE"
        )
      : new ScopePayApiError(
          "ScopePay returned an invalid response. Please try again.",
          status,
          "INVALID_RESPONSE"
        );
}

function hasJsonContentType(response: Response): boolean {
  const contentType = response.headers.get("content-type");
  return (
    !contentType ||
    contentType.toLowerCase().includes("application/json") ||
    contentType.toLowerCase().includes("+json")
  );
}

async function readJsonResponse(
  response: Response,
  capture: boolean
): Promise<JsonObject> {
  if (!hasJsonContentType(response))
    throw invalidResponseError(response.status, capture);
  let text: string;
  try {
    text = await response.text();
  } catch {
    throw invalidResponseError(response.status, capture);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw invalidResponseError(response.status, capture);
  }
  if (!isJsonObject(parsed))
    throw invalidResponseError(response.status, capture);
  return parsed;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  owner = false,
  options: RequestOptions = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  if (owner) {
    const token = getToken();
    if (token) headers.set("X-Workspace-Token", token);
  }

  let response: Response;
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      ...init,
      headers,
      credentials: "same-origin",
    });
  } catch {
    if (options.capture) throw unknownPaymentError();
    throw new ScopePayApiError(
      "ScopePay could not be reached. Please try again.",
      503,
      "NETWORK_ERROR"
    );
  }

  let payload: JsonObject;
  try {
    payload = await readJsonResponse(response, Boolean(options.capture));
  } catch (error) {
    if (error instanceof ScopePayApiError) throw error;
    throw invalidResponseError(response.status, Boolean(options.capture));
  }

  if (!response.ok) {
    const code =
      safeBackendCode((payload as ApiError).code) ??
      (options.capture
        ? "PAYMENT_UNKNOWN"
        : [502, 503, 504].includes(response.status)
          ? "SERVICE_UNAVAILABLE"
          : "API_ERROR");
    throw new ScopePayApiError(safeMessage(code), response.status, code);
  }
  return payload as T;
}

function validateApprovalUrl(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isScopeProject(value: unknown): value is JsonObject {
  return (
    isJsonObject(value) &&
    nonEmptyString(value.id) &&
    typeof value.name === "string" &&
    typeof value.clientName === "string" &&
    typeof value.brief === "string" &&
    Number.isSafeInteger(value.hourlyRateCents) &&
    (value.budgetCents === null || Number.isSafeInteger(value.budgetCents)) &&
    isJsonObject(value.quote) &&
    Array.isArray(value.changes) &&
    Array.isArray(value.analyses) &&
    Array.isArray(value.audit) &&
    nonEmptyString(value.createdAt) &&
    typeof value.isSample === "boolean"
  );
}

function validateCreateOrderResult(value: unknown): CreateOrderResult {
  if (
    !isJsonObject(value) ||
    !nonEmptyString(value.id) ||
    !validateApprovalUrl(value.approvalUrl)
  )
    throw invalidResponseError(200, false);
  return { id: value.id, approvalUrl: value.approvalUrl };
}

function validateReissueOrderResult(value: unknown): ReissueOrderResult {
  if (
    !isJsonObject(value) ||
    !isScopeProject(value.project) ||
    !validateApprovalUrl(value.approvalUrl)
  )
    throw invalidResponseError(200, false);
  return {
    project: value.project as unknown as ScopeProject,
    approvalUrl: value.approvalUrl,
  };
}

function validatePaymentResult(value: unknown): PaymentResult {
  if (
    !isJsonObject(value) ||
    value.status !== "paid" ||
    !nonEmptyString(value.orderId) ||
    !nonEmptyString(value.captureId) ||
    !Number.isSafeInteger(value.amountCents) ||
    (value.amountCents as number) < 0 ||
    value.currency !== "USD"
  )
    throw invalidResponseError(200, true);
  return value as unknown as PaymentResult;
}

function validateClientReview(value: unknown): ClientReview {
  if (!isJsonObject(value) || !isJsonObject(value.document))
    throw invalidResponseError(200, false);
  const doc = value.document;
  if (
    typeof value.projectName !== "string" ||
    typeof value.clientName !== "string" ||
    value.sandbox !== true ||
    !nonEmptyString(doc.id) ||
    !Number.isSafeInteger(doc.version) ||
    (doc.version as number) < 1 ||
    !Number.isSafeInteger(doc.totalCents) ||
    (doc.totalCents as number) < 0 ||
    doc.currency !== "USD" ||
    !["published", "accepted", "payment_pending", "paid"].includes(
      String(doc.status)
    ) ||
    !Array.isArray(doc.deliverables) ||
    !Array.isArray(doc.exclusions)
  )
    throw invalidResponseError(200, false);
  if (
    doc.status === "paid" &&
    (!nonEmptyString(doc.paypalOrderId) || !nonEmptyString(doc.paypalCaptureId))
  )
    throw unknownPaymentError();
  return value as unknown as ClientReview;
}

export const scopepayApi = {
  status: () => request<ServiceStatus>("/status"),
  async createWorkspace() {
    const result = await request<{ token: string; workspace: Workspace }>(
      "/workspaces",
      { method: "POST" }
    );
    setToken(result.token);
    return result.workspace;
  },
  async ensureWorkspace() {
    try {
      if (getToken()) return await request<Workspace>("/workspace", {}, true);
    } catch (error) {
      if (
        !(error instanceof ScopePayApiError) ||
        (error.status !== 401 && error.status !== 403 && error.status !== 404)
      )
        throw error;
      sessionToken = null;
      try {
        localStorage.removeItem(TOKEN_KEY);
      } catch {
        /* no-op */
      }
    }
    return this.createWorkspace();
  },
  workspace: () => request<Workspace>("/workspace", {}, true),
  createProject: (input: CreateProjectInput) =>
    request<ScopeProject>(
      "/projects",
      { method: "POST", body: JSON.stringify(input) },
      true
    ),
  loadSampleProject: () =>
    request<ScopeProject>("/projects/sample", { method: "POST" }, true),
  editDocument: (
    projectId: string,
    documentId: string,
    input: EditDocumentInput
  ) =>
    request<ScopeProject>(
      `/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
      true
    ),
  publishDocument: (projectId: string, documentId: string) =>
    request<ScopeProject>(
      `/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}/publish`,
      {
        method: "POST",
      },
      true
    ),
  reissueShareLink: (projectId: string, documentId: string) =>
    request<ScopeProject>(
      `/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}/share`,
      {
        method: "POST",
      },
      true
    ),
  analyze: (projectId: string, requestText: string) =>
    request<{ project: ScopeProject; analysis: ChangeAnalysis }>(
      `/projects/${encodeURIComponent(projectId)}/analyze`,
      {
        method: "POST",
        body: JSON.stringify({ request: requestText }),
      },
      true
    ),
  createChangeOrder: (projectId: string, analysisId: string) =>
    request<ScopeProject>(
      `/projects/${encodeURIComponent(projectId)}/changes`,
      {
        method: "POST",
        body: JSON.stringify({ analysisId }),
      },
      true
    ),
  clientReview: async (token: string) =>
    validateClientReview(
      await request<unknown>(`/client/${encodeURIComponent(token)}`)
    ),
  acceptClientDocument: async (token: string, version: number) =>
    validateClientReview(
      await request<unknown>(`/client/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        body: JSON.stringify({ version, accepted: true }),
      })
    ),
  async createOrder(
    token: string,
    version: number
  ): Promise<CreateOrderResult> {
    const result = await request<unknown>(
      `/client/${encodeURIComponent(token)}/orders`,
      {
        method: "POST",
        body: JSON.stringify({ version }),
      }
    );
    return validateCreateOrderResult(result);
  },
  async reissueOrder(
    projectId: string,
    documentId: string,
    version: number
  ): Promise<ReissueOrderResult> {
    const result = await request<unknown>(
      `/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}/orders/reissue`,
      {
        method: "POST",
        body: JSON.stringify({ version, confirmedNoPayment: true }),
      },
      true
    );
    return validateReissueOrderResult(result);
  },
  async captureOrder(
    token: string,
    orderId: string,
    traceId?: string
  ): Promise<PaymentResult> {
    const result = await request<unknown>(
      `/client/${encodeURIComponent(token)}/orders/${encodeURIComponent(orderId)}/capture`,
      {
        method: "POST",
        ...(traceId ? { headers: { "X-ScopePay-Trace-Id": traceId } } : {}),
      },
      false,
      { capture: true }
    );
    // The server accepts either a local order id or provider id in the path,
    // then deliberately returns the PayPal provider id. Do not compare the
    // response orderId with the requested path id here.
    return validatePaymentResult(result);
  },
  reconcileOrder: async (token: string, orderId: string) =>
    validateClientReview(
      await request<unknown>(
        `/client/${encodeURIComponent(token)}/orders/${encodeURIComponent(orderId)}`
      )
    ),
  clearWorkspaceToken: () => {
    sessionToken = null;
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* no-op */
    }
  },
};
