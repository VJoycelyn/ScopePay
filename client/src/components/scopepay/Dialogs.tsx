import { useState } from "react";
import {
  CheckCircle2,
  Info,
  LoaderCircle,
  Sparkles,
  X,
  XCircle,
  ShieldCheck,
  Check,
} from "lucide-react";
import type { ServiceStatus } from "@shared/scopepay";
import { Field } from "./shared";

export function NewProjectDialog({
  onClose,
  onSubmit,
  loading,
}: {
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    clientName: string;
    brief: string;
    hourlyRateCents: number;
    budgetCents: number | null;
  }) => void;
  loading: boolean;
}) {
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [brief, setBrief] = useState("");
  const [rate, setRate] = useState("125");
  const [budget, setBudget] = useState("");
  const [error, setError] = useState("");
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (
      !name.trim() ||
      !clientName.trim() ||
      brief.trim().length < 20 ||
      Number(rate) <= 0
    ) {
      setError(
        "Add a project name, client name, a brief of at least 20 characters, and a positive hourly rate."
      );
      return;
    }
    onSubmit({
      name: name.trim(),
      clientName: clientName.trim(),
      brief: brief.trim(),
      hourlyRateCents: Math.round(Number(rate) * 100),
      budgetCents: budget.trim() ? Math.round(Number(budget) * 100) : null,
    });
  };
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-project-title"
    >
      <form className="modal dialog-wide" onSubmit={submit}>
        <div className="modal-header">
          <div>
            <span className="eyebrow">NEW PROJECT · LIVE AI</span>
            <h2 id="new-project-title">
              Give the work a clear starting point.
            </h2>
            <p>
              ScopePay will ask the model to draft deliverables from this brief.
              You can edit everything before publishing.
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>
        <div className="form-grid">
          <Field label="Project name">
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Northline launch site"
            />
          </Field>
          <Field label="Client name">
            <input
              value={clientName}
              onChange={e => setClientName(e.target.value)}
              placeholder="e.g. Northline Coffee"
            />
          </Field>
          <Field label="Hourly rate · USD">
            <input
              type="number"
              min="1"
              value={rate}
              onChange={e => setRate(e.target.value)}
            />
          </Field>
          <Field label="Budget · USD · optional">
            <input
              type="number"
              min="0"
              value={budget}
              onChange={e => setBudget(e.target.value)}
              placeholder="No hard cap"
            />
          </Field>
        </div>
        <Field label="Brief">
          <textarea
            rows={7}
            value={brief}
            onChange={e => setBrief(e.target.value)}
            placeholder="What are you making, for whom, and what should the finished work help them do?"
          />
          <small className="input-hint">
            {brief.length}/20 minimum characters
          </small>
        </Field>
        {error && (
          <div className="inline-message error">
            <XCircle size={14} />
            {error}
          </div>
        )}
        <div className="modal-footer">
          <span className="ai-notice">
            <Sparkles size={15} />
            Live AI call · no payment action
          </span>
          <div>
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={loading}>
              {loading ? (
                <>
                  <LoaderCircle size={15} className="spin" />
                  Drafting scope…
                </>
              ) : (
                <>
                  <Sparkles size={15} />
                  Draft scope with AI
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export function HelpDialog({
  status,
  onClose,
}: {
  status: ServiceStatus | null;
  onClose: () => void;
}) {
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-title"
    >
      <div className="modal help-modal">
        <div className="modal-header">
          <div>
            <span className="eyebrow">A NOTE ON THE PROTOTYPE</span>
            <h2 id="help-title">Clear scope, honest handoffs.</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>
        <p>
          ScopePay is an AI-assisted scope-to-payment workspace. AI suggestions
          are advisory only. The client must explicitly accept a published
          version before the sandbox checkout unlocks.
        </p>
        <div className="help-points">
          <div>
            <CheckCircle2 size={17} />
            <span>
              <strong>Calculated by the server</strong>Totals, acceptance, and
              paid status come from the backend ledger.
            </span>
          </div>
          <div>
            <ShieldCheck size={17} />
            <span>
              <strong>Sandbox only</strong>This prototype uses one USD demo
              merchant. It is not escrow or a production payment service.
            </span>
          </div>
          <div>
            <Info size={17} />
            <span>
              <strong>Current readiness</strong>AI:{" "}
              {status?.aiConfigured ? "ready" : "not configured"} · PayPal:{" "}
              {status?.paypalConfigured ? "sandbox ready" : "not configured"}
            </span>
          </div>
        </div>
        <button className="primary-button full-button" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}
