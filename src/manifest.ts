import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import {
  DEFAULT_CONTEXT_THRESHOLD,
  DEFAULT_BROWSER_ALLOWED_ORIGINS,
  DEFAULT_BROWSER_CONFIDENCE_THRESHOLD,
  DEFAULT_MODEL,
  DEFAULT_OWNER_CONFIDENCE_THRESHOLD,
  DEFAULT_PRIORITY_CONFIDENCE_THRESHOLD,
  EXPORT_NAMES,
  PLUGIN_ID,
  PLUGIN_VERSION,
  SLOT_IDS,
  TOOL_NAMES,
} from "./constants.js";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Jev Issue Triage",
  description: "Configurable issue routing and constrained browser decisions for Paperclip using Jev.",
  author: "andrewdeng318",
  categories: ["connector"],
  capabilities: [
    "issues.read",
    "issues.update",
    "agents.read",
    "events.subscribe",
    "plugin.state.read",
    "plugin.state.write",
    "http.outbound",
    "secrets.read-ref",
    "activity.log.write",
    "agent.tools.register",
    "ui.action.register",
    "ui.detailTab.register",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui"
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      apiKeyRef: {
        type: ["string", "object"],
        format: "secret-ref",
        title: "Jev API Key",
        description: "Company-scoped secret used only by the plugin worker to call the Jev API.",
      },
      model: {
        type: "string",
        title: "Model",
        default: DEFAULT_MODEL,
        description: "Jev model name or pinned version.",
      },
      automationMode: {
        type: "string",
        title: "Automation mode",
        enum: ["Advisory", "Auto when confident", "Always auto"],
        default: "Advisory",
        description: "Controls whether newly created issues are analyzed and updated automatically.",
      },
      ownerConfidenceThreshold: {
        type: "number",
        title: "Owner confidence threshold",
        minimum: 0,
        maximum: 1,
        default: DEFAULT_OWNER_CONFIDENCE_THRESHOLD,
        description: "Minimum owner confidence for Auto when confident.",
      },
      priorityConfidenceThreshold: {
        type: "number",
        title: "Priority confidence threshold",
        minimum: 0,
        maximum: 1,
        default: DEFAULT_PRIORITY_CONFIDENCE_THRESHOLD,
        description: "Minimum priority confidence for Auto when confident.",
      },
      contextThreshold: {
        type: "number",
        title: "Missing context threshold",
        minimum: 0,
        maximum: 1,
        default: DEFAULT_CONTEXT_THRESHOLD,
        description: "Owner assignment is skipped at or above this missing-context probability.",
      },
      browserMode: {
        type: "string",
        title: "Browser decision mode",
        enum: ["Observe only", "Confirm mutations", "Auto safe actions"],
        default: "Observe only",
        description: "Controls whether browser decisions are advisory, confirmation-gated, or eligible for safe automatic execution.",
      },
      browserConfidenceThreshold: {
        type: "number",
        title: "Browser confidence threshold",
        minimum: 0,
        maximum: 1,
        default: DEFAULT_BROWSER_CONFIDENCE_THRESHOLD,
        description: "Minimum confidence before a safe browser action can be executed automatically.",
      },
      browserIncludePageText: {
        type: "boolean",
        title: "Include visible page text",
        default: false,
        description: "Opt in to sending truncated visible page text to Jev. Element labels are always included.",
      },
      browserAllowedOrigins: {
        type: "array",
        title: "Browser allowed origins",
        description: "Exact HTTP or HTTPS origins that may be analyzed by the browser decision tool.",
        items: { type: "string" },
        default: DEFAULT_BROWSER_ALLOWED_ORIGINS,
      },
    },
    required: ["apiKeyRef"],
  },
  tools: [
    {
      name: TOOL_NAMES.decideBrowserAction,
      displayName: "Decide Browser Action with Jev",
      description: "Chooses one constrained browser operation and an observed target from a minimized page snapshot.",
      parametersSchema: {
        type: "object",
        properties: {
          goal: { type: "string" },
          url: { type: "string" },
          snapshotId: { type: "string" },
          pageText: { type: "string" },
          elements: {
            type: "array",
            items: {
              type: "object",
              properties: {
                index: { type: "integer", minimum: 0 },
                role: { type: "string" },
                name: { type: "string" },
                actions: {
                  type: "array",
                  items: { type: "string", enum: ["click", "type_text", "select"] },
                },
                sensitive: { type: "boolean" },
                options: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: ["index", "role", "name", "actions"],
            },
          },
          history: {
            type: "array",
            items: {
              type: "object",
              properties: {
                operation: { type: "string" },
                targetIndex: { type: ["integer", "null"] },
                outcome: { type: "string" },
              },
              required: ["operation", "outcome"],
            },
          },
        },
        required: ["goal", "url", "snapshotId", "elements"],
      },
    },
  ],
  ui: {
    slots: [
      {
        type: "toolbarButton",
        id: SLOT_IDS.toolbarButton,
        displayName: "Analyze with Jev",
        exportName: EXPORT_NAMES.toolbarButton,
        entityTypes: ["issue"],
      },
      {
        type: "taskDetailView",
        id: SLOT_IDS.taskDetailView,
        displayName: "Jev Analysis",
        exportName: EXPORT_NAMES.taskDetailView,
        entityTypes: ["issue"],
      },
    ]
  }
};

export default manifest;
