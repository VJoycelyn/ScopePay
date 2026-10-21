export type DocumentStatus =
  | "draft"
  | "published"
  | "accepted"
  | "payment_pending"
  | "paid";
export type Classification = "included" | "out_of_scope" | "unclear";
export interface Deliverable {
  id: string;
  title: string;
  description: string;
  hours: number;
  priceCents: number;
}
export interface ScopeDocument {
  id: string;
  kind: "quote" | "change";
  title: string;
  scopeSummary: string;
  deliverables: Deliverable[];
  exclusions: string[];
  timeline: string;
  revisionLimit: string;
  currency: "USD";
  totalCents: number;
  status: DocumentStatus;
  version: number;
  clientToken?: string;
  analysisId?: string;
  acceptedAt?: string;
  paidAt?: string;
  paypalOrderId?: string;
  paypalCaptureId?: string;
  createdAt: string;
  source: "live_ai" | "sample" | "manual";
}
export interface AnalysisItem {
  requestItem: string;
  classification: Classification;
  evidence: string;
  suggestedHours: number;
}
export interface ChangeAnalysis {
  id: string;
  request: string;
  verdict: Classification;
  summary: string;
  items: AnalysisItem[];
  suggestedReply: string;
  suggestedDeliverables: Array<{
    title: string;
    description: string;
    hours: number;
  }>;
  totalSuggestedHours: number;
  model: string;
  generatedAt: string;
  source: "live_ai";
  scopeDocumentId: string;
  scopeVersion: number;
  scopeFingerprint: string;
  scopeStatus: DocumentStatus;
}
export interface AuditEvent {
  id: string;
  type: string;
  message: string;
  at: string;
}
export interface ScopeProject {
  id: string;
  name: string;
  clientName: string;
  brief: string;
  hourlyRateCents: number;
  budgetCents: number | null;
  quote: ScopeDocument;
  changes: ScopeDocument[];
  analyses: ChangeAnalysis[];
  audit: AuditEvent[];
  createdAt: string;
  isSample: boolean;
  aiModel?: string;
}
export interface Workspace {
  projects: ScopeProject[];
}
export interface ServiceStatus {
  aiConfigured: boolean;
  paypalConfigured: boolean;
  databaseConfigured: boolean;
  paypalClientId: string | null;
  aiModel: string;
  environment: "sandbox";
}
export interface CreateProjectInput {
  name: string;
  clientName: string;
  brief: string;
  hourlyRateCents: number;
  budgetCents: number | null;
}
export interface EditDocumentInput {
  title: string;
  scopeSummary: string;
  deliverables: Deliverable[];
  exclusions: string[];
  timeline: string;
  revisionLimit: string;
}
export interface ClientReview {
  projectName: string;
  clientName: string;
  document: ScopeDocument;
  sandbox: true;
  merchantNotice: string;
}
export interface PaymentResult {
  status: "paid";
  orderId: string;
  captureId: string;
  amountCents: number;
  currency: "USD";
}

/* REST contract — all responses JSON, errors {error:string,code?:string}; workspace routes require X-Workspace-Token.
GET /api/scopepay/status -> ServiceStatus
POST /api/scopepay/workspaces -> {token:string,workspace:Workspace}
GET /api/scopepay/workspace -> Workspace (owner response strips clientToken)
POST /api/scopepay/projects body CreateProjectInput -> ScopeProject (live AI)
POST /api/scopepay/projects/sample -> ScopeProject (fictional, explicitly source=sample)
PATCH /api/scopepay/projects/:projectId/documents/:documentId body EditDocumentInput -> ScopeProject
POST /api/scopepay/projects/:projectId/documents/:documentId/publish -> ScopeProject (fresh raw client token is returned once for the published target document)
POST /api/scopepay/projects/:projectId/documents/:documentId/share -> ScopeProject (owner-only; fresh raw client token is returned once on this response for the target non-draft document; prior links are revoked)
POST /api/scopepay/projects/:projectId/analyze body {request:string} -> {project:ScopeProject,analysis:ChangeAnalysis} (analysis binds the exact quote document/version/fingerprint)
POST /api/scopepay/projects/:projectId/changes body {analysisId:string} -> ScopeProject (stale/unbound analyses rejected; same analysisId is idempotent)
GET /api/scopepay/client/:token -> ClientReview (published document only, no owner token, draft or audit data)
POST /api/scopepay/client/:token/accept body {version:number,accepted:true} -> ClientReview
POST /api/scopepay/client/:token/orders body {version:number} -> {id:string}
POST /api/scopepay/client/:token/orders/:orderId/capture -> PaymentResult
GET /api/scopepay/client/:token/orders/:orderId -> ClientReview (reconcile PayPal state, safe status recovery)
Documents cannot be edited after acceptance/payment begins. Published edits revert to draft and revoke old client tokens.
Server-calculated totalCents must equal sum of deliverable.priceCents. AI never invokes payment endpoints.
*/
