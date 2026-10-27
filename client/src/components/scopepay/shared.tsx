import type { ReactNode } from "react";
import { Check, FilePlus2, ShieldCheck } from "lucide-react";
import { ScopePayApiError } from "../../lib/scopepay-api";

export const formatMoney = (cents: number | null | undefined) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((cents ?? 0) / 100);
export const formatMoneyExact = (cents: number) => formatMoney(cents);
export const formatDate = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(value))
    : "—";
export const formatTime = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(value))
    : "—";
const SAFE_SCOPEPAY_ERROR_MESSAGES: Record<string, string> = {
  CLIENT_LINK_NOT_FOUND:
    "This client review link is unavailable. The saved PayPal order could not be checked. Ask the workspace owner for a current link; this does not prove no payment completed.",
  CLIENT_TOKEN_NOT_FOUND:
    "This client review link is unavailable. The saved PayPal order could not be checked. Ask the workspace owner for a current link; this does not prove no payment completed.",
  DATABASE_UNAVAILABLE:
    "ScopePay cannot read its saved records right now. Wait and try again; do not create a replacement while payment status is uncertain.",
  PAYPAL_ORDER_NOT_FOUND:
    "This PayPal Sandbox order is unavailable. Follow the recovery steps below; payment status is not confirmed.",
  CAPTURE_IN_PROGRESS:
    "A PayPal capture is still being processed. Wait briefly, then retry verification for this same order; do not create a replacement.",
  ORDER_SUPERSEDED:
    "The saved PayPal order changed during checkout. Refresh this same review and verify Sandbox Activity before continuing.",
  ORDER_NOT_FOUND:
    "This PayPal Sandbox order is unavailable. Follow the recovery steps below; payment status is not confirmed.",
  ORDER_PENDING:
    "PayPal still shows this order as pending. No payment was recorded; do not create a replacement until the server says it is safe.",
  PAYMENT_MISMATCH:
    "PayPal could not verify this order for the accepted version and amount. No payment was recorded.",
  PAYMENT_UNKNOWN:
    "ScopePay could not verify this payment's status. A payment may still have completed in PayPal. Verify this same order before retrying; do not create a replacement.",
  SERVICE_UNAVAILABLE:
    "ScopePay's payment service is temporarily unavailable. Wait at least 60 seconds, then verify this same order. Do not create a replacement while payment status is uncertain.",
  INVALID_RESPONSE:
    "ScopePay did not receive a valid service response. Verify the saved order before retrying checkout; payment status is not confirmed.",
  NETWORK_ERROR:
    "ScopePay could not reach its server. Check your connection, then verify the saved order before retrying checkout.",
  API_ERROR:
    "ScopePay could not complete verification. Wait briefly and verify the saved order again; do not create a replacement.",
  PAYPAL_PROVIDER_REJECTED:
    "PayPal Sandbox rejected this payment request. No payment was recorded.",
  VERSION_MISMATCH:
    "This payment link is for a different document version. No payment was recorded.",
};

export const errorMessage = (error: unknown) => {
  if (error instanceof ScopePayApiError) {
    return (
      (error.code && SAFE_SCOPEPAY_ERROR_MESSAGES[error.code]) ||
      (error.code === "INTERNAL_ERROR" || error.code === "UNKNOWN_ERROR"
        ? "The payment service could not complete that request. Try again later."
        : error.message)
    );
  }
  return error instanceof Error
    ? error.message
    : "Something went wrong. Try again.";
};

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <div className={`wordmark ${light ? "wordmark-light" : ""}`}>
      <span className="scope-mark" aria-hidden="true">
        <span>⌜</span>
        <Check size={13} strokeWidth={3} />
      </span>
      <span>
        Scope<span className="wordmark-pay">Pay</span>
      </span>
    </div>
  );
}

export function StatusPill({
  status,
  label,
}: {
  status: string;
  label?: string;
}) {
  const text = label ?? status.replaceAll("_", " ");
  return (
    <span className={`status-pill status-${status}`}>
      <span className="status-dot" />
      {text}
    </span>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: typeof FilePlus2;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon size={20} />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}

export function LockIcon() {
  return <ShieldCheck size={15} />;
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}
