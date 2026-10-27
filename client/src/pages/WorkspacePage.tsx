import { useCallback, useEffect, useState } from "react";
import {
  Brackets,
  FilePlus2,
  Info,
  LoaderCircle,
  Plus,
  RefreshCw,
  Sparkles,
  XCircle,
} from "lucide-react";
import type {
  SampleScenarioId,
  ScopeProject,
  ServiceStatus,
  Workspace,
} from "@shared/scopepay";
import { scopepayApi } from "../lib/scopepay-api";
import { AnalysisPanel } from "../components/scopepay/AnalysisPanel";
import {
  DocumentEditor,
  ShareLink,
} from "../components/scopepay/DocumentEditor";
import {
  HelpDialog,
  NewProjectDialog,
  SampleScenarioDialog,
} from "../components/scopepay/Dialogs";
import { errorMessage } from "../components/scopepay/shared";
import {
  ActivityList,
  Overview,
  PaymentsPanel,
  ProjectHeader,
  Shell,
} from "../components/scopepay/WorkspaceComponents";

export function WorkspacePage() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [section, setSection] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showSamplePicker, setShowSamplePicker] = useState(false);
  const [loadingSample, setLoadingSample] = useState<SampleScenarioId | null>(
    null
  );
  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const [next, nextStatus] = await Promise.all([
        scopepayApi.ensureWorkspace(),
        scopepayApi.status().catch(() => null),
      ]);
      setWorkspace(next);
      setStatus(nextStatus);
      setSelectedId(current =>
        next.projects.some(project => project.id === current)
          ? current
          : (next.projects[0]?.id ?? "")
      );
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const project =
    workspace?.projects.find(item => item.id === selectedId) ??
    workspace?.projects[0];
  const updateProject = (next: ScopeProject) => {
    setWorkspace(current =>
      current
        ? {
            ...current,
            projects: current.projects.map(item =>
              item.id === next.id ? next : item
            ),
          }
        : current
    );
  };
  const createSample = async (scenario: SampleScenarioId) => {
    setLoading(true);
    setLoadingSample(scenario);
    setMessage("");
    try {
      const next = await scopepayApi.loadSampleProject(scenario);
      setWorkspace(current =>
        current
          ? {
              ...current,
              projects: [
                next,
                ...current.projects.filter(item => item.id !== next.id),
              ],
            }
          : { projects: [next] }
      );
      setSelectedId(next.id);
      setSection("overview");
      setShowSamplePicker(false);
    } catch (error) {
      setMessage(errorMessage(error));
      setShowSamplePicker(false);
    } finally {
      setLoadingSample(null);
      setLoading(false);
    }
  };
  const createProject = async (input: {
    name: string;
    clientName: string;
    brief: string;
    hourlyRateCents: number;
    budgetCents: number | null;
  }) => {
    setCreating(true);
    setMessage("");
    try {
      const next = await scopepayApi.createProject(input);
      setWorkspace(current =>
        current
          ? { ...current, projects: [next, ...current.projects] }
          : { projects: [next] }
      );
      setSelectedId(next.id);
      setShowNew(false);
      setSection("overview");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setCreating(false);
    }
  };
  return (
    <Shell
      project={project}
      workspace={workspace}
      onNew={() => setShowNew(true)}
      onSample={() => setShowSamplePicker(true)}
      onReload={load}
      loading={loading}
      activeSection={section}
      setActiveSection={setSection}
    >
      <ProjectHeader
        project={project}
        projects={workspace?.projects ?? []}
        onSelect={setSelectedId}
        onReload={load}
      />
      {message && (
        <div className="page-message error">
          <XCircle size={16} />
          {message}
          <button onClick={load}>Try again</button>
        </div>
      )}
      {status && (
        <div className="status-ribbon">
          <span>
            <span
              className={`readiness-dot ${status.aiConfigured ? "ready" : "not-ready"}`}
            />
            AI {status.aiConfigured ? "ready" : "needs setup"}
          </span>
          <span>
            <span
              className={`readiness-dot ${status.paypalConfigured ? "ready" : "not-ready"}`}
            />
            PayPal{" "}
            {status.paypalConfigured ? "sandbox ready" : "not configured"}
          </span>
          <button onClick={() => setShowHelp(true)}>
            What does this mean?
          </button>
        </div>
      )}
      {!project ? (
        <section className="empty-workspace">
          <div className="empty-workspace-mark">
            <Brackets size={58} strokeWidth={1} />
          </div>
          <span className="eyebrow">A QUIET PLACE TO START</span>
          <h2>Turn the next brief into approved, paid work.</h2>
          <p>
            ScopePay gives you a clear document to edit, a client link to
            approve, and an honest payment trail. Start with your own brief or
            explore the fictional preview.
          </p>
          <div className="empty-actions">
            <button className="primary-button" onClick={() => setShowNew(true)}>
              <Plus size={16} />
              Create a real project
            </button>
            <button
              className="secondary-button"
              onClick={() => setShowSamplePicker(true)}
            >
              <Sparkles size={16} />
              Choose Sandbox test scenario
            </button>
          </div>
          <small>
            Nothing is created until you choose an action. No fake revenue or
            approvals are shown.
          </small>
        </section>
      ) : section === "overview" ? (
        <Overview
          project={project}
          onProject={updateProject}
          onReload={load}
          setSection={setSection}
        />
      ) : section === "scope" ? (
        <div className="scope-section">
          <DocumentEditor
            project={project}
            document={project.quote}
            kind="quote"
            onSaved={updateProject}
          />
          <div className="panel scope-notes">
            <div className="eyebrow">SCOPE NOTES</div>
            <div className="notes-grid">
              <div>
                <span className="micro-label">TIMELINE</span>
                <strong>{project.quote.timeline || "To be confirmed"}</strong>
              </div>
              <div>
                <span className="micro-label">REVISIONS</span>
                <strong>
                  {project.quote.revisionLimit || "To be confirmed"}
                </strong>
              </div>
              <div>
                <span className="micro-label">SOURCE</span>
                <strong>
                  {project.quote.source === "sample"
                    ? "Fictional sample"
                    : project.quote.source === "live_ai"
                      ? "Live AI draft"
                      : "Manual"}
                </strong>
              </div>
            </div>
          </div>
        </div>
      ) : section === "changes" ? (
        <div className="changes-section">
          <AnalysisPanel
            project={project}
            onProject={updateProject}
            initialAnalysis={project.analyses[project.analyses.length - 1]}
            onCreateChange={async analysis => {
              try {
                const next = await scopepayApi.createChangeOrder(
                  project.id,
                  analysis.id
                );
                updateProject(next);
              } catch (error) {
                setMessage(errorMessage(error));
              }
            }}
          />
          {project.changes.length ? (
            <div className="change-docs">
              <div className="section-kicker">
                CHANGE ORDERS · {project.changes.length}
              </div>
              {project.changes.map(change => (
                <div key={change.id}>
                  <DocumentEditor
                    project={project}
                    document={change}
                    kind="change"
                    onSaved={updateProject}
                  />
                  <ShareLink
                    token={change.clientToken}
                    status={change.status}
                    projectId={project.id}
                    documentId={change.id}
                    onUpdated={updateProject}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="change-empty">
              <FilePlus2 size={18} />
              <span>
                No change orders created yet. AI analysis never prices or
                publishes one automatically.
              </span>
            </div>
          )}
        </div>
      ) : section === "payments" ? (
        <PaymentsPanel
          project={project}
          onReload={load}
          onProject={updateProject}
        />
      ) : (
        <section className="panel activity-panel">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">AUDIT TRAIL</div>
              <h2>What changed, when</h2>
            </div>
            <button className="secondary-button" onClick={load}>
              <RefreshCw size={15} />
              Refresh
            </button>
          </div>
          <ActivityList project={project} />
        </section>
      )}
      {showNew && (
        <NewProjectDialog
          onClose={() => setShowNew(false)}
          onSubmit={createProject}
          loading={creating}
        />
      )}
      {showSamplePicker && (
        <SampleScenarioDialog
          onClose={() => setShowSamplePicker(false)}
          onSelect={scenario => void createSample(scenario)}
          loadingScenario={loadingSample}
        />
      )}
      {showHelp && (
        <HelpDialog status={status} onClose={() => setShowHelp(false)} />
      )}
    </Shell>
  );
}
