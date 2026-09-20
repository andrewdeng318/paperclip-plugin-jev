import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import {
  DEFAULT_CONTEXT_THRESHOLD,
  DEFAULT_MODEL,
  DEFAULT_OWNER_CONFIDENCE_THRESHOLD,
  DEFAULT_PRIORITY_CONFIDENCE_THRESHOLD,
  EXPORT_NAMES,
  PLUGIN_ID,
  PLUGIN_VERSION,
  SLOT_IDS,
} from "./constants.js";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Jev Issue Triage",
  description: "Configurable advisory and automated issue routing for Paperclip using Jev.",
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
    },
    required: ["apiKeyRef"],
  },
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
