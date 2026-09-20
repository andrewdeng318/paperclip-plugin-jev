export const PLUGIN_ID = "zcz.jev-triage";
export const PLUGIN_VERSION = "0.2.0";

export const ACTIONS = {
  analyzeIssue: "analyze-issue",
} as const;

export const DATA_KEYS = {
  issueContext: "issue-context",
  latestAnalysis: "latest-analysis",
} as const;

export const SLOT_IDS = {
  toolbarButton: "jev-analyze-issue",
  taskDetailView: "jev-analysis-card",
} as const;

export const EXPORT_NAMES = {
  toolbarButton: "JevAnalyzeButton",
  taskDetailView: "JevAnalysisCard",
} as const;

export const STATE_NAMESPACE = "jev-triage";
export const STATE_KEY = "latest-analysis";
export const AUTO_STATE_KEY = "auto-analysis";
export const DEFAULT_MODEL = "jev-latest";
export const DEFAULT_AUTOMATION_MODE = "advisory";
export const DEFAULT_OWNER_CONFIDENCE_THRESHOLD = 0.8;
export const DEFAULT_PRIORITY_CONFIDENCE_THRESHOLD = 0.7;
export const DEFAULT_CONTEXT_THRESHOLD = 0.7;
export const MAX_DESCRIPTION_LENGTH = 6_000;
export const MAX_CAPABILITIES_LENGTH = 1_000;
export const MAX_AGENT_CANDIDATES = 64;
