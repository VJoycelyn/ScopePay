import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  ClipboardCheck,
  Info,
  LoaderCircle,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import type {
  ClientReview,
  PaymentResult,
  ServiceStatus,
} from "@shared/scopepay";
import { scopepayApi } from "../lib/scopepay-api";
import { PayPalCheckout } from "../components/scopepay/PayPalCheckout";
import {
  errorMessage,
  formatMoney,
  formatMoneyExact,
  Logo,
} from "../components/scopepay/shared";

export function PublicReviewPage({ token }: { token: string }) {
  const [review, setReview] = useState<ClientReview | null>(null);
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [paypalNotice, setPaypalNotice] = useState("");
  const [paypalNoticeError, setPaypalNoticeError] = useState(false);
  const handledPaypalQuery = useRef("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [next, nextStatus] = await Promise.all([
        scopepayApi.clientReview(token),
        scopepayApi.status().catch(() => null),
      ]);
      setReview(next);
      setStatus(nextStatus);
      setAccepted(
        next.document.status === "accepted" ||
          next.document.status === "payment_pending" ||
          next.document.status === "paid"
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [token]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!review) return;
    const query = new URL(window.location.href);
    const paypalAction = query.searchParams.get("paypal");
    if (paypalAction !== "return" && paypalAction !== "cancel") return;
    const providerOrderId = query.searchParams.get("token");
    const queryKey = `${paypalAction}:${providerOrderId ?? ""}:${review.document.id}:${review.document.version}`;
    if (handledPaypalQuery.current === queryKey) return;
    handledPaypalQuery.current = queryKey;
    for (const key of ["paypal", "token", "PayerID", "payerId", "paymentId"])
      query.searchParams.delete(key);
    window.history.replaceState(
      {},
      window.document.title,
      `${query.pathname}${query.search}${query.hash}`
    );
    if (paypalAction === "cancel") {
      setPaypalNotice(
        "No capture was recorded. The same PayPal order remains available if you want to try again."
      );
      setPaypalNoticeError(false);
      return;
    }
    if (
      (review.document.status !== "accepted" &&
        review.document.status !== "payment_pending") ||
      !providerOrderId ||
      providerOrderId !== review.document.paypalOrderId
    ) {
      setPaypalNotice(
        "This PayPal return could not be matched to the saved order for this accepted review. No payment was recorded."
      );
      setPaypalNoticeError(true);
      return;
    }
    setPaypalNotice(
      "Verifying the completed PayPal Sandbox order with the server…"
    );
    setPaypalNoticeError(false);
    void scopepayApi
      .captureOrder(token, providerOrderId)
      .then((result: PaymentResult) => {
        setReview(current =>
          current
            ? {
                ...current,
                document: {
                  ...current.document,
                  status: "paid",
                  paidAt: current.document.paidAt || new Date().toISOString(),
                  paypalOrderId: result.orderId,
                  paypalCaptureId: result.captureId,
                },
              }
            : current
        );
        setPaypalNotice("");
      })
      .catch(err => {
        setPaypalNotice(errorMessage(err));
        setPaypalNoticeError(true);
      });
  }, [review, token]);
  const accept = async () => {
    if (!review || !accepted) return;
    setAccepting(true);
    setError("");
    try {
      setReview(
        await scopepayApi.acceptClientDocument(token, review.document.version)
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setAccepting(false);
    }
  };
  if (loading)
    return (
      <div className="client-loading">
        <Logo />
        <LoaderCircle className="spin" size={20} />
        Loading your review…
      </div>
    );
  if (error || !review)
    return (
      <div className="client-error">
        <Logo />
        <div>
          <XCircle size={25} />
          <h1>This review link is unavailable.</h1>
          <p>
            {error ||
              "The document may have been replaced or the link may be incomplete."}
          </p>
          <a href="/">Return to ScopePay</a>
        </div>
      </div>
    );
  const document = review.document;
  return (
    <div className="client-page">
      <header className="client-header">
        <Logo />
        <div className="client-header-note">
          <ShieldCheck size={15} />
          Private client review · {review.sandbox ? "Sandbox" : ""}
        </div>
      </header>
      <main className="client-main">
        <div className="client-intro">
          <span className="eyebrow">
            {document.kind === "change" ? "CHANGE ORDER" : "PROJECT SCOPE"} ·
            VERSION {document.version}
          </span>
          <h1>{document.title}</h1>
          <p>
            Hi {review.clientName}, here is the exact work and price for{" "}
            <strong>{review.projectName}</strong>.
          </p>
        </div>
        <div className="client-grid">
          <article className="client-document">
            <div className="client-document-top">
              <span className="status-inline">
                <span className="status-dot" />
                {document.status === "paid"
                  ? "Paid"
                  : document.status === "accepted"
                    ? "Accepted"
                    : document.status === "payment_pending"
                      ? "Payment pending"
                      : "Ready for your review"}
              </span>
              <span className="mono">
                {formatMoneyExact(document.totalCents)}
              </span>
            </div>
            <p className="client-summary">{document.scopeSummary}</p>
            <div className="client-deliverables">
              <h2>What is included</h2>
              {document.deliverables.map((item, index) => (
                <div className="client-deliverable" key={item.id}>
                  <span className="client-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.description}</p>
                  </div>
                  <span className="mono">{formatMoney(item.priceCents)}</span>
                </div>
              ))}
            </div>
            <div className="client-detail-grid">
              <div>
                <span className="micro-label">TIMELINE</span>
                <strong>{document.timeline}</strong>
              </div>
              <div>
                <span className="micro-label">REVISIONS</span>
                <strong>{document.revisionLimit}</strong>
              </div>
            </div>
            {document.exclusions.length > 0 && (
              <div className="client-exclusions">
                <span className="micro-label">NOT INCLUDED</span>
                <p>{document.exclusions.join(" · ")}</p>
              </div>
            )}
          </article>
          <aside className="client-action">
            <div className="client-total">
              <span className="micro-label">TOTAL · USD</span>
              <strong>{formatMoneyExact(document.totalCents)}</strong>
              <small>Server-calculated · Version {document.version}</small>
            </div>
            {paypalNotice && (
              <div
                className={`inline-message${paypalNoticeError ? " error" : ""}`}
              >
                {paypalNoticeError ? <XCircle size={14} /> : <Info size={14} />}
                <span>{paypalNotice}</span>
              </div>
            )}
            {document.status === "published" ? (
              <>
                <label className="accept-check">
                  <input
                    type="checkbox"
                    checked={accepted}
                    onChange={e => setAccepted(e.target.checked)}
                  />
                  <span className="check-box">
                    {accepted && <Check size={14} />}
                  </span>
                  <span>I have reviewed and accept this scope and price.</span>
                </label>
                <button
                  className="primary-button full-button"
                  disabled={!accepted || accepting}
                  onClick={accept}
                >
                  {accepting ? (
                    <>
                      <LoaderCircle size={16} className="spin" />
                      Recording approval…
                    </>
                  ) : (
                    <>
                      <ClipboardCheck size={16} />
                      Accept this scope
                    </>
                  )}
                </button>
                <p className="action-note">
                  Acceptance records this exact version. Payment stays locked
                  until you approve.
                </p>
              </>
            ) : document.status === "accepted" ||
              document.status === "payment_pending" ||
              document.status === "paid" ? (
              <PayPalCheckout
                token={token}
                review={review}
                status={status}
                onReview={setReview}
              />
            ) : (
              <div className="checkout-disabled">
                <Info size={17} />
                <span>This document is not currently open for review.</span>
              </div>
            )}
            <div className="client-notice">
              <ShieldCheck size={15} />
              <span>
                {review.merchantNotice ||
                  "Sandbox-only USD demo merchant. No escrow."}
              </span>
            </div>
          </aside>
        </div>
        <footer className="client-footer">
          <Logo />
          <span>ScopePay · Extra work. Explicit approval.</span>
        </footer>
      </main>
    </div>
  );
}
