import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  CreditCard,
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
import { errorMessage, formatMoney } from "./shared";

const PAYPAL_LOG_PREFIX = "[ScopePay PayPal]";
const SAFE_API_CODES = new Set([
  "PAYMENT_PENDING",
  "PAYMENT_UNKNOWN",
  "PAYMENT_RETRY",
  "PAYMENT_MISMATCH",
  "PAYPAL_NOT_CONFIGURED",
  "PAYPAL_UNAVAILABLE",
  "RATE_LIMITED",
  "ORDER_NOT_FOUND",
  "ORDER_PENDING",
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
    if (error instanceof TypeError) {
      return {
        errorType: "TypeError",
        errorCode: "UNKNOWN_ERROR",
        httpStatus: null,
      };
    }
    if (
      (typeof DOMException !== "undefined" &&
        error instanceof DOMException &&
        error.name === "AbortError") ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      return {
        errorType: "AbortError",
        errorCode: "UNKNOWN_ERROR",
        httpStatus: null,
      };
    }
    if (error instanceof Error) {
      return {
        errorType: "Error",
        errorCode: "UNKNOWN_ERROR",
        httpStatus: null,
      };
    }
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

declare global {
  interface Window {
    paypal?: {
      Buttons: (options: {
        style?: Record<string, unknown>;
        createOrder: () => Promise<string>;
        onApprove: (data: { orderID: string }) => Promise<void>;
        onCancel: () => void;
        onError: (error: unknown) => void;
      }) => { render: (container: HTMLElement) => Promise<void> };
    };
  }
}

export function PayPalCheckout({
  token,
  review,
  status,
  onReview,
}: {
  token: string;
  review: ClientReview;
  status: ServiceStatus | null;
  onReview: (review: ClientReview) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState("");
  const [paymentState, setPaymentState] = useState<
    "idle" | "creating" | "capturing" | "recovering" | "paid" | "error"
  >("idle");
  const [paymentError, setPaymentError] = useState("");
  const [orderId, setOrderId] = useState(review.document.paypalOrderId ?? "");
  useEffect(() => {
    if (review.document.paypalOrderId)
      setOrderId(review.document.paypalOrderId);
  }, [review.document.paypalOrderId]);
  useEffect(() => {
    if (
      !status?.paypalConfigured ||
      !status.paypalClientId ||
      review.document.status !== "accepted"
    )
      return;
    const script = document.createElement("script");
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(status.paypalClientId)}&currency=USD&intent=capture`;
    script.async = true;
    script.onload = () => setSdkReady(true);
    script.onerror = () =>
      setSdkError(
        "PayPal checkout could not load. Check your connection or ask the workspace owner to verify sandbox setup."
      );
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
  }, [
    status?.paypalClientId,
    status?.paypalConfigured,
    review.document.status,
  ]);
  const applyPaidResult = (result: PaymentResult): void => {
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
    traceId = createTraceId()
  ): Promise<{ success: boolean; error?: unknown }> => {
    const startedAt = nowMs();
    const captureFields = {
      traceId,
      scopeVersion: review.document.version,
      amountCents: review.document.totalCents,
      currency: review.document.currency,
      orderIdPresent: Boolean(id),
    };
    setPaymentState("capturing");
    setPaymentError("");
    logPayPal("info", "capture.request", {
      ...captureFields,
      elapsedMs: elapsedMs(startedAt),
    });
    try {
      const result = await scopepayApi.captureOrder(token, id, traceId);
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
      setPaymentState("error");
      setPaymentError(errorMessage(error));
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
    if (!orderId) {
      setPaymentError(
        "No saved PayPal order is available yet. Start checkout again."
      );
      return;
    }
    setPaymentState("recovering");
    setPaymentError("");
    try {
      const latest = await scopepayApi.reconcileOrder(token, orderId);
      onReview(latest);
      setPaymentState(latest.document.status === "paid" ? "paid" : "error");
      if (latest.document.status !== "paid")
        setPaymentError(
          "Payment is not confirmed yet. Verify again or retry capture when the server says it is safe."
        );
    } catch (error) {
      setPaymentState("error");
      setPaymentError(errorMessage(error));
    }
  };
  useEffect(() => {
    if (
      !sdkReady ||
      !containerRef.current ||
      !window.paypal ||
      review.document.status !== "accepted"
    )
      return;
    containerRef.current.innerHTML = "";
    window.paypal
      .Buttons({
        style: {
          layout: "vertical",
          shape: "rect",
          label: "paypal",
          color: "blue",
          height: 42,
        },
        createOrder: async () => {
          setPaymentState("creating");
          setPaymentError("");
          try {
            const result = await scopepayApi.createOrder(
              token,
              review.document.version
            );
            setOrderId(result.id);
            return result.id;
          } catch (error) {
            setPaymentState("error");
            setPaymentError(errorMessage(error));
            throw error;
          }
        },
        onApprove: async (data: { orderID: string }) => {
          const traceId = createTraceId();
          const startedAt = nowMs();
          const orderIdPresent = Boolean(data.orderID);
          const approveFields = {
            traceId,
            scopeVersion: review.document.version,
            amountCents: review.document.totalCents,
            currency: review.document.currency,
            orderIdPresent,
          };
          logPayPal("info", "onApprove.enter", {
            ...approveFields,
            elapsedMs: elapsedMs(startedAt),
          });
          const outcome = await capture(data.orderID, traceId);
          logPayPal(outcome.success ? "info" : "error", "onApprove.complete", {
            ...approveFields,
            success: outcome.success,
            elapsedMs: elapsedMs(startedAt),
            ...(outcome.error ? errorDiagnostics(outcome.error) : {}),
          });
        },
        onCancel: () => {
          setPaymentState("idle");
          setPaymentError(
            "Checkout was cancelled. Your approval is unchanged and you can try again."
          );
        },
        onError: (error: unknown) => {
          setPaymentState("error");
          setPaymentError(
            error instanceof Error
              ? error.message
              : "PayPal returned an error. Verify payment before retrying."
          );
        },
      })
      .render(containerRef.current)
      .catch((error: unknown) =>
        setSdkError(
          error instanceof Error
            ? error.message
            : "PayPal checkout could not start."
        )
      );
  }, [sdkReady, token, review.document.version, review.document.status]);
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
  if (
    review.document.status === "payment_pending" ||
    paymentState === "error" ||
    paymentState === "recovering"
  )
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
            {paymentError}
          </div>
        )}
        <div className="editor-actions">
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
        </div>
        <small className="checkout-footnote">
          Retry is server-checked and uses the same PayPal order; it never
          blindly creates a replacement.
        </small>
      </div>
    );
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
      {sdkError ? (
        <div className="inline-message error">
          <XCircle size={14} />
          {sdkError}
        </div>
      ) : (
        <>
          {!sdkReady && (
            <div className="checkout-loading">
              <LoaderCircle size={15} className="spin" />
              Loading secure sandbox checkout…
            </div>
          )}
          <div
            ref={containerRef}
            className={sdkReady ? "paypal-buttons" : "paypal-buttons hidden"}
          />
        </>
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
          {paymentError}
          <button className="text-button" onClick={() => setPaymentError("")}>
            Dismiss
          </button>
        </div>
      )}
      <small className="checkout-footnote">
        You will be redirected to PayPal's sandbox. ScopePay records payment
        only after the server verifies a completed capture.
      </small>
    </div>
  );
}
