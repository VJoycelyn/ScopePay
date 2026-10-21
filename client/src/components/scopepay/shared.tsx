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
export const errorMessage = (error: unknown) =>
  error instanceof ScopePayApiError
    ? error.message
    : error instanceof Error
      ? error.message
      : "Something went wrong. Try again.";

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
