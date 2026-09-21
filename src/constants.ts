export const PLUGIN_ID = "zcz.jev-triage";
export const PLUGIN_VERSION = "0.3.0";

export const ACTIONS = {
  analyzeIssue: "analyze-issue",
} as const;

export const TOOL_NAMES = {
  decideBrowserAction: "decide-browser-action",
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
export const DEFAULT_BROWSER_MODE = "observe";
export const DEFAULT_BROWSER_CONFIDENCE_THRESHOLD = 0.85;
export const DEFAULT_BROWSER_ALLOWED_ORIGINS = [
  "http://127.0.0.1:3100",
  "http://localhost:3100",
];
export const MAX_DESCRIPTION_LENGTH = 6_000;
export const MAX_CAPABILITIES_LENGTH = 1_000;
export const MAX_AGENT_CANDIDATES = 64;
export const MAX_BROWSER_GOAL_LENGTH = 2_000;
export const MAX_BROWSER_SNAPSHOT_ID_LENGTH = 200;
export const MAX_BROWSER_PAGE_TEXT_LENGTH = 12_000;
export const MAX_BROWSER_ELEMENT_LABEL_LENGTH = 500;
export const MAX_BROWSER_ELEMENTS = 64;
export const MAX_BROWSER_HISTORY_ENTRIES = 20;
export const MAX_BROWSER_SELECT_OPTIONS = 64;
