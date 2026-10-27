import { useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  Activity,
  ArrowUpRight,
  Banknote,
  BarChart3,
  Brackets,
  Check,
  ChevronDown,
  ClipboardList,
  ExternalLink,
  FilePlus2,
  HelpCircle,
  Info,
  LayoutDashboard,
  LoaderCircle,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from "lucide-react";
import type {
  ChangeAnalysis,
  ScopeProject,
  ScopeDocument,
  Workspace,
} from "@shared/scopepay";
import { DocumentEditor, ShareLink } from "./DocumentEditor";
import { ScopePayApiError, scopepayApi } from "../../lib/scopepay-api";
import { safeSandboxApprovalUrl } from "../../lib/paypal-safety";
import {
  EmptyState,
  errorMessage,
  formatDate,
  formatMoney,
  formatTime,
  Logo,
  StatusPill,
} from "./shared";

export function Shell({
  children,
  project,
  workspace,
  onNew,
  onSample,
  onReload,
  loading,
  activeSection,
  setActiveSection,
}: {
  children: React.ReactNode;
  project?: ScopeProject;
  workspace: Workspace | null;
  onNew: () => void;
  onSample: () => void;
  onReload: () => void;
  loading?: boolean;
  activeSection: string;
  setActiveSection: (value: string) => void;
}) {
  const [railOpen, setRailOpen] = useState(false);
  const [, navigate] = useLocation();
  const links = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "scope", label: "Scope", icon: ClipboardList },
    { id: "changes", label: "Change requests", icon: MessageSquareText },
    { id: "payments", label: "Payments", icon: WalletCards },
    { id: "activity", label: "Activity", icon: Activity },
  ];
  return (
    <div className="app-shell">
      <aside className={`left-rail ${railOpen ? "rail-open" : ""}`}>
        <div className="rail-top">
          <Logo />
          <button
            className="icon-button rail-toggle"
            onClick={() => setRailOpen(!railOpen)}
            aria-label={railOpen ? "Close navigation" : "Open navigation"}
          >
            {railOpen ? (
              <PanelLeftClose size={17} />
            ) : (
              <PanelLeftOpen size={17} />
            )}
          </button>
        </div>
        <div className="workspace-switcher">
          <span className="workspace-avatar">A</span>
          <span className="workspace-name">
            Aster Studio<small>Personal workspace</small>
          </span>
          <ChevronDown size={14} />
        </div>
        <nav className="rail-nav" aria-label="Workspace navigation">
          {links.map(link => (
            <button
              key={link.id}
              className={`rail-link ${activeSection === link.id ? "active" : ""}`}
              onClick={() => {
                setActiveSection(link.id);
                setRailOpen(false);
              }}
            >
              <link.icon size={17} />
              <span>{link.label}</span>
              {link.id === "changes" && project?.analyses?.length ? (
                <b>{project.analyses.length}</b>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="rail-spacer" />
        <div className="rail-note">
          <div className="rail-note-icon">
            <ShieldCheck size={16} />
          </div>
          <span>
            <strong>Sandbox only</strong>USD demo merchant
          </span>
        </div>
        <button className="rail-link" onClick={() => navigate("/setup")}>
          <Settings2 size={17} />
          <span>Setup & status</span>
        </button>
        <button
          className="rail-link"
          onClick={() =>
            alert(
              "ScopePay keeps the brief, approvals, and payment trail together. AI suggestions are advisory and never move money without explicit client approval."
            )
          }
        >
          <HelpCircle size={17} />
          <span>How it works</span>
        </button>
        <div className="rail-footer">
          <span className="avatar avatar-dark">AS</span>
          <span className="profile-copy">
            Aster Studio<small>Owner</small>
          </span>
          <MoreHorizontal size={16} />
        </div>
      </aside>
      <main className="main-shell">
        <header className="mobile-header">
          <button
            className="icon-button"
            onClick={() => setRailOpen(!railOpen)}
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>
          <Logo />
          <button
            className="icon-button"
            onClick={onReload}
            aria-label="Refresh workspace"
          >
            <RefreshCw size={17} />
          </button>
        </header>
        <div className="content-wrap">
          <div className="topline">
            <div className="eyebrow">
              <span className="eyebrow-line" /> WORKSPACE /{" "}
              {project ? "PROJECT" : "START"}
            </div>
            <div className="topline-actions">
              <button className="quiet-button" onClick={onSample}>
                <Sparkles size={15} />
                Load sample project
              </button>
              <button className="primary-button small" onClick={onNew}>
                <Plus size={16} />
                New project
              </button>
            </div>
          </div>
          {loading && (
            <div className="global-loading">
              <LoaderCircle size={15} className="spin" /> Syncing workspace
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}

export function ProjectHeader({
  project,
  onSelect,
  projects,
  onReload,
}: {
  project?: ScopeProject;
  onSelect: (id: string) => void;
  projects: ScopeProject[];
  onReload: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (!project)
    return (
      <section className="project-header empty-project-header">
        <div>
          <div className="eyebrow">GOOD WORK STARTS WITH CLEAR SCOPE</div>
          <h1>Your next project, made explicit.</h1>
          <p>
            Create a real workspace or load the fictional preview to see
            ScopePay in motion.
          </p>
        </div>
        <div className="header-mark">
          <Brackets size={76} strokeWidth={1} />
        </div>
      </section>
    );
  return (
    <section className="project-header">
      <div className="project-heading">
        <div className="project-index">
          01{" "}
          <span>/ {String(Math.max(projects.length, 1)).padStart(2, "0")}</span>
        </div>
        <div className="project-title-wrap">
          <div className="eyebrow">
            ACTIVE PROJECT{" "}
            <span className="sample-chip">
              {project.isSample ? "FICTIONAL SAMPLE" : "LIVE WORKSPACE"}
            </span>
          </div>
          <div className="project-selector-wrap">
            <button
              className="project-selector"
              onClick={() => setOpen(!open)}
              aria-expanded={open}
            >
              {project.name}
              <ChevronDown size={18} />
            </button>
            {open && (
              <div className="project-menu">
                {projects.map(item => (
                  <button
                    key={item.id}
                    onClick={() => {
                      onSelect(item.id);
                      setOpen(false);
                    }}
                  >
                    <span className="project-menu-avatar">
                      {item.clientName.slice(0, 1)}
                    </span>
                    <span>
                      {item.name}
                      <small>{item.clientName}</small>
                    </span>
                    {item.id === project.id && <Check size={15} />}
                  </button>
                ))}
                <div className="menu-rule" />
                <button
                  onClick={() => {
                    setOpen(false);
                    onReload();
                  }}
                >
                  <RefreshCw size={14} />
                  Refresh projects
                </button>
              </div>
            )}
          </div>
          <p className="project-subtitle">
            {project.clientName} <span>·</span> Created{" "}
            {formatDate(project.createdAt)}
          </p>
        </div>
      </div>
      <div className="header-right">
        <StatusPill
          status={project.quote.status}
          label={
            project.quote.status === "draft"
              ? "Draft scope"
              : project.quote.status === "paid"
                ? "Paid"
                : project.quote.status.replace("_", " ")
          }
        />
        <div className="header-total">
          <small>Current quote</small>
          <strong>{formatMoney(project.quote.totalCents)}</strong>
        </div>
      </div>
    </section>
  );
}

export function ProgressStrip({ project }: { project: ScopeProject }) {
  const stages = [
    { label: "Brief", done: true },
    { label: "Scope", done: project.quote.status !== "draft" },
    {
      label: "Approved",
      done: ["accepted", "payment_pending", "paid"].includes(
        project.quote.status
      ),
    },
    { label: "Paid", done: project.quote.status === "paid" },
  ];
  return (
    <div className="progress-strip">
      <div className="progress-label">
        SCOPE TO PAYMENT <span>·</span>{" "}
        {project.quote.status === "draft"
          ? "Shape the work before it travels."
          : "The published record stays visible."}
      </div>
      <div className="progress-steps">
        {stages.map((stage, index) => (
          <div
            className={`progress-step ${stage.done ? "done" : ""}`}
            key={stage.label}
          >
            <span className="step-number">
              {stage.done ? (
                <Check size={12} strokeWidth={3} />
              ) : (
                `0${index + 1}`
              )}
            </span>
            <span>{stage.label}</span>
            {index < stages.length - 1 && <span className="step-rule" />}
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatGrid({ project }: { project: ScopeProject }) {
  const hours = project.quote.deliverables.reduce(
    (sum, item) => sum + item.hours,
    0
  );
  const paidChanges = project.changes
    .filter(change => change.status === "paid")
    .reduce((sum, change) => sum + change.totalCents, 0);
  return (
    <div className="stat-grid">
      <div className="stat-card">
        <span className="stat-label">SCOPE VALUE</span>
        <strong>{formatMoney(project.quote.totalCents)}</strong>
        <small>
          {project.quote.deliverables.length} deliverables · {hours} hrs
        </small>
      </div>
      <div className="stat-card">
        <span className="stat-label">APPROVAL</span>
        <strong>
          {project.quote.status === "accepted" ||
          project.quote.status === "paid"
            ? "Approved"
            : "Awaiting"}
        </strong>
        <small>
          {project.quote.acceptedAt
            ? formatDate(project.quote.acceptedAt)
            : "Client review link not accepted"}
        </small>
      </div>
      <div className="stat-card">
        <span className="stat-label">EXTRA WORK</span>
        <strong>{formatMoney(paidChanges)}</strong>
        <small>
          {project.changes.length} change{" "}
          {project.changes.length === 1 ? "order" : "orders"}
        </small>
      </div>
    </div>
  );
}
export function ActivityList({ project }: { project: ScopeProject }) {
  if (!project.audit.length)
    return (
      <EmptyState icon={Activity} title="No activity yet">
        Your project ledger will show scope edits, publish events, approvals,
        and verified captures here.
      </EmptyState>
    );
  return (
    <div className="activity-list">
      {project.audit.map(event => (
        <div className="activity-item" key={event.id}>
          <span className="activity-dot" />
          <div>
            <strong>{event.message}</strong>
            <small>
              {formatTime(event.at)} · {event.type.replaceAll("_", " ")}
            </small>
          </div>
        </div>
      ))}
    </div>
  );
}

export function PaymentsPanel({
  project,
  onReload,
  onProject,
}: {
  project: ScopeProject;
  onReload: () => void;
  onProject: (project: ScopeProject) => void;
}) {
  const docs = [project.quote, ...project.changes];
  const [recoveryDocumentId, setRecoveryDocumentId] = useState<string | null>(
    null
  );
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [reissuingId, setReissuingId] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<Record<string, string>>(
    {}
  );
  const [recoveryStopped, setRecoveryStopped] = useState<
    Record<string, boolean>
  >({});
  const [approvalLinks, setApprovalLinks] = useState<Record<string, string>>(
    {}
  );
  const [reissuedLinks, setReissuedLinks] = useState<Record<string, boolean>>(
    {}
  );
  const recoveryInFlight = useRef(new Set<string>());
  const recover = async (document: ScopeDocument) => {
    const recoveryKey = `${document.id}:${document.version}`;
    if (
      !confirmed[document.id] ||
      recoveryInFlight.current.has(recoveryKey) ||
      reissuedLinks[document.id] ||
      recoveryStopped[document.id]
    )
      return;
    recoveryInFlight.current.add(recoveryKey);
    setReissuingId(document.id);
    setRecoveryError(current => ({ ...current, [document.id]: "" }));
    try {
      const result = await scopepayApi.reissueOrder(
        project.id,
        document.id,
        document.version
      );
      onProject(result.project);
      setReissuedLinks(current => ({ ...current, [document.id]: true }));
      const safeUrl = safeSandboxApprovalUrl(result.approvalUrl);
      setApprovalLinks(current => ({
        ...current,
        [document.id]: safeUrl ?? "",
      }));
      if (!safeUrl)
        setRecoveryError(current => ({
          ...current,
          [document.id]:
            "The replacement order was prepared, but no valid Sandbox approval URL was returned. Use the fresh same-version review link below to continue; do not create another replacement.",
        }));
    } catch (error) {
      setRecoveryError(current => ({
        ...current,
        [document.id]:
          error instanceof ScopePayApiError
            ? `${errorMessage(error)} Recovery is paused. Reload this page and check merchant Activity and the ledger before another attempt.`
            : "Recovery status is unknown. Stop—do not create another replacement order. Reload the workspace and check Sandbox Activity using the configured Sandbox Business merchant before continuing.",
      }));
      setRecoveryStopped(current => ({ ...current, [document.id]: true }));
    } finally {
      recoveryInFlight.current.delete(recoveryKey);
      setReissuingId(null);
      setConfirmed(current => ({ ...current, [document.id]: false }));
    }
  };
  return (
    <section className="panel payments-panel">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">PAYMENT LEDGER</div>
          <h2>Approval before payment</h2>
          <p className="panel-intro">
            Every amount below is calculated and recorded by the backend.
            ScopePay never marks a payment paid from the browser.
          </p>
        </div>
        <button className="secondary-button" onClick={onReload}>
          <RefreshCw size={15} />
          Refresh status
        </button>
      </div>
      <div className="payment-ledger">
        <div className="payment-ledger-head">
          <span>DOCUMENT</span>
          <span>AMOUNT</span>
          <span>STATUS</span>
          <span>LAST EVENT</span>
        </div>
        {docs.map(document => {
          const canRecover =
            (document.status === "accepted" ||
              document.status === "payment_pending") &&
            Boolean(document.paypalOrderId) &&
            !document.paypalCaptureId;
          const recoveryOpen = recoveryDocumentId === document.id;
          const recoverySucceeded = Boolean(reissuedLinks[document.id]);
          const recoveryIsStopped = Boolean(recoveryStopped[document.id]);
          return (
            <div className="payment-row" key={document.id}>
              <div>
                <strong>{document.title}</strong>
                <small>
                  Version {document.version} ·{" "}
                  {document.kind === "quote" ? "Quote" : "Change order"}
                </small>
              </div>
              <strong className="mono">
                {formatMoney(document.totalCents)}
              </strong>
              <StatusPill status={document.status} />
              <span className="payment-event">
                {document.paidAt
                  ? `Paid ${formatDate(document.paidAt)}`
                  : document.acceptedAt
                    ? `Accepted ${formatDate(document.acceptedAt)}`
                    : document.status === "published"
                      ? "Awaiting client"
                      : "Draft only"}
              </span>
              {canRecover && (
                <div className="payment-row-recovery">
                  <button
                    className="text-button recovery-reveal"
                    aria-expanded={recoveryOpen}
                    aria-controls={`payment-recovery-${document.id}`}
                    onClick={() => {
                      setRecoveryDocumentId(recoveryOpen ? null : document.id);
                      setRecoveryError(current => ({
                        ...current,
                        [document.id]: "",
                      }));
                    }}
                  >
                    {recoveryOpen
                      ? "Hide recovery options"
                      : "Show recovery options"}
                  </button>
                  {recoveryOpen && (
                    <div
                      id={`payment-recovery-${document.id}`}
                      className="payment-recovery"
                    >
                      <p>
                        Recovery is for this exact accepted record only. It does
                        not capture payment, charge a buyer, or change the
                        accepted terms.
                      </p>
                      <p>
                        <strong>
                          Recover: {document.title} · Version {document.version}{" "}
                          · {formatMoney(document.totalCents)}
                        </strong>
                      </p>
                      <p>
                        <strong>
                          1. Check the configured Sandbox merchant first.
                        </strong>
                      </p>
                      <ol>
                        <li>
                          Sign in safely at{" "}
                          <a
                            href="https://www.sandbox.paypal.com/"
                            target="_blank"
                            rel="noopener noreferrer"
                            referrerPolicy="no-referrer"
                          >
                            PayPal Sandbox
                          </a>{" "}
                          with the configured Sandbox Business merchant account,
                          not the Personal Sandbox buyer account.
                        </li>
                        <li>
                          Open Activity and look for this exact record:{" "}
                          <strong>
                            {formatMoney(document.totalCents)} · Version{" "}
                            {document.version}
                          </strong>
                          .
                        </li>
                        <li>
                          If Activity shows the record as completed, pending, or
                          unknown, stop. Do not create a replacement; refresh
                          this workspace and verify the provider status first.
                        </li>
                      </ol>
                      <label className="recovery-check">
                        <input
                          type="checkbox"
                          checked={Boolean(confirmed[document.id])}
                          disabled={recoverySucceeded || recoveryIsStopped}
                          onChange={event =>
                            setConfirmed(current => ({
                              ...current,
                              [document.id]: event.target.checked,
                            }))
                          }
                        />
                        <span>
                          <strong>Required confirmation:</strong> I checked the
                          configured Sandbox Business merchant Activity and
                          confirmed that this exact record has no completed,
                          pending, or unknown payment.
                        </span>
                      </label>
                      <button
                        className="primary-button recovery-button"
                        disabled={
                          !confirmed[document.id] ||
                          reissuingId === document.id ||
                          recoverySucceeded ||
                          recoveryIsStopped
                        }
                        onClick={() => void recover(document)}
                      >
                        {reissuingId === document.id ? (
                          <LoaderCircle size={14} className="spin" />
                        ) : null}
                        {reissuingId === document.id
                          ? "Preparing new Sandbox order…"
                          : recoverySucceeded
                            ? "Replacement already prepared"
                            : "Create replacement Sandbox order"}
                      </button>
                      {recoveryError[document.id] && (
                        <div className="inline-message error">
                          <span>{recoveryError[document.id]}</span>
                        </div>
                      )}
                      {recoveryIsStopped && (
                        <p role="status">
                          Recovery is paused. Reload this page, check the ledger
                          and merchant Sandbox Activity, and do not create
                          another attempt while status is uncertain.
                        </p>
                      )}
                      {recoverySucceeded && (
                        <div className="inline-message">
                          <span>
                            Replacement Sandbox order prepared. It is not paid:
                            ScopePay must verify the provider capture before any
                            payment is recorded.
                          </span>
                        </div>
                      )}
                      {approvalLinks[document.id] && (
                        <a
                          className="paypal-continue-link"
                          href={approvalLinks[document.id]}
                          target="_blank"
                          rel="noopener noreferrer"
                          referrerPolicy="no-referrer"
                        >
                          Continue to PayPal <ExternalLink size={14} />
                        </a>
                      )}
                      {recoverySucceeded && (
                        <div className="recovery-client-link">
                          <p>
                            Next: send the fresh same-version
                            review/continuation link below to the buyer. The
                            buyer must approve it with the Personal Sandbox
                            buyer account. Payment is complete only after the
                            provider capture is verified by ScopePay.
                          </p>
                          <ShareLink
                            token={document.clientToken}
                            status={document.status}
                            projectId={project.id}
                            documentId={document.id}
                            onUpdated={onProject}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="disclaimer">
        <ShieldCheck size={16} />
        <span>
          <strong>Sandbox-only USD demo merchant.</strong> PayPal credentials
          and readiness are shown in Setup & status. No escrow, no live money,
          no fabricated success.
        </span>
      </div>
    </section>
  );
}

export function Overview({
  project,
  onProject,
  onReload,
  setSection,
}: {
  project: ScopeProject;
  onProject: (project: ScopeProject) => void;
  onReload: () => void;
  setSection: (section: string) => void;
}) {
  const latest = project.analyses[project.analyses.length - 1];
  return (
    <>
      <ProgressStrip project={project} />
      <StatGrid project={project} />
      <div className="workspace-grid">
        <div>
          <DocumentEditor
            project={project}
            document={project.quote}
            kind="quote"
            onSaved={onProject}
          />
          <ShareLink
            token={project.quote.clientToken}
            status={project.quote.status}
            projectId={project.id}
            documentId={project.quote.id}
            onUpdated={onProject}
          />
        </div>
        <div className="side-stack">
          <div className="panel brief-panel">
            <div className="eyebrow">ORIGINAL BRIEF</div>
            <h3>{project.clientName}</h3>
            <p>{project.brief}</p>
            <div className="brief-footer">
              <span>
                <BarChart3 size={14} /> Rate{" "}
                {formatMoney(project.hourlyRateCents)}/hr
              </span>
              {project.budgetCents ? (
                <span>
                  <Banknote size={14} /> Budget{" "}
                  {formatMoney(project.budgetCents)}
                </span>
              ) : null}
            </div>
          </div>
          <div className="panel prompt-panel">
            <div className="prompt-icon">
              <MessageSquareText size={18} />
            </div>
            <div>
              <strong>Received extra work?</strong>
              <p>Compare it with the approved scope before you reply.</p>
              <button
                className="text-button"
                onClick={() => setSection("changes")}
              >
                Analyze a request <ArrowUpRight size={14} />
              </button>
            </div>
          </div>
          <div className="panel privacy-panel">
            <Info size={15} />
            <span>
              Use fictional or non-sensitive client details in this prototype.
              AI suggestions are advisory, not legal advice.
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
