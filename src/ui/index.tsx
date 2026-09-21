import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useHostContext, usePluginAction, usePluginData } from "@paperclipai/plugin-sdk/ui";
import { ACTIONS, DATA_KEYS } from "../constants.js";
import type { JevIssueAnalysis, ProbabilityEntry } from "../worker.js";

type IssueContextData = {
  issueId: string;
  title: string;
  status: string;
  priority: string;
  descriptionLength: number;
  configured: boolean;
  model: string;
  automationMode: "advisory" | "auto_confident" | "always_auto";
  disclosure: JevIssueAnalysis["disclosure"];
};

const UPDATED_EVENT = "zcz:jev-analysis-updated";

const buttonStyle: CSSProperties = {
  appearance: "none",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  background: "var(--background)",
  color: "inherit",
  padding: "6px 10px",
  fontSize: "12px",
  fontWeight: 600,
  cursor: "pointer",
};

const primaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "var(--foreground)",
  color: "var(--background)",
  borderColor: "var(--foreground)",
};

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  display: "grid",
  placeItems: "center",
  padding: "24px",
  background: "rgba(0, 0, 0, 0.55)",
};

const modalStyle: CSSProperties = {
  width: "min(640px, 100%)",
  maxHeight: "min(760px, calc(100vh - 48px))",
  overflowY: "auto",
  display: "grid",
  gap: "16px",
  border: "1px solid var(--border)",
  borderRadius: "14px",
  padding: "18px",
  background: "var(--background)",
  color: "var(--foreground)",
  boxShadow: "0 24px 80px rgba(0, 0, 0, 0.35)",
};

const mutedStyle: CSSProperties = {
  margin: 0,
  fontSize: "12px",
  lineHeight: 1.5,
  opacity: 0.72,
};

const gridStyle: CSSProperties = {
  display: "grid",
  gap: "10px",
};

const resultGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: "10px",
};

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatAutomationMode(value: IssueContextData["automationMode"]): string {
  if (value === "auto_confident") return "Auto when confident";
  if (value === "always_auto") return "Always auto";
  return "Advisory";
}

function getErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "Jev analysis failed.";
}

function SummaryCell({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "10px", padding: "10px" }}>
      <div style={{ ...mutedStyle, fontSize: "11px" }}>{label}</div>
      <strong style={{ display: "block", marginTop: "3px", fontSize: "13px" }}>{value}</strong>
      {detail ? <div style={{ ...mutedStyle, marginTop: "3px", fontSize: "11px" }}>{detail}</div> : null}
    </div>
  );
}

function ProbabilityList({ entries }: { entries: ProbabilityEntry[] }) {
  return (
    <div style={{ display: "grid", gap: "5px" }}>
      {entries.slice(0, 4).map((entry) => (
        <div key={entry.value} style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "11px" }}>
          <span>{entry.label}</span>
          <span style={{ fontVariantNumeric: "tabular-nums", opacity: 0.75 }}>{formatPercent(entry.probability)}</span>
        </div>
      ))}
    </div>
  );
}

function AnalysisResult({ analysis }: { analysis: JevIssueAnalysis }) {
  const automated = analysis.automation.trigger === "issue.created";
  const automationMessage = automated
    ? analysis.automation.appliedFields.length > 0
      ? `Automatically updated: ${analysis.automation.appliedFields.join(", ")}.`
      : "Automatic analysis completed without changing issue fields."
    : "Manual analysis is advisory only. No issue fields were changed.";

  return (
    <div style={gridStyle}>
      <div style={resultGridStyle}>
        <SummaryCell label="Suggested owner" value={analysis.owner.name} detail={`${formatPercent(analysis.owner.confidence)} confidence`} />
        <SummaryCell label="Suggested priority" value={analysis.priority.value} detail={`${formatPercent(analysis.priority.confidence)} confidence`} />
        <SummaryCell label="Issue type" value={analysis.issueType.value} detail={`${formatPercent(analysis.issueType.confidence)} confidence`} />
        <SummaryCell label="Needs more context" value={formatPercent(analysis.needsMoreContext)} />
        <SummaryCell label="Likely blocked" value={formatPercent(analysis.likelyBlocked)} />
      </div>
      <details>
        <summary style={{ cursor: "pointer", fontSize: "12px", fontWeight: 600 }}>Owner probabilities</summary>
        <div style={{ marginTop: "8px" }}>
          <ProbabilityList entries={analysis.owner.probabilities} />
        </div>
      </details>
      <div style={mutedStyle}>
        {automationMessage} Mode: {analysis.automation.mode}. Model: {analysis.model}. Analyzed: {new Date(analysis.analyzedAt).toLocaleString()}.
      </div>
      {analysis.automation.skippedReasons.length > 0 && automated ? (
        <div style={mutedStyle}>{analysis.automation.skippedReasons.join(" ")}</div>
      ) : null}
    </div>
  );
}

export function JevAnalyzeButton() {
  const context = useHostContext();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<JevIssueAnalysis | null>(null);
  const analyze = usePluginAction(ACTIONS.analyzeIssue);
  const params = useMemo(() => ({
    companyId: context.companyId ?? "",
    issueId: context.entityId ?? "",
  }), [context.companyId, context.entityId]);
  const issueContext = usePluginData<IssueContextData>(DATA_KEYS.issueContext, params);

  if (context.entityType !== "issue" || !context.companyId || !context.entityId) return null;

  async function runAnalysis() {
    setRunning(true);
    setError(null);
    try {
      const result = await analyze(params) as JevIssueAnalysis;
      setAnalysis(result);
      window.dispatchEvent(new CustomEvent(UPDATED_EVENT, { detail: { issueId: context.entityId } }));
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <button type="button" style={buttonStyle} onClick={() => setOpen(true)}>
        Analyze with Jev
      </button>
      {open ? (
        <div style={overlayStyle} role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !running) setOpen(false);
        }}>
          <div style={modalStyle} role="dialog" aria-modal="true" aria-label="Analyze issue with Jev">
            <div>
              <h2 style={{ margin: 0, fontSize: "18px" }}>Analyze issue with Jev</h2>
              <p style={{ ...mutedStyle, marginTop: "6px" }}>
                This sends a minimized issue snapshot to the official TypeSafe API and returns advisory routing signals from Jev.
              </p>
            </div>

            {issueContext.loading ? <div style={mutedStyle}>Loading issue context...</div> : null}
            {issueContext.error ? <div style={{ color: "var(--destructive, #dc2626)", fontSize: "12px" }}>{issueContext.error.message}</div> : null}
            {issueContext.data ? (
              <div style={gridStyle}>
                <div style={{ border: "1px solid var(--border)", borderRadius: "10px", padding: "12px" }}>
                  <strong style={{ fontSize: "13px" }}>{issueContext.data.title}</strong>
                  <div style={{ ...mutedStyle, marginTop: "5px" }}>
                    Status: {issueContext.data.status} · Priority: {issueContext.data.priority} · Description: {issueContext.data.descriptionLength} characters
                  </div>
                  <div style={{ ...mutedStyle, marginTop: "5px" }}>
                    Automation mode: {formatAutomationMode(issueContext.data.automationMode)}
                  </div>
                </div>
                <div>
                  <strong style={{ fontSize: "12px" }}>Data sent</strong>
                  <ul style={{ margin: "8px 0 0", paddingLeft: "18px", fontSize: "12px", lineHeight: 1.55 }}>
                    <li>Issue title, description, status, and priority</li>
                    <li>{issueContext.data.disclosure.agentCount} eligible agent names, roles, titles, statuses, and capabilities</li>
                  </ul>
                </div>
                <div>
                  <strong style={{ fontSize: "12px" }}>Data not sent</strong>
                  <ul style={{ margin: "8px 0 0", paddingLeft: "18px", fontSize: "12px", lineHeight: 1.55 }}>
                    <li>Comments, attachments, run logs, workspace files, and credentials</li>
                  </ul>
                </div>
                {!issueContext.data.configured ? (
                  <div style={{ border: "1px solid #d97706", borderRadius: "10px", padding: "10px", fontSize: "12px" }}>
                    Configure a company-scoped TypeSafe API key in the plugin settings before running analysis.
                  </div>
                ) : null}
              </div>
            ) : null}

            {error ? <div role="alert" style={{ color: "var(--destructive, #dc2626)", fontSize: "12px" }}>{error}</div> : null}
            {analysis ? <AnalysisResult analysis={analysis} /> : null}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button type="button" style={buttonStyle} disabled={running} onClick={() => setOpen(false)}>
                Close
              </button>
              <button
                type="button"
                style={primaryButtonStyle}
                disabled={running || issueContext.loading || !issueContext.data?.configured}
                onClick={() => void runAnalysis()}
              >
                {running ? "Analyzing..." : analysis ? "Analyze again" : "Confirm and analyze"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function JevAnalysisCard() {
  const context = useHostContext();
  const params = useMemo(() => ({ issueId: context.entityId ?? "" }), [context.entityId]);
  const latest = usePluginData<JevIssueAnalysis | null>(DATA_KEYS.latestAnalysis, params);

  useEffect(() => {
    const handleUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ issueId?: string }>).detail;
      if (detail?.issueId === context.entityId) void latest.refresh();
    };
    window.addEventListener(UPDATED_EVENT, handleUpdate);
    return () => window.removeEventListener(UPDATED_EVENT, handleUpdate);
  }, [context.entityId, latest.refresh]);

  if (context.entityType !== "issue" || !context.entityId) return null;
  if (latest.loading) return <div style={mutedStyle}>Loading Jev analysis...</div>;
  if (latest.error) return <div style={{ color: "var(--destructive, #dc2626)", fontSize: "12px" }}>{latest.error.message}</div>;
  if (!latest.data) {
    return (
      <div style={mutedStyle}>
        No Jev analysis yet. Use the Analyze with Jev button above to generate advisory triage signals.
      </div>
    );
  }

  return (
    <div style={gridStyle}>
      <strong style={{ fontSize: "13px" }}>Jev analysis</strong>
      <AnalysisResult analysis={latest.data} />
    </div>
  );
}
