import crypto from "node:crypto";
import type { Request, Response } from "express";

const TRACE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ERROR_CODES = new Set([
  "ORDER_NOT_FOUND",
  "ORDER_SUPERSEDED",
  "CAPTURE_IN_PROGRESS",
  "ORDER_NOT_READY",
  "ORDER_PENDING",
  "ACCEPTANCE_REQUIRED",
  "PAYMENT_MISMATCH",
  "PAYMENT_PENDING",
  "PAYMENT_UNKNOWN",
  "PAYMENT_RETRY",
  "PAYPAL_NOT_CONFIGURED",
  "PAYPAL_ORDER_NOT_FOUND",
  "PAYPAL_PROVIDER_REJECTED",
  "PAYPAL_UNAVAILABLE",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
  "VERSION_MISMATCH",
  "CLIENT_LINK_NOT_FOUND",
  "UNKNOWN_ERROR",
]);
const PROVIDER_STATUSES = new Set([
  "COMPLETED",
  "PENDING",
  "APPROVED",
  "CREATED",
  "VOIDED",
  "DENIED",
  "FAILED",
  "UNKNOWN",
]);
const DOCUMENT_STATUSES = new Set([
  "draft",
  "published",
  "accepted",
  "payment_pending",
  "paid",
]);
const RECOVERY_STATUSES = new Set([
  "completed",
  "pending",
  "retryable",
  "unknown",
]);

export type PaymentTraceStage =
  | "capture.route_enter"
  | "capture.client_rejected"
  | "capture.not_configured"
  | "capture.rate_limited"
  | "capture.order_lookup"
  | "capture.order_loaded"
  | "capture.already_recorded"
  | "capture.provider_lookup"
  | "capture.provider_before"
  | "capture.before_verified"
  | "capture.mark_inflight"
  | "capture.provider_pending"
  | "capture.provider_retryable"
  | "capture.approval_required"
  | "capture.mark_pending"
  | "capture.provider_request"
  | "capture.provider_response"
  | "capture.verify_failed"
  | "capture.finalize_start"
  | "capture.finalize_complete"
  | "capture.failed"
  | "capture.reconcile_start"
  | "capture.reconcile_result"
  | "capture.reconcile_failed"
  | "capture.preserve_pending_failed"
  | "capture.response_sent"
  | "capture.response_aborted";

export type PaymentTraceDetails = {
  amountCents?: number;
  version?: number;
  currency?: string;
  hasOrderId?: boolean;
  alreadyCaptured?: boolean;
  captureVerified?: boolean;
  providerStatus?: string;
  documentStatus?: string;
  recoveryStatus?: string;
  errorCode?: string;
  httpStatus?: number;
};

export function validPaymentTraceId(value: unknown): string {
  return typeof value === "string" && TRACE_ID_PATTERN.test(value)
    ? value.toLowerCase()
    : crypto.randomUUID();
}

export function safePaymentErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return ERROR_CODES.has(message) ? message : "UNKNOWN_ERROR";
}

export function safePaymentTraceDetails(
  details: PaymentTraceDetails
): Record<string, unknown> {
  // Build from known keys, never spread caller objects or serialize raw errors.
  const result: Record<string, unknown> = {};
  if (Number.isSafeInteger(details.amountCents) && details.amountCents! >= 0)
    result.amountCents = details.amountCents;
  if (Number.isSafeInteger(details.version) && details.version! > 0)
    result.version = details.version;
  if (details.currency === "USD") result.currency = "USD";
  for (const key of [
    "hasOrderId",
    "alreadyCaptured",
    "captureVerified",
  ] as const)
    if (typeof details[key] === "boolean") result[key] = details[key];
  if (details.providerStatus && PROVIDER_STATUSES.has(details.providerStatus))
    result.providerStatus = details.providerStatus;
  if (details.documentStatus && DOCUMENT_STATUSES.has(details.documentStatus))
    result.documentStatus = details.documentStatus;
  if (details.recoveryStatus && RECOVERY_STATUSES.has(details.recoveryStatus))
    result.recoveryStatus = details.recoveryStatus;
  if (details.errorCode)
    result.errorCode = ERROR_CODES.has(details.errorCode)
      ? details.errorCode
      : "UNKNOWN_ERROR";
  if (
    Number.isInteger(details.httpStatus) &&
    details.httpStatus! >= 100 &&
    details.httpStatus! <= 599
  )
    result.httpStatus = details.httpStatus;
  return result;
}

export function createPaymentTrace(req: Request, res: Response) {
  const traceId = validPaymentTraceId(req.header("x-scopepay-trace-id"));
  const started = Date.now();
  let previousStage: PaymentTraceStage | undefined;
  res.setHeader("X-ScopePay-Trace-Id", traceId);
  const log = (
    level: "info" | "warn" | "error",
    stage: PaymentTraceStage,
    details: PaymentTraceDetails = {}
  ) => {
    const event = {
      source: "server",
      environment: "sandbox",
      traceId,
      stage,
      previousStage,
      elapsedMs: Math.max(0, Date.now() - started),
      ...safePaymentTraceDetails(details),
    };
    previousStage = stage;
    try {
      console[level]("[ScopePay PayPal]", JSON.stringify(event));
    } catch {
      // Observability failures must not change payment state or outcome.
    }
  };
  res.once("finish", () =>
    log("info", "capture.response_sent", { httpStatus: res.statusCode })
  );
  res.once("close", () => {
    if (!res.writableFinished)
      log("warn", "capture.response_aborted", { httpStatus: res.statusCode });
  });
  return {
    traceId,
    info: (stage: PaymentTraceStage, details?: PaymentTraceDetails) =>
      log("info", stage, details),
    warn: (stage: PaymentTraceStage, details?: PaymentTraceDetails) =>
      log("warn", stage, details),
    error: (stage: PaymentTraceStage, details?: PaymentTraceDetails) =>
      log("error", stage, details),
  };
}
