import { useEffect, useState } from "react";
import {
  Check,
  ClipboardCheck,
  Clock3,
  Copy,
  Info,
  Link2,
  LoaderCircle,
  Pencil,
  Plus,
  Send,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";
import type {
  Deliverable,
  ScopeDocument,
  ScopeProject,
} from "@shared/scopepay";
import { scopepayApi } from "../../lib/scopepay-api";
import {
  errorMessage,
  Field,
  formatMoney,
  LockIcon,
  StatusPill,
} from "./shared";

export function DocumentEditor({
  project,
  document,
  kind,
  onSaved,
}: {
  project: ScopeProject;
  document: ScopeDocument;
  kind: "quote" | "change";
  onSaved: (project: ScopeProject) => void;
}) {
  const locked = ["accepted", "payment_pending", "paid"].includes(
    document.status
  );
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState(() => ({
    title: document.title,
    scopeSummary: document.scopeSummary,
    deliverables: document.deliverables.map(item => ({ ...item })),
    exclusions: document.exclusions.join("\n"),
    timeline: document.timeline,
    revisionLimit: document.revisionLimit,
  }));
  useEffect(() => {
    setDraft({
      title: document.title,
      scopeSummary: document.scopeSummary,
      deliverables: document.deliverables.map(item => ({ ...item })),
      exclusions: document.exclusions.join("\n"),
      timeline: document.timeline,
      revisionLimit: document.revisionLimit,
    });
    setEditing(false);
  }, [document.id, document.version, document.status]);
  const updateItem = (index: number, field: keyof Deliverable, value: string) =>
    setDraft(current => ({
      ...current,
      deliverables: current.deliverables.map((item, i) => {
        if (i !== index) return item;
        const nextValue =
          field === "hours"
            ? Number(value) || 0
            : field === "priceCents"
              ? Math.round((Number(value) || 0) * 100)
              : value;
        return { ...item, [field]: nextValue };
      }),
    }));
  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      const result = await scopepayApi.editDocument(project.id, document.id, {
        ...draft,
        exclusions: draft.exclusions
          .split("\n")
          .map(item => item.trim())
          .filter(Boolean),
      });
      onSaved(result);
      setEditing(false);
      setMessage("Saved to the workspace.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };
  const publish = async () => {
    setPublishing(true);
    setMessage("");
    try {
      const result = await scopepayApi.publishDocument(project.id, document.id);
      onSaved(result);
      setMessage("Published. The client can now review this exact version.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setPublishing(false);
    }
  };
  return (
    <section className="panel document-panel">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">
            {kind === "quote" ? "PRIMARY SCOPE" : "CHANGE ORDER"}{" "}
            <span className="version-label">V{document.version}</span>
          </div>
          <h2>{document.title}</h2>
          <p className="panel-intro">
            {document.status === "draft"
              ? "Review the details before sharing a client link."
              : "This version is recorded in the project ledger."}
          </p>
        </div>
        <div className="panel-heading-actions">
          <StatusPill status={document.status} />
          {!locked && (
            <button
              className="secondary-button"
              onClick={() => setEditing(!editing)}
            >
              {editing ? <X size={15} /> : <Pencil size={15} />}
              {editing ? "Cancel" : "Edit scope"}
            </button>
          )}
        </div>
      </div>
      <div className="document-meta">
        <span>
          <Clock3 size={14} /> {document.timeline || "Timeline to be confirmed"}
        </span>
        <span>
          <ClipboardCheck size={14} />{" "}
          {document.revisionLimit || "Revisions to be confirmed"}
        </span>
        <strong>{formatMoney(document.totalCents)}</strong>
      </div>
      {editing ? (
        <div className="editor-form">
          <Field label="Document title">
            <input
              value={draft.title}
              onChange={e => setDraft({ ...draft, title: e.target.value })}
            />
          </Field>
          <Field label="Scope summary">
            <textarea
              rows={3}
              value={draft.scopeSummary}
              onChange={e =>
                setDraft({ ...draft, scopeSummary: e.target.value })
              }
            />
          </Field>
          <div className="deliverable-editor">
            <div className="field-label">
              DELIVERABLES{" "}
              <span>titles, descriptions, hours and prices are editable</span>
            </div>
            {draft.deliverables.map((item, index) => (
              <div className="deliverable-edit-item" key={item.id}>
                <div className="deliverable-row edit-row">
                  <input
                    aria-label={`Deliverable ${index + 1} title`}
                    value={item.title}
                    onChange={e => updateItem(index, "title", e.target.value)}
                  />
                  <input
                    aria-label={`Deliverable ${index + 1} hours`}
                    type="number"
                    min="0"
                    step="0.5"
                    value={item.hours}
                    onChange={e => updateItem(index, "hours", e.target.value)}
                  />
                  <div className="price-input">
                    <span>$</span>
                    <input
                      aria-label={`Deliverable ${index + 1} price`}
                      type="number"
                      min="0"
                      value={item.priceCents / 100}
                      onChange={e =>
                        updateItem(index, "priceCents", e.target.value)
                      }
                    />
                  </div>
                </div>
                <div className="deliverable-edit-footer">
                  <input
                    aria-label={`Deliverable ${index + 1} description`}
                    value={item.description}
                    onChange={e =>
                      updateItem(index, "description", e.target.value)
                    }
                    placeholder="Describe the outcome"
                  />
                  <button
                    type="button"
                    className="text-button"
                    disabled={draft.deliverables.length <= 1}
                    onClick={() =>
                      setDraft(current => ({
                        ...current,
                        deliverables: current.deliverables.filter(
                          (_, itemIndex) => itemIndex !== index
                        ),
                      }))
                    }
                  >
                    <X size={14} />
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <button
              className="text-button"
              onClick={() =>
                setDraft({
                  ...draft,
                  deliverables: [
                    ...draft.deliverables,
                    {
                      id: `draft-${Date.now()}`,
                      title: "New deliverable",
                      description: "Describe the outcome",
                      hours: 1,
                      priceCents: 0,
                    },
                  ],
                })
              }
            >
              <Plus size={14} />
              Add deliverable
            </button>
          </div>
          <div className="two-fields">
            <Field label="Timeline">
              <input
                value={draft.timeline}
                onChange={e => setDraft({ ...draft, timeline: e.target.value })}
              />
            </Field>
            <Field label="Revision limit">
              <input
                value={draft.revisionLimit}
                onChange={e =>
                  setDraft({ ...draft, revisionLimit: e.target.value })
                }
              />
            </Field>
          </div>
          <Field label="Exclusions · one per line">
            <textarea
              rows={3}
              value={draft.exclusions}
              onChange={e => setDraft({ ...draft, exclusions: e.target.value })}
            />
          </Field>
          <div className="editor-actions">
            <button
              className="secondary-button"
              onClick={() => setEditing(false)}
            >
              Discard
            </button>
            <button className="primary-button" disabled={saving} onClick={save}>
              {saving ? (
                <LoaderCircle className="spin" size={15} />
              ) : (
                <Check size={15} />
              )}
              {saving ? "Saving…" : "Save scope"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="scope-summary">{document.scopeSummary}</p>
          <div className="deliverable-list">
            <div className="list-heading">
              <span>DELIVERABLE</span>
              <span>HOURS</span>
              <span>PRICE</span>
            </div>
            {document.deliverables.map(item => (
              <div className="deliverable-row" key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                </div>
                <span className="mono">{item.hours}h</span>
                <strong className="mono">{formatMoney(item.priceCents)}</strong>
              </div>
            ))}
          </div>
          <div className="document-bottom">
            <div>
              <span className="micro-label">EXCLUSIONS</span>
              <p>
                {document.exclusions.length
                  ? document.exclusions.join(" · ")
                  : "None recorded"}
              </p>
            </div>
            {document.status === "draft" && (
              <button
                className="primary-button"
                disabled={publishing}
                onClick={publish}
              >
                {publishing ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <Send size={15} />
                )}
                {publishing ? "Publishing…" : "Publish for client review"}
              </button>
            )}
          </div>
        </>
      )}
      {locked && (
        <div className="locked-note">
          <LockIcon /> Editing is paused because this document has entered
          approval or payment.
        </div>
      )}
      {message && (
        <div
          className={`inline-message ${message.includes("error") || message.includes("failed") ? "error" : ""}`}
        >
          <Info size={14} />
          {message}
        </div>
      )}
    </section>
  );
}
export function ShareLink({
  token,
  status,
  projectId,
  documentId,
  onUpdated,
}: {
  token?: string;
  status: ScopeDocument["status"];
  projectId: string;
  documentId: string;
  onUpdated: (project: ScopeProject) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [reissuing, setReissuing] = useState(false);
  const [error, setError] = useState("");
  const reissue = async () => {
    setReissuing(true);
    setError("");
    try {
      const next = await scopepayApi.reissueShareLink(projectId, documentId);
      onUpdated(next);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setReissuing(false);
    }
  };
  if (!token && status === "draft") return null;
  const link = token ? `${window.location.origin}/client/${token}` : "";
  return (
    <div className="share-link">
      <div>
        <span className="micro-label">CLIENT REVIEW LINK</span>
        <strong>
          {token
            ? link.replace(window.location.origin, "")
            : "No active link on this workspace view"}
        </strong>
        {!token && (
          <p className="share-warning">
            Create a fresh link to share this document. This revokes the
            previous link.
          </p>
        )}
      </div>
      {token ? (
        <button
          className="secondary-button"
          onClick={() => {
            navigator.clipboard?.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy link"}
        </button>
      ) : (
        <button
          className="secondary-button"
          disabled={reissuing}
          onClick={reissue}
        >
          {reissuing ? (
            <LoaderCircle className="spin" size={14} />
          ) : (
            <Link2 size={14} />
          )}
          {reissuing ? "Creating…" : "Create fresh review link"}
        </button>
      )}
      {error && (
        <div className="inline-message error">
          <XCircle size={14} />
          {error}
        </div>
      )}
    </div>
  );
}
