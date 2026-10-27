import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  CreditCard,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import type {
  ClientReview,
  PaymentResult,
  ServiceStatus,
} from "@shared/scopepay";
import { ScopePayApiError, scopepayApi } from "../../lib/scopepay-api";
import { safeSandboxApprovalUrl } from "../../lib/paypal-safety";
import { errorMessage, formatMoney } from "./shared";
import { SandboxRecoveryGuide } from "./SandboxRecoveryGuide";

const PAYPAL_LOG_PREFIX = "[ScopePay PayPal]";
const SAFE_API_CODES = new Set([
  "PAYPAL_ORDER_NOT_FOUND",
  "ORDER_NOT_FOUND",
  "CAPTURE_IN_PROGRESS",
  "CLIENT_LINK_NOT_FOUND",
  "CLIENT_TOKEN_NOT_FOUND",
  "ORDER_SUPERSEDED",
  "ORDER_PENDING",
  "PAYMENT_PENDING",
  "PAYMENT_UNKNOWN",
  "PAYMENT_RETRY",
  "PAYMENT_MISMATCH",
  "PAYPAL_PROVIDER_REJECTED",
  "PAYPAL_NOT_CONFIGURED",
  "PAYPAL_UNAVAILABLE",
  "RATE_LIMITED",
  "ACCEPTANCE_REQUIRED",
  "INTERNAL_ERROR",
  "VERSION_MISMATCH",
]);
const SAFE_HTTP_STATUSES = new Set([
  400, 401, 403, 404, 409, 422, 429, 500, 502, 503, 504,
]);
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createTraceId(): string {
  try {
    if (typeof globalThis.crypto?.randomUUID === "function") {
      const traceId = globalThis.crypto.randomUUID();
      if (UUID_V4_PATTERN.test(traceId)) return traceId;
    }
  } catch {
    // Fall through to the UUID v4 getRandomValues implementation.
  }
  try {
    if (typeof globalThis.crypto?.getRandomValues === "function") {
      const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0"));
      return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
        .slice(6, 8)
        .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
    }
  } catch {
    // Logging must never affect checkout when browser crypto is unavailable.
  }
  return "00000000-0000-4000-8000-000000000000";
}

function nowMs(): number {
  try {
    return typeof performance !== "undefined" &&
      typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  } catch {
    return 0;
  }
}

function elapsedMs(startedAt: number): number {
  try {
    return Math.max(0, Math.round(nowMs() - startedAt));
  } catch {
    return 0;
  }
}

function errorDiagnostics(error: unknown): {
  errorType:
    | "TypeError"
    | "AbortError"
    | "ScopePayApiError"
    | "Error"
    | "UnknownError";
  errorCode: string;
  httpStatus: number | null;
} {
  try {
    if (error instanceof ScopePayApiError) {
      return {
        errorType: "ScopePayApiError",
        errorCode:
          typeof error.code === "string" && SAFE_API_CODES.has(error.code)
            ? error.code
            : "UNKNOWN_ERROR",
        httpStatus: SAFE_HTTP_STATUSES.has(error.status) ? error.status : null,
      };
    }
    if (error instanceof TypeError)
      return {
        errorType: "TypeError",
        errorCode: "UNKNOWN_ERROR",
        httpStatus: null,
      };
    if (
      (typeof DOMException !== "undefined" &&
        error instanceof DOMException &&
        error.name === "AbortError") ||
      (error instanceof Error && error.name === "AbortError")
    )
      return {
        errorType: "AbortError",
        errorCode: "UNKNOWN_ERROR",
        httpStatus: null,
      };
    if (error instanceof Error)
      return {
        errorType: "Error",
        errorCode: "UNKNOWN_ERROR",
        httpStatus: null,
      };
  } catch {
    // Return the safest diagnostic if an unusual error object cannot be inspected.
  }
  return {
    errorType: "UnknownError",
    errorCode: "UNKNOWN_ERROR",
    httpStatus: null,
  };
}

function logPayPal(
  level: "info" | "warn" | "error",
  stage: string,
  fields: Record<string, unknown>
): void {
  try {
    const payload = JSON.stringify({
      source: "browser",
      environment: "sandbox",
      stage,
      ...fields,
    });
    if (level === "error") console.error(PAYPAL_LOG_PREFIX, payload);
    else if (level === "warn") console.warn(PAYPAL_LOG_PREFIX, payload);
    else console.info(PAYPAL_LOG_PREFIX, payload);
  } catch {
    // Console and serialization failures must never change the payment result.
  }
}

function errorCode(error: unknown): string | undefined {
  return error instanceof ScopePayApiError ? error.code : undefined;
}

function isUnavailableClientLinkCode(code?: string): boolean {
  return code === "CLIENT_LINK_NOT_FOUND" || code === "CLIENT_TOKEN_NOT_FOUND";
}

declare global {
  interface Window {
    paypal?: {
      Buttons: (options: {
        style?: Record<string, unknown>;
        createOrder: () => Promise<string>;
        onApprove: (data: { orderID: string }) => Promise<void>;
        onCancel: () => void;
        onError: (error: unknown) => void;
      }) => {
        render: (container: HTMLElement) => Promise<void>;
        close?: () => Promise<void>;
      };
    };
  }
}

export function PayPalCheckout({
  token,
  review,
  status,
  onReview,
  externalError,
}: {
  token: string;
  review: ClientReview;
  status: ServiceStatus | null;
  onReview: (review: ClientReview) => void;
  externalError?: { message: string; code?: string } | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState("");
  const [paymentState, setPaymentState] = useState<
    "idle" | "creating" | "capturing" | "recovering" | "paid" | "error"
  >("idle");
  const [paymentError, setPaymentError] = useState(
    externalError?.message ?? ""
  );
  const [paymentErrorCode, setPaymentErrorCode] = useState<string | undefined>(
    externalError?.code
  );
  const [recoveryNotice, setRecoveryNotice] = useState("");
  const [reviewLinkUnavailable, setReviewLinkUnavailable] = useState(
    isUnavailableClientLinkCode(externalError?.code)
  );
  const [orderId, setOrderId] = useState(review.document.paypalOrderId ?? "");
  const [approvalUrl, setApprovalUrl] = useState<string | null>(null);
  const paymentErrorRef = useRef("");
  const orderIdRef = useRef(orderId);
  const verifiedPaidRef = useRef(review.document.status === "paid");
  const recoveryCheckRef = useRef(false);
  const sdkGenerationRef = useRef(0);
  const reviewLinkUnavailableRef = useRef(
    isUnavailableClientLinkCode(externalError?.code)
  );
  const orderUnavailable =
    paymentErrorCode === "PAYPAL_ORDER_NOT_FOUND" ||
    paymentErrorCode === "ORDER_NOT_FOUND";

  useEffect(() => {
    if (review.document.paypalOrderId)
      setOrderId(review.document.paypalOrderId);
  }, [review.document.paypalOrderId]);

  useEffect(() => {
    orderIdRef.current = orderId;
  }, [orderId]);

  useEffect(() => {
    if (review.document.status === "paid") verifiedPaidRef.current = true;
  }, [review.document.status]);

  // A missing-order error on the direct PayPal return must gate SDK checkout
  // too, rather than remaining a disconnected notice above working buttons.
  useEffect(() => {
    if (!externalError || verifiedPaidRef.current) return;
    if (
      isUnavailableClientLinkCode(externalError.code) ||
      externalError.code === "PAYPAL_ORDER_NOT_FOUND" ||
      externalError.code === "ORDER_NOT_FOUND"
    )
      sdkGenerationRef.current += 1;
    if (isUnavailableClientLinkCode(externalError.code)) {
      reviewLinkUnavailableRef.current = true;
      setReviewLinkUnavailable(true);
    }
    paymentErrorRef.current = externalError.message;
    setPaymentError(externalError.message);
    setPaymentErrorCode(externalError.code);
    setPaymentState("error");
  }, [externalError?.message, externalError?.code]);

  useEffect(() => {
    if (
      !status?.paypalConfigured ||
      !status.paypalClientId ||
      reviewLinkUnavailable ||
      review.document.status !== "accepted"
    )
      return;
    const script = document.createElement("script");
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(status.paypalClientId)}&currency=USD&intent=capture`;
    script.async = true;
    script.onload = () => {
      if (window.paypal?.Buttons) setSdkReady(true);
      else
        setSdkError(
          "PayPal checkout loaded without its button API. You can still prepare a direct Sandbox link below."
        );
    };
    script.onerror = () =>
      setSdkError(
        "PayPal checkout could not load. You can still prepare a direct Sandbox link below, or ask the workspace owner to verify Sandbox setup."
      );
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
  }, [
    status?.paypalClientId,
    status?.paypalConfigured,
    review.document.status,
    reviewLinkUnavailable,
  ]);

  const clearPaymentError = () => {
    paymentErrorRef.current = "";
    setPaymentError("");
    setPaymentErrorCode(undefined);
  };

  const showPaymentError = (message: string, code?: string) => {
    if (code === "PAYPAL_ORDER_NOT_FOUND" || code === "ORDER_NOT_FOUND")
      sdkGenerationRef.current += 1;
    if (isUnavailableClientLinkCode(code)) {
      sdkGenerationRef.current += 1;
      reviewLinkUnavailableRef.current = true;
      setReviewLinkUnavailable(true);
    }
    paymentErrorRef.current = message;
    setPaymentError(message);
    setPaymentErrorCode(code);
  };

  const dismissPaymentError = () => {
    paymentErrorRef.current = "";
    setPaymentError("");
    // Dismissing text does not remove a server-verified missing-order gate.
  };

  const prepareOrder = async (isCurrent: () => boolean = () => true) => {
    if (
      !isCurrent() ||
      verifiedPaidRef.current ||
      reviewLinkUnavailableRef.current
    )
      return null;
    setPaymentState("creating");
    clearPaymentError();
    setApprovalUrl(null);
    try {
      const result = await scopepayApi.createOrder(
        token,
        review.document.version
      );
      if (!isCurrent() || verifiedPaidRef.current) return null;
      setOrderId(result.id);
      orderIdRef.current = result.id;
      const safeUrl = safeSandboxApprovalUrl(result.approvalUrl);
      setApprovalUrl(safeUrl);
      if (!safeUrl)
        showPaymentError(
          "The server prepared the PayPal order but did not return a usable approval link. Try the PayPal button or ask the workspace owner to verify Sandbox setup."
        );
      setPaymentState("idle");
      return result;
    } catch (error) {
      if (!isCurrent() || verifiedPaidRef.current) return null;
      setPaymentState("error");
      showPaymentError(errorMessage(error), errorCode(error));
      return null;
    }
  };

  const applyPaidResult = (result: PaymentResult): void => {
    verifiedPaidRef.current = true;
    setOrderId(result.orderId);
    onReview({
      ...review,
      document: {
        ...review.document,
        status: "paid",
        paidAt: review.document.paidAt || new Date().toISOString(),
        paypalOrderId: result.orderId,
        paypalCaptureId: result.captureId,
      },
    });
    setPaymentState("paid");
  };

  const capture = async (
    id: string,
    traceId = createTraceId(),
    isCurrent: () => boolean = () => true
  ): Promise<{ success: boolean; error?: unknown }> => {
    if (
      !isCurrent() ||
      verifiedPaidRef.current ||
      reviewLinkUnavailableRef.current
    )
      return { success: false };
    const startedAt = nowMs();
    const captureFields = {
      traceId,
      scopeVersion: review.document.version,
      amountCents: review.document.totalCents,
      currency: review.document.currency,
      orderIdPresent: Boolean(id),
    };
    setPaymentState("capturing");
    clearPaymentError();
    logPayPal("info", "capture.request", {
      ...captureFields,
      elapsedMs: elapsedMs(startedAt),
    });
    try {
      const result = await scopepayApi.captureOrder(token, id, traceId);
      if (!isCurrent()) return { success: false };
      if (
        result.amountCents !== review.document.totalCents ||
        result.currency !== review.document.currency
      )
        throw new ScopePayApiError(
          "Payment did not match the accepted amount.",
          409,
          "PAYMENT_MISMATCH"
        );
      logPayPal("info", "capture.response", {
        ...captureFields,
        success: result.status === "paid",
        resultStatus: result.status === "paid" ? "paid" : "UNKNOWN_RESULT",
        elapsedMs: elapsedMs(startedAt),
      });
      applyPaidResult(result);
      logPayPal("info", "capture.ui_updated", {
        ...captureFields,
        success: true,
        elapsedMs: elapsedMs(startedAt),
      });
      return { success: true };
    } catch (error) {
      if (!isCurrent() || verifiedPaidRef.current) return { success: false };
      setPaymentState("error");
      showPaymentError(errorMessage(error), errorCode(error));
      logPayPal("error", "capture.failed", {
        ...captureFields,
        success: false,
        elapsedMs: elapsedMs(startedAt),
        ...errorDiagnostics(error),
      });
      return { success: false, error };
    }
  };

  const verify = async () => {
    if (reviewLinkUnavailableRef.current) return;
    if (!orderId) {
      showPaymentError(
        "No saved PayPal order is available yet. Ask the workspace owner to check PayPal Sandbox Activity and use Payments panel recovery."
      );
      return;
    }
    setPaymentState("recovering");
    clearPaymentError();
    try {
      const latest = await scopepayApi.reconcileOrder(token, orderId);
      if (latest.document.status === "paid") verifiedPaidRef.current = true;
      onReview(latest);
      setPaymentState(latest.document.status === "paid" ? "paid" : "error");
      if (latest.document.status !== "paid")
        showPaymentError(
          "Payment is not confirmed yet. The server remains authoritative; do not create a replacement while this order is pending."
        );
    } catch (error) {
      setPaymentState("error");
      showPaymentError(errorMessage(error), errorCode(error));
    }
  };

  const checkOwnerRecovery = async () => {
    if (reviewLinkUnavailableRef.current) return;
    if (recoveryCheckRef.current) return;
    recoveryCheckRef.current = true;
    setPaymentState("recovering");
    setRecoveryNotice("");
    // Keep the known missing-order gate while these GETs run or fail.
    const unavailableCode = paymentErrorCode;
    try {
      let latest = await scopepayApi.clientReview(token);
      const expected = review.document;
      const sameTerms = (next: ClientReview) =>
        next.document.id === expected.id &&
        next.document.version === expected.version &&
        next.document.totalCents === expected.totalCents &&
        next.document.currency === expected.currency;
      if (!sameTerms(latest)) {
        setRecoveryNotice(
          "This review's terms changed. Stop and review the owner's latest document; checkout has not been unlocked."
        );
        setPaymentState("error");
        return;
      }
      const nextOrderId = latest.document.paypalOrderId;
      if (latest.document.status !== "paid") {
        if (!nextOrderId || nextOrderId === orderIdRef.current) {
          setRecoveryNotice(
            "No fresh owner-recovered order is available on this review yet. Ask the owner to complete the steps below. Do not retry the unavailable order."
          );
          setPaymentState("error");
          return;
        }
        // Verify the freshly attached order by GET before allowing continuation.
        latest = await scopepayApi.reconcileOrder(token, nextOrderId);
        if (
          !sameTerms(latest) ||
          latest.document.paypalOrderId !== nextOrderId
        ) {
          setRecoveryNotice(
            "The recovered order could not be matched to these exact terms. Stop and ask the owner to verify the ledger."
          );
          setPaymentState("error");
          return;
        }
      }
      if (
        latest.document.status !== "accepted" &&
        latest.document.status !== "paid"
      ) {
        setRecoveryNotice(
          "Payment is pending or the review is not ready. Do not create another attempt; ask the owner to verify merchant Activity and the ledger."
        );
        setPaymentState("error");
        return;
      }
      setOrderId(latest.document.paypalOrderId ?? "");
      orderIdRef.current = latest.document.paypalOrderId ?? "";
      setApprovalUrl(null);
      if (latest.document.status === "paid") verifiedPaidRef.current = true;
      onReview(latest);
      clearPaymentError();
      setPaymentState(latest.document.status === "paid" ? "paid" : "idle");
      setRecoveryNotice(
        "Owner recovery found. The accepted version and amount are unchanged. Continue using PayPal checkout below; payment is not yet recorded."
      );
    } catch (error) {
      // Gateway/transport failure is uncertain, never permission to replace.
      const code = errorCode(error);
      if (isUnavailableClientLinkCode(code))
        showPaymentError(errorMessage(error), code);
      else {
        setRecoveryNotice(errorMessage(error));
        setPaymentErrorCode(unavailableCode);
      }
      setPaymentState("error");
    } finally {
      recoveryCheckRef.current = false;
    }
  };

  const recoveryGuide = (
    <>
      <SandboxRecoveryGuide
        version={review.document.version}
        totalCents={review.document.totalCents}
        unavailable
      />
      {recoveryNotice && (
        <p className="recovery-check-status" role="status">
          {recoveryNotice}
        </p>
      )}
      <button
        className="secondary-button full-button"
        disabled={paymentState === "recovering" || paymentState === "capturing"}
        onClick={() => void checkOwnerRecovery()}
      >
        <RefreshCw size={15} />
        {paymentState === "recovering"
          ? "Checking owner recovery…"
          : "Check for owner recovery"}
      </button>
      <small className="checkout-footnote">
        Read-only check. This action never creates an order or captures payment.
      </small>
    </>
  );

  useEffect(() => {
    if (
      !sdkReady ||
      !containerRef.current ||
      !window.paypal ||
      reviewLinkUnavailable ||
      orderUnavailable ||
      review.document.status !== "accepted"
    )
      return;
    containerRef.current.innerHTML = "";
    const generation = ++sdkGenerationRef.current;
    const isCurrent = () => sdkGenerationRef.current === generation;
    const buttons = window.paypal.Buttons({
      style: {
        layout: "vertical",
        shape: "rect",
        label: "paypal",
        color: "blue",
        height: 42,
      },
      createOrder: async () => {
        const result = await prepareOrder(isCurrent);
        if (!result) throw new Error("PayPal order preparation failed");
        return result.id;
      },
      onApprove: async (data: { orderID: string }) => {
        if (!isCurrent() || verifiedPaidRef.current) return;
        const traceId = createTraceId();
        const startedAt = nowMs();
        const approveFields = {
          traceId,
          scopeVersion: review.document.version,
          amountCents: review.document.totalCents,
          currency: review.document.currency,
          orderIdPresent: Boolean(data.orderID),
        };
        logPayPal("info", "onApprove.enter", {
          ...approveFields,
          elapsedMs: elapsedMs(startedAt),
        });
        const outcome = await capture(data.orderID, traceId, isCurrent);
        if (!isCurrent()) return;
        logPayPal(outcome.success ? "info" : "error", "onApprove.complete", {
          ...approveFields,
          success: outcome.success,
          elapsedMs: elapsedMs(startedAt),
          ...(outcome.error ? errorDiagnostics(outcome.error) : {}),
        });
      },
      onCancel: () => {
        if (!isCurrent() || verifiedPaidRef.current) return;
        setPaymentState("idle");
        showPaymentError(
          "Checkout was cancelled. No capture was recorded; your order remains available."
        );
      },
      onError: error => {
        if (!isCurrent() || verifiedPaidRef.current) return;
        logPayPal("warn", "sdk.error", {
          scopeVersion: review.document.version,
          amountCents: review.document.totalCents,
          currency: review.document.currency,
          orderIdPresent: Boolean(orderIdRef.current),
          ...errorDiagnostics(error),
        });
        setPaymentState("error");
        if (!paymentErrorRef.current)
          showPaymentError(
            "PayPal could not finish this checkout. ScopePay has not verified a completed capture. Verify this same order before retrying; if the popup did not continue, use the direct PayPal link below."
          );
      },
    });
    buttons.render(containerRef.current).catch(() => {
      if (!isCurrent() || verifiedPaidRef.current) return;
      setSdkError(
        "PayPal checkout could not start. You can still prepare a direct Sandbox link below, or ask the workspace owner to verify Sandbox setup."
      );
    });
    return () => {
      if (isCurrent()) sdkGenerationRef.current += 1;
      try {
        void buttons.close?.().catch(() => {});
      } catch {
        // A failed SDK cleanup must not affect saved payment state.
      }
    };
  }, [
    sdkReady,
    token,
    review.document.version,
    review.document.status,
    review.document.totalCents,
    review.document.currency,
    reviewLinkUnavailable,
    orderUnavailable,
  ]);

  if (review.document.status === "paid" || paymentState === "paid")
    return (
      <div className="paid-confirmation">
        <CheckCircle2 size={22} />
        <div>
          <strong>Payment recorded by the sandbox.</strong>
          <span>The verified capture is now part of the project ledger.</span>
        </div>
      </div>
    );

  if (reviewLinkUnavailable)
    return (
      <div className="checkout-box">
        <div className="inline-message error" role="alert">
          <XCircle size={14} />
          <span>
            {paymentError ||
              "This client review link is unavailable. The saved PayPal order could not be checked. Ask the workspace owner for a current link; this does not prove no payment completed."}
          </span>
        </div>
        <p className="action-note">
          Checkout is paused for this link. Ask the workspace owner to check
          PayPal Sandbox Activity and provide a current review link. Do not
          prepare another order from this unavailable link.
        </p>
      </div>
    );

  if (review.document.status === "payment_pending") {
    return (
      <div className="checkout-box">
        <div className="checkout-head">
          <div>
            <span className="micro-label">PAYMENT RECOVERY · USD</span>
            <h3>{formatMoney(review.document.totalCents)}</h3>
          </div>
          <ShieldCheck size={18} />
        </div>
        <p className="action-note">
          The server has not declared this payment failed. Verify the saved
          PayPal order before trying capture again.
        </p>
        {paymentError && (
          <div className="inline-message error">
            <XCircle size={14} />
            <span>{paymentError}</span>
            <button className="text-button" onClick={dismissPaymentError}>
              Dismiss
            </button>
          </div>
        )}
        {orderUnavailable && (
          <div className="recovery-instruction">{recoveryGuide}</div>
        )}
        <div className="editor-actions">
          {!orderUnavailable && (
            <button
              className="secondary-button"
              disabled={paymentState === "recovering" || !orderId}
              onClick={verify}
            >
              {paymentState === "recovering" ? (
                <LoaderCircle className="spin" size={15} />
              ) : (
                <RefreshCw size={15} />
              )}
              {paymentState === "recovering" ? "Verifying…" : "Verify payment"}
            </button>
          )}
          {!orderUnavailable && (
            <button
              className="primary-button"
              disabled={paymentState === "capturing" || !orderId}
              onClick={() => void capture(orderId)}
            >
              {paymentState === "capturing" ? (
                <LoaderCircle className="spin" size={15} />
              ) : (
                <CreditCard size={15} />
              )}
              {paymentState === "capturing" ? "Retrying…" : "Retry capture"}
            </button>
          )}
        </div>
        {!orderUnavailable && (
          <div className="direct-paypal-actions">
            <button
              className="secondary-button"
              disabled={
                paymentState === "creating" || paymentState === "capturing"
              }
              onClick={() => void prepareOrder()}
            >
              {paymentState === "creating" ? (
                <LoaderCircle className="spin" size={15} />
              ) : (
                <ExternalLink size={15} />
              )}
              {paymentState === "creating"
                ? "Preparing PayPal link…"
                : "Prepare PayPal continuation link"}
            </button>
          </div>
        )}
        {approvalUrl && !orderUnavailable && (
          <a
            className="paypal-continue-link"
            href={approvalUrl}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
          >
            Continue to PayPal <ExternalLink size={14} />
          </a>
        )}
        <small className="checkout-footnote">
          Retry is server-checked and uses the same PayPal order; it never
          blindly creates a replacement.
        </small>
      </div>
    );
  }

  if (!status?.paypalConfigured || !status.paypalClientId)
    return (
      <div className="checkout-disabled">
        <CreditCard size={18} />
        <div>
          <strong>Sandbox checkout is not configured</strong>
          <span>
            PayPal credentials are missing on the workspace server. No simulated
            payment button is shown.
          </span>
        </div>
      </div>
    );

  return (
    <div className="checkout-box">
      <div className="checkout-head">
        <div>
          <span className="micro-label">PAYPAL SANDBOX · USD</span>
          <h3>Pay {formatMoney(review.document.totalCents)}</h3>
        </div>
        <ShieldCheck size={18} />
      </div>
      {sdkError && (
        <div className="inline-message error">
          <XCircle size={14} />
          <span>{sdkError}</span>
        </div>
      )}
      {!sdkError && !sdkReady && (
        <div className="checkout-loading">
          <LoaderCircle size={15} className="spin" />
          Loading secure sandbox checkout…
        </div>
      )}
      {orderUnavailable ? (
        <div className="recovery-instruction">{recoveryGuide}</div>
      ) : (
        <>
          <div
            ref={containerRef}
            className={
              sdkReady && !sdkError ? "paypal-buttons" : "paypal-buttons hidden"
            }
          />
          <div className="direct-paypal-actions">
            <button
              className="secondary-button"
              disabled={
                paymentState === "creating" || paymentState === "capturing"
              }
              onClick={() => void prepareOrder()}
            >
              {paymentState === "creating" ? (
                <LoaderCircle className="spin" size={15} />
              ) : (
                <ExternalLink size={15} />
              )}
              {paymentState === "creating"
                ? "Preparing direct link…"
                : "Prepare direct PayPal link"}
            </button>
            <small>
              This is a two-step action. First prepare the server order, then
              click the link to continue in PayPal.
            </small>
          </div>
        </>
      )}
      {approvalUrl && !orderUnavailable && (
        <a
          className="paypal-continue-link"
          href={approvalUrl}
          target="_blank"
          rel="noopener noreferrer"
          referrerPolicy="no-referrer"
        >
          Continue to PayPal <ExternalLink size={14} />
        </a>
      )}
      {(paymentState === "creating" || paymentState === "capturing") && (
        <div className="checkout-state">
          <LoaderCircle size={14} className="spin" />
          {paymentState === "creating"
            ? "Creating a server order…"
            : "Verifying capture…"}
        </div>
      )}
      {paymentError && (
        <div className="inline-message error">
          <XCircle size={14} />
          <span>{paymentError}</span>
          <button className="text-button" onClick={dismissPaymentError}>
            Dismiss
          </button>
        </div>
      )}
      {orderId && !orderUnavailable && (
        <div className="editor-actions">
          <button
            className="secondary-button"
            disabled={
              paymentState === "recovering" ||
              paymentState === "capturing" ||
              paymentState === "creating"
            }
            onClick={verify}
          >
            {paymentState === "recovering" ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <RefreshCw size={15} />
            )}
            {paymentState === "recovering"
              ? "Verifying…"
              : "Verify this same order"}
          </button>
        </div>
      )}
      {!orderUnavailable && recoveryNotice && (
        <p className="recovery-check-status" role="status">
          {recoveryNotice}
        </p>
      )}
      {!orderUnavailable && (
        <details className="checkout-help">
          <summary>Need help with Sandbox checkout?</summary>
          <SandboxRecoveryGuide
            version={review.document.version}
            totalCents={review.document.totalCents}
          />
        </details>
      )}
      <small className="checkout-footnote">
        ScopePay records payment only after the server verifies a completed
        capture in PayPal Sandbox.
      </small>
    </div>
  );
}
