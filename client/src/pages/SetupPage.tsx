import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Info,
  LoaderCircle,
  XCircle,
} from "lucide-react";
import type { ServiceStatus } from "@shared/scopepay";
import { scopepayApi } from "../lib/scopepay-api";
import { errorMessage, Logo } from "../components/scopepay/shared";

export function SetupPage() {
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  useEffect(() => {
    scopepayApi
      .status()
      .then(setStatus)
      .catch(error => setMessage(errorMessage(error)))
      .finally(() => setLoading(false));
  }, []);
  return (
    <div className="setup-page">
      <div className="setup-top">
        <Logo />
        <a href="/">
          Back to workspace <ArrowLeft size={15} />
        </a>
      </div>
      <div className="setup-content">
        <div className="eyebrow">SETUP & STATUS</div>
        <h1>Ready when the work is.</h1>
        <p className="setup-lede">
          A transparent view of the services behind your workspace. This
          prototype is intentionally account-free and sandbox-only.
        </p>
        {loading ? (
          <div className="setup-loading">
            <LoaderCircle className="spin" />
            Checking readiness…
          </div>
        ) : message ? (
          <div className="page-message error">
            <XCircle size={16} />
            {message}
          </div>
        ) : (
          status && (
            <div className="setup-grid">
              <SetupCard
                label="AI scope drafting"
                ready={status.aiConfigured}
                detail={
                  status.aiConfigured
                    ? `Live model · ${status.aiModel}`
                    : "The server needs an AI model configured before live drafting."
                }
              />
              <SetupCard
                label="PayPal checkout"
                ready={status.paypalConfigured}
                detail={
                  status.paypalConfigured
                    ? "Sandbox merchant · USD · capture enabled"
                    : "Add sandbox credentials to unlock the client checkout. No simulated success is shown."
                }
              />
              <SetupCard
                label="Workspace database"
                ready={status.databaseConfigured}
                detail={
                  status.databaseConfigured
                    ? "Persistent project and audit storage"
                    : "Database connection is not ready."
                }
              />
            </div>
          )
        )}
        <div className="setup-notice">
          <Info size={18} />
          <div>
            <strong>Prototype boundaries</strong>
            <p>
              Do not enter sensitive client data. ScopePay does not provide
              escrow, legal advice, autonomous purchases, or a guarantee of
              collection. All payment activity is USD sandbox activity.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
export function SetupCard({
  label,
  ready,
  detail,
}: {
  label: string;
  ready: boolean;
  detail: string;
}) {
  return (
    <div className="setup-card">
      <div className={`setup-icon ${ready ? "ready" : ""}`}>
        {ready ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
      </div>
      <div>
        <span className="micro-label">
          {ready ? "READY" : "NEEDS CONFIGURATION"}
        </span>
        <h3>{label}</h3>
        <p>{detail}</p>
      </div>
    </div>
  );
}
