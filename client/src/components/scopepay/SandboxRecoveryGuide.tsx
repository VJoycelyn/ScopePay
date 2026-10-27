import { ExternalLink, ShieldCheck } from "lucide-react";
import { formatMoney } from "./shared";

/** Informational only. Opening this guide never creates, approves, or captures an order. */
export function SandboxRecoveryGuide({
  version,
  totalCents,
  unavailable = false,
}: {
  version?: number;
  totalCents?: number;
  unavailable?: boolean;
}) {
  const exactTerms =
    version !== undefined && totalCents !== undefined
      ? `USD ${formatMoney(totalCents)} · accepted version ${version}`
      : "the accepted version and exact USD amount in the review";
  return (
    <section
      className="sandbox-recovery-guide"
      aria-label="Sandbox checkout recovery steps"
    >
      <div className="recovery-guide-heading">
        <ShieldCheck size={17} aria-hidden="true" />
        <h3>
          {unavailable
            ? "How to restore this checkout"
            : "Sandbox checkout: what to do next"}
        </h3>
      </div>
      <p className="recovery-terms">
        <strong>{exactTerms}</strong>
      </p>
      {unavailable && (
        <p>
          PayPal cannot retrieve this saved order. Your accepted scope and
          review link stay available. A missing order is{" "}
          <strong>not proof that no payment completed.</strong>
        </p>
      )}
      {!unavailable && (
        <p>
          For a new accepted quote, use the PayPal button or prepare the direct
          link, then continue to PayPal. These recovery steps are for an
          existing unavailable or conclusively unpaid terminal order, not a
          blocked popup or uncertain payment. For pending/unknown status, verify
          the same order and stop before any replacement.
        </p>
      )}
      <ol className="sandbox-recovery-steps">
        <li>
          <strong>Owner · check merchant Activity first.</strong>
          <span>
            Sign in to the configured PayPal Sandbox <b>Business merchant</b>,
            not the buyer account. Check Activity for this exact amount. If a
            payment is completed, pending, or unclear, stop: do not create a
            replacement. Return to ScopePay and verify the existing payment.
          </span>
          <a
            href="https://www.sandbox.paypal.com/"
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
          >
            Open PayPal Sandbox <ExternalLink size={13} aria-hidden="true" />
          </a>
        </li>
        <li>
          <strong>Owner · recover only after confirming no payment.</strong>
          <span>
            In your original private ScopePay workspace, select this project,
            open <b>Payments</b>, and find the matching document/version. Select
            <b> Show recovery options</b>, check the no-completed-payment
            confirmation, then select <b>Create replacement Sandbox order</b>
            once. The server checks eligibility. This prepares an order; it does
            not charge the buyer or change the accepted terms.
          </span>
        </li>
        <li>
          <strong>Owner → buyer · send the continuation link.</strong>
          <span>
            Copy the fresh review/continuation link shown in Payments and send
            it privately to the buyer. The existing same-version review link
            also stays active. If a request times out or status is unknown, stop
            and refresh the ledger; do not create another attempt.
          </span>
        </li>
        <li>
          <strong>Buyer · explicitly approve in Sandbox.</strong>
          <span>
            Open the owner's continuation link, check the exact scope/version
            and amount, then continue to PayPal. Sign in with a{" "}
            <b>Sandbox Personal buyer</b> and approve the test payment yourself.
            Let PayPal return to ScopePay. Do not use a real-money account or
            approve as the merchant.
          </span>
        </li>
        <li>
          <strong>Both · verify, then call it paid.</strong>
          <span>
            Wait for <b>Payment recorded by the sandbox</b>. Refresh the owner
            ledger and cross-check merchant Activity. Only the server's verified
            completed capture counts; an accepted scope, new order, or approval
            click alone does not.
          </span>
        </li>
      </ol>
      <p className="recovery-guide-boundary">
        Buyers cannot perform owner recovery from this public review. Use the
        original owner workspace in the same browser, or ask its owner for help.
        Never share workspace credentials or buyer login details.
      </p>
      <a
        className="text-button"
        href="/setup"
        target="_blank"
        rel="noopener noreferrer"
        referrerPolicy="no-referrer"
      >
        Setup, status &amp; recovery help{" "}
        <ExternalLink size={13} aria-hidden="true" />
      </a>
    </section>
  );
}
