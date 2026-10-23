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

type ApiError = { error?: string; code?: string };

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

async function request<T>(
  path: string,
  init: RequestInit = {},
  owner = false
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  if (owner) {
    const token = getToken();
    if (token) headers.set("X-Workspace-Token", token);
  }

  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers,
    credentials: "same-origin",
  });
  const payload = (await response.json().catch(() => ({}))) as T & ApiError;
  if (!response.ok) {
    throw new ScopePayApiError(
      payload.error || `Request failed (${response.status})`,
      response.status,
      payload.code
    );
  }
  return payload as T;
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
  clientReview: (token: string) =>
    request<ClientReview>(`/client/${encodeURIComponent(token)}`),
  acceptClientDocument: (token: string, version: number) =>
    request<ClientReview>(`/client/${encodeURIComponent(token)}/accept`, {
      method: "POST",
      body: JSON.stringify({ version, accepted: true }),
    }),
  createOrder: (token: string, version: number) =>
    request<CreateOrderResult>(`/client/${encodeURIComponent(token)}/orders`, {
      method: "POST",
      body: JSON.stringify({ version }),
    }),
  reissueOrder: (projectId: string, documentId: string, version: number) =>
    request<ReissueOrderResult>(
      `/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}/orders/reissue`,
      {
        method: "POST",
        body: JSON.stringify({ version, confirmedNoPayment: true }),
      },
      true
    ),
  captureOrder: (token: string, orderId: string, traceId?: string) =>
    request<PaymentResult>(
      `/client/${encodeURIComponent(token)}/orders/${encodeURIComponent(orderId)}/capture`,
      {
        method: "POST",
        ...(traceId ? { headers: { "X-ScopePay-Trace-Id": traceId } } : {}),
      }
    ),
  reconcileOrder: (token: string, orderId: string) =>
    request<ClientReview>(
      `/client/${encodeURIComponent(token)}/orders/${encodeURIComponent(orderId)}`
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
