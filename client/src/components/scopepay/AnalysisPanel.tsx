import { useEffect, useState } from "react";
import {
  Check,
  Clock3,
  FilePlus2,
  LoaderCircle,
  Sparkles,
  XCircle,
} from "lucide-react";
import type { ChangeAnalysis, ScopeProject } from "@shared/scopepay";
import { scopepayApi } from "../../lib/scopepay-api";
import { errorMessage, Field, StatusPill } from "./shared";

export function AnalysisPanel({
  project,
  onProject,
  initialAnalysis,
  onCreateChange,
}: {
  project: ScopeProject;
  onProject: (project: ScopeProject) => void;
  initialAnalysis?: ChangeAnalysis;
  onCreateChange: (analysis: ChangeAnalysis) => Promise<void> | void;
}) {
  const [request, setRequest] = useState("");
  const [analysis, setAnalysis] = useState<ChangeAnalysis | undefined>(
    initialAnalysis
  );
  const [loading, setLoading] = useState(false);
  const [creatingChange, setCreatingChange] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (initialAnalysis) setAnalysis(initialAnalysis);
  }, [initialAnalysis]);
  const analyze = async () => {
    if (!request.trim()) return;
    setLoading(true);
    setMessage("");
    try {
      const result = await scopepayApi.analyze(project.id, request.trim());
      onProject(result.project);
      setAnalysis(result.analysis);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };
  const createChange = async () => {
    if (
      !analysis ||
      creatingChange ||
      analysis.suggestedDeliverables.length === 0
    )
      return;
    setCreatingChange(true);
    setMessage("");
    try {
      await onCreateChange(analysis);
    } finally {
      setCreatingChange(false);
    }
  };
  const scopeReference =
    analysis?.scopeStatus === "draft"
      ? "CURRENT DRAFT REFERENCE · NOT CLIENT-APPROVED"
      : analysis?.scopeStatus
        ? `CURRENT ${analysis.scopeStatus.replaceAll("_", " ").toUpperCase()} REFERENCE`
        : "SCOPE REFERENCE";
  return (
    <section className="panel analysis-panel">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">SCOPE INTELLIGENCE</div>
          <h2>When the brief changes</h2>
          <p className="panel-intro">
            Ask AI to compare a new request against the approved scope. It
            advises; you decide.
          </p>
        </div>
        <Sparkles className="panel-spark" size={22} />
      </div>
      <div className="analysis-input">
        <textarea
          aria-label="Client request to analyze"
          rows={4}
          value={request}
          onChange={e => setRequest(e.target.value)}
          placeholder="Paste a client request, for example: Can we add a second landing page for the launch?"
        />{" "}
        <div className="analysis-input-footer">
          <div className="preset-row">
            <span>Try a preset</span>
            <button
              onClick={() =>
                setRequest(
                  "Could we add a second mobile landing page for the launch campaign?"
                )
              }
            >
              Second page
            </button>
            <button
              onClick={() =>
                setRequest(
                  "Can you also connect the signup form to our newsletter tool?"
                )
              }
            >
              Newsletter integration
            </button>
            <button
              onClick={() =>
                setRequest(
                  "Can we swap the headline and hero image before launch?"
                )
              }
            >
              Small revision
            </button>
          </div>
          <button
            className="primary-button"
            disabled={loading || !request.trim()}
            onClick={analyze}
          >
            {loading ? (
              <>
                <LoaderCircle size={15} className="spin" />
                Analyzing…
              </>
            ) : (
              <>
                <Sparkles size={15} />
                Analyze request
              </>
            )}
          </button>
        </div>
      </div>
      {message && (
        <div className="inline-message error">
          <XCircle size={14} />
          {message}
        </div>
      )}
      {analysis && (
        <div className="analysis-result">
          <div className="analysis-verdict">
            <div>
              <span className="micro-label">
                AI VERDICT · ADVISORY · {scopeReference}
              </span>
              <h3>
                <StatusPill
                  status={analysis.verdict}
                  label={analysis.verdict.replaceAll("_", " ")}
                />
              </h3>
            </div>
            <span className="analysis-model">{analysis.model}</span>
          </div>
          <p className="analysis-summary">{analysis.summary}</p>
          <div className="evidence-list">
            {analysis.items.map((item, index) => (
              <div
                className="evidence-item"
                key={`${item.requestItem}-${index}`}
              >
                <span
                  className={`evidence-icon evidence-${item.classification}`}
                >
                  <Check size={13} />
                </span>
                <div>
                  <strong>{item.requestItem}</strong>
                  <p>{item.evidence}</p>
                </div>
                <span className="mono">{item.suggestedHours}h</span>
              </div>
            ))}
          </div>
          <Field label="SUGGESTED REPLY · EDIT BEFORE SENDING">
            <textarea
              rows={4}
              value={analysis.suggestedReply}
              onChange={e =>
                setAnalysis({ ...analysis, suggestedReply: e.target.value })
              }
            />
          </Field>
          <div className="analysis-foot">
            <span>
              <Clock3 size={14} />
              {analysis.totalSuggestedHours === 0
                ? "Estimate needed · not a price"
                : ` ${analysis.totalSuggestedHours} suggested hours · not a price`}
            </span>
            <button
              className="secondary-button"
              disabled={
                creatingChange || !analysis.suggestedDeliverables.length
              }
              onClick={createChange}
            >
              {creatingChange ? (
                <LoaderCircle className="spin" size={15} />
              ) : (
                <FilePlus2 size={15} />
              )}
              {creatingChange
                ? "Creating…"
                : analysis.suggestedDeliverables.length
                  ? "Create change order"
                  : "No extra work found"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
