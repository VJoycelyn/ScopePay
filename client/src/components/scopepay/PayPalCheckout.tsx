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
import { scopepayApi } from "../../lib/scopepay-api";
import { errorMessage, formatMoney } from "./shared";

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
  const capture = async (id: string) => {
    setPaymentState("capturing");
    setPaymentError("");
    try {
      applyPaidResult(await scopepayApi.captureOrder(token, id));
    } catch (error) {
      setPaymentState("error");
      setPaymentError(errorMessage(error));
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
          await capture(data.orderID);
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
