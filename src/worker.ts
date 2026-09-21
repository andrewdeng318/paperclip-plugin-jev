import {
  definePlugin,
  runWorker,
  type EnvSecretRefBinding,
  type PluginContext,
  type PluginEvent,
} from "@paperclipai/plugin-sdk";
import {
  APIConnectionError,
  APITimeoutError,
  AuthenticationError,
  PermissionDeniedError,
  RateLimitError,
  TypeSafeClient,
  choice,
  noul,
  type ChoiceResponse,
  type Questions,
} from "@typesafe-ai/sdk";
import {
  ACTIONS,
  AUTO_STATE_KEY,
  DATA_KEYS,
  DEFAULT_AUTOMATION_MODE,
  DEFAULT_CONTEXT_THRESHOLD,
  DEFAULT_MODEL,
  DEFAULT_OWNER_CONFIDENCE_THRESHOLD,
  DEFAULT_PRIORITY_CONFIDENCE_THRESHOLD,
  MAX_AGENT_CANDIDATES,
  MAX_CAPABILITIES_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  STATE_KEY,
  STATE_NAMESPACE,
  TOOL_NAMES,
  TYPESAFE_API_BASE_URL,
} from "./constants.js";
import { decideBrowserAction } from "./browser.js";

export type AutomationMode = "advisory" | "auto_confident" | "always_auto";

type PluginConfig = {
  apiKeyRef?: EnvSecretRefBinding;
  model?: string;
  automationMode: AutomationMode;
  ownerConfidenceThreshold: number;
  priorityConfidenceThreshold: number;
  contextThreshold: number;
};

type AgentCandidate = {
  key: string;
  id: string;
  name: string;
  role: string;
  title: string | null;
  capabilities: string | null;
  status: string;
};

export type ProbabilityEntry = {
  value: string;
  label: string;
  probability: number;
};

export type JevIssueAnalysis = {
  analyzedAt: string;
  issueId: string;
  model: string;
  owner: {
    agentId: string | null;
    name: string;
    confidence: number;
    probabilities: ProbabilityEntry[];
  };
  priority: {
    value: string;
    confidence: number;
    probabilities: ProbabilityEntry[];
  };
  issueType: {
    value: string;
    confidence: number;
    probabilities: ProbabilityEntry[];
  };
  needsMoreContext: number;
  likelyBlocked: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  disclosure: {
    fields: string[];
    commentsIncluded: false;
    attachmentsIncluded: false;
    logsIncluded: false;
    descriptionTruncated: boolean;
    agentCount: number;
  };
  automation: {
    trigger: "manual" | "issue.created";
    mode: AutomationMode;
    appliedFields: string[];
    skippedReasons: string[];
  };
};

type IssueContextData = {
  issueId: string;
  title: string;
  status: string;
  priority: string;
  descriptionLength: number;
  configured: boolean;
  model: string;
  automationMode: AutomationMode;
  disclosure: JevIssueAnalysis["disclosure"];
};

type AutomationPatch = {
  patch: {
    assigneeAgentId?: string | null;
    assigneeUserId?: string | null;
    priority?: "critical" | "high" | "medium" | "low";
  };
  appliedFields: string[];
  skippedReasons: string[];
};

const ISSUE_PRIORITIES = new Set(["critical", "high", "medium", "low"]);

function requiredString(params: Record<string, unknown>, key: string): string {
  const value = params[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} is required`);
  }
  return value;
}

function isSecretRef(value: unknown): value is EnvSecretRefBinding {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<EnvSecretRefBinding>;
  return candidate.type === "secret_ref" && typeof candidate.secretId === "string" && candidate.secretId.length > 0;
}

function configNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
}

function automationMode(value: unknown): AutomationMode {
  if (value === "auto_confident" || value === "Auto when confident") return "auto_confident";
  if (value === "always_auto" || value === "Always auto") return "always_auto";
  return DEFAULT_AUTOMATION_MODE;
}

function truncate(value: string | null | undefined, length: number): string {
  if (!value) return "";
  return value.length > length ? value.slice(0, length) : value;
}

function isEligibleAgent(status: string): boolean {
  return status === "active" || status === "idle" || status === "running";
}

async function getConfig(ctx: PluginContext, companyId: string): Promise<PluginConfig> {
  const raw = await ctx.config.get(companyId);
  return {
    apiKeyRef: isSecretRef(raw.apiKeyRef) ? raw.apiKeyRef : undefined,
    model: typeof raw.model === "string" && raw.model.trim().length > 0 ? raw.model.trim() : DEFAULT_MODEL,
    automationMode: automationMode(raw.automationMode),
    ownerConfidenceThreshold: configNumber(raw.ownerConfidenceThreshold, DEFAULT_OWNER_CONFIDENCE_THRESHOLD),
    priorityConfidenceThreshold: configNumber(raw.priorityConfidenceThreshold, DEFAULT_PRIORITY_CONFIDENCE_THRESHOLD),
    contextThreshold: configNumber(raw.contextThreshold, DEFAULT_CONTEXT_THRESHOLD),
  };
}

async function getAgentCandidates(ctx: PluginContext, companyId: string): Promise<AgentCandidate[]> {
  const agents = await ctx.agents.list({ companyId, limit: 255 });
  return agents
    .filter((agent) => isEligibleAgent(agent.status))
    .slice(0, MAX_AGENT_CANDIDATES)
    .map((agent, index) => ({
      key: `agent_${index + 1}`,
      id: agent.id,
      name: agent.name,
      role: agent.role,
      title: agent.title,
      capabilities: agent.capabilities,
      status: agent.status,
    }));
}

function disclosureFor(description: string | null, agentCount: number): JevIssueAnalysis["disclosure"] {
  return {
    fields: [
      "issue.title",
      "issue.description",
      "issue.status",
      "issue.priority",
      "candidateAgents.name",
      "candidateAgents.role",
      "candidateAgents.title",
      "candidateAgents.capabilities",
      "candidateAgents.status",
    ],
    commentsIncluded: false,
    attachmentsIncluded: false,
    logsIncluded: false,
    descriptionTruncated: Boolean(description && description.length > MAX_DESCRIPTION_LENGTH),
    agentCount,
  };
}

export function buildQuestions(candidates: AgentCandidate[]): Questions {
  const ownerCriteria: Record<string, string> = Object.fromEntries(
    candidates.map((candidate) => [
      candidate.key,
      [
        `Name: ${candidate.name}`,
        `Role: ${candidate.role}`,
        candidate.title ? `Title: ${candidate.title}` : null,
        candidate.capabilities ? `Capabilities: ${truncate(candidate.capabilities, MAX_CAPABILITIES_LENGTH)}` : null,
        `Status: ${candidate.status}`,
      ].filter(Boolean).join(". "),
    ]),
  );
  ownerCriteria.unassigned = "No listed agent is a clear fit. Leave the issue unassigned for human review.";

  return {
    recommended_owner: choice(
      "Which available agent is the best owner for this issue? Select unassigned when no listed agent is a clear fit.",
      ownerCriteria,
    ),
    recommended_priority: choice(
      "What priority should this issue have based only on its impact and urgency?",
      {
        critical: "Immediate severe business, security, data-loss, or production impact.",
        high: "Important and time-sensitive, but not an active severe incident.",
        medium: "Normal planned work with meaningful value and no immediate deadline.",
        low: "Minor improvement, cleanup, or optional work that can wait.",
      },
    ),
    issue_type: choice(
      "What is the primary type of work requested by this issue?",
      {
        bug: "A defect or regression in existing behavior.",
        feature: "A new product or user-facing capability.",
        operations: "Infrastructure, deployment, monitoring, reliability, or administrative operations.",
        research: "Investigation, comparison, discovery, or evidence gathering.",
        coordination: "Planning, review, communication, or cross-team coordination.",
        other: "None of the listed categories is a clear fit.",
      },
    ),
    needs_more_context: noul(
      "Does this issue lack information that a competent owner would need before starting useful work?",
    ),
    likely_blocked: noul(
      "Based only on the supplied issue fields, is this issue likely blocked by an unresolved dependency or required decision?",
    ),
  };
}

function probabilityEntries(response: ChoiceResponse, labels: Record<string, string>): ProbabilityEntry[] {
  return Object.entries(response.probabilities)
    .map(([value, probability]) => ({ value, label: labels[value] ?? value, probability }))
    .sort((left, right) => right.probability - left.probability);
}

function safeProviderError(error: unknown): Error {
  if (error instanceof AuthenticationError || error instanceof PermissionDeniedError) {
    return new Error("TypeSafe rejected the configured API key. Update the plugin secret and try again.");
  }
  if (error instanceof RateLimitError) {
    return new Error("TypeSafe rate limit reached. Try again later.");
  }
  if (error instanceof APITimeoutError) {
    return new Error("TypeSafe did not respond before the request timeout.");
  }
  if (error instanceof APIConnectionError) {
    return new Error("Could not connect to the TypeSafe API.");
  }
  return new Error("TypeSafe analysis failed. No Paperclip issue fields were changed.");
}

async function getIssueContext(ctx: PluginContext, companyId: string, issueId: string): Promise<IssueContextData> {
  const [issue, config, candidates] = await Promise.all([
    ctx.issues.get(issueId, companyId),
    getConfig(ctx, companyId),
    getAgentCandidates(ctx, companyId),
  ]);
  if (!issue) throw new Error("Issue not found in the active company");

  return {
    issueId: issue.id,
    title: issue.title,
    status: issue.status,
    priority: issue.priority,
    descriptionLength: issue.description?.length ?? 0,
    configured: Boolean(config.apiKeyRef),
    model: config.model ?? DEFAULT_MODEL,
    automationMode: config.automationMode,
    disclosure: disclosureFor(issue.description, candidates.length),
  };
}

async function analyzeIssue(
  ctx: PluginContext,
  companyId: string,
  issueId: string,
  trigger: "manual" | "issue.created" = "manual",
): Promise<JevIssueAnalysis> {
  const [issue, config, candidates] = await Promise.all([
    ctx.issues.get(issueId, companyId),
    getConfig(ctx, companyId),
    getAgentCandidates(ctx, companyId),
  ]);
  if (!issue) throw new Error("Issue not found in the active company");
  if (!config.apiKeyRef) {
    throw new Error("Configure a company-scoped TypeSafe API key in the Jev Issue Triage plugin settings first.");
  }

  const apiKey = await ctx.secrets.resolve(config.apiKeyRef, { companyId, configPath: "apiKeyRef" });
  const model = config.model ?? DEFAULT_MODEL;
  const questions = buildQuestions(candidates);
  const state = {
    issue: {
      title: truncate(issue.title, 500),
      description: truncate(issue.description, MAX_DESCRIPTION_LENGTH),
      status: issue.status,
      priority: issue.priority,
    },
  };

  try {
    const client = new TypeSafeClient({
      apiKey,
      baseURL: TYPESAFE_API_BASE_URL,
      defaultModel: model,
      timeout: 10_000,
      retry: { maxRetries: 1 },
      logLevel: "off",
      fetch: (input, init) => ctx.http.fetch(input, init),
    });
    const response = await client.systemOne({ state, questions, model });
    const ownerAnswer = response.answers.recommended_owner;
    const priorityAnswer = response.answers.recommended_priority;
    const typeAnswer = response.answers.issue_type;
    const moreContextAnswer = response.answers.needs_more_context;
    const blockedAnswer = response.answers.likely_blocked;

    if (
      ownerAnswer.type !== "choice"
      || priorityAnswer.type !== "choice"
      || typeAnswer.type !== "choice"
      || moreContextAnswer.type !== "noul"
      || blockedAnswer.type !== "noul"
    ) {
      throw new Error("Unexpected Jev response shape");
    }

    const candidateByKey = Object.fromEntries(candidates.map((candidate) => [candidate.key, candidate]));
    const selectedCandidate = candidateByKey[ownerAnswer.choice];
    const ownerLabels = Object.fromEntries(candidates.map((candidate) => [candidate.key, candidate.name]));
    ownerLabels.unassigned = "Unassigned";

    const analysis: JevIssueAnalysis = {
      analyzedAt: new Date().toISOString(),
      issueId: issue.id,
      model: response.model,
      owner: {
        agentId: selectedCandidate?.id ?? null,
        name: selectedCandidate?.name ?? "Unassigned",
        confidence: ownerAnswer.confidence,
        probabilities: probabilityEntries(ownerAnswer, ownerLabels),
      },
      priority: {
        value: priorityAnswer.choice,
        confidence: priorityAnswer.confidence,
        probabilities: probabilityEntries(priorityAnswer, {}),
      },
      issueType: {
        value: typeAnswer.choice,
        confidence: typeAnswer.confidence,
        probabilities: probabilityEntries(typeAnswer, {}),
      },
      needsMoreContext: moreContextAnswer.noul,
      likelyBlocked: blockedAnswer.noul,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      disclosure: disclosureFor(issue.description, candidates.length),
      automation: {
        trigger,
        mode: config.automationMode,
        appliedFields: [],
        skippedReasons: trigger === "manual" ? ["Manual analyses never update issue fields."] : [],
      },
    };

    await ctx.state.set(
      { scopeKind: "issue", scopeId: issue.id, namespace: STATE_NAMESPACE, stateKey: STATE_KEY },
      analysis,
    );
    await ctx.activity.log({
      companyId,
      entityType: "issue",
      entityId: issue.id,
      message: "Jev advisory analysis completed",
      metadata: {
        model: analysis.model,
        inputTokens: analysis.usage.inputTokens,
        agentCount: analysis.disclosure.agentCount,
        commentsIncluded: false,
        attachmentsIncluded: false,
        logsIncluded: false,
      },
    });

    return analysis;
  } catch (error) {
    ctx.logger.warn("Jev analysis request failed", {
      issueId,
      errorType: error instanceof Error ? error.constructor.name : "UnknownError",
    });
    throw safeProviderError(error);
  }
}

export function buildAutomationPatch(analysis: JevIssueAnalysis, config: PluginConfig): AutomationPatch {
  const patch: AutomationPatch["patch"] = {};
  const appliedFields: string[] = [];
  const skippedReasons: string[] = [];
  const priority = ISSUE_PRIORITIES.has(analysis.priority.value)
    ? analysis.priority.value as AutomationPatch["patch"]["priority"]
    : undefined;

  if (config.automationMode === "always_auto") {
    patch.assigneeAgentId = analysis.owner.agentId;
    patch.assigneeUserId = null;
    appliedFields.push("owner");
    if (priority) {
      patch.priority = priority;
      appliedFields.push("priority");
    } else {
      skippedReasons.push("Jev returned an unsupported priority value.");
    }
    return { patch, appliedFields, skippedReasons };
  }

  if (analysis.needsMoreContext >= config.contextThreshold) {
    skippedReasons.push("Owner assignment skipped because the issue needs more context.");
  } else if (!analysis.owner.agentId) {
    skippedReasons.push("Owner assignment skipped because Jev recommended leaving the issue unassigned.");
  } else if (analysis.owner.confidence < config.ownerConfidenceThreshold) {
    skippedReasons.push("Owner assignment skipped because confidence is below the configured threshold.");
  } else {
    patch.assigneeAgentId = analysis.owner.agentId;
    patch.assigneeUserId = null;
    appliedFields.push("owner");
  }

  if (!priority) {
    skippedReasons.push("Priority update skipped because Jev returned an unsupported value.");
  } else if (analysis.priority.confidence < config.priorityConfidenceThreshold) {
    skippedReasons.push("Priority update skipped because confidence is below the configured threshold.");
  } else {
    patch.priority = priority;
    appliedFields.push("priority");
  }

  return { patch, appliedFields, skippedReasons };
}

export async function handleIssueCreated(ctx: PluginContext, event: PluginEvent): Promise<void> {
  const issueId = typeof event.entityId === "string"
    ? event.entityId
    : typeof event.payload === "object" && event.payload !== null && "issueId" in event.payload
      ? String(event.payload.issueId)
      : "";
  if (!issueId) return;

  const config = await getConfig(ctx, event.companyId);
  if (config.automationMode === "advisory") return;

  const stateRef = {
    scopeKind: "issue" as const,
    scopeId: issueId,
    namespace: STATE_NAMESPACE,
    stateKey: AUTO_STATE_KEY,
  };
  if (await ctx.state.get(stateRef)) return;

  await ctx.state.set(stateRef, {
    status: "processing",
    eventId: event.eventId,
    startedAt: new Date().toISOString(),
  });

  try {
    const analysis = await analyzeIssue(ctx, event.companyId, issueId, "issue.created");
    const automation = buildAutomationPatch(analysis, config);
    if (Object.keys(automation.patch).length > 0) {
      await ctx.issues.update(issueId, automation.patch, event.companyId);
    }

    const completedAnalysis: JevIssueAnalysis = {
      ...analysis,
      automation: {
        trigger: "issue.created",
        mode: config.automationMode,
        appliedFields: automation.appliedFields,
        skippedReasons: automation.skippedReasons,
      },
    };
    await ctx.state.set(
      { scopeKind: "issue", scopeId: issueId, namespace: STATE_NAMESPACE, stateKey: STATE_KEY },
      completedAnalysis,
    );
    await ctx.state.set(stateRef, {
      status: "completed",
      eventId: event.eventId,
      completedAt: new Date().toISOString(),
      appliedFields: automation.appliedFields,
    });
    await ctx.activity.log({
      companyId: event.companyId,
      entityType: "issue",
      entityId: issueId,
      message: "Jev automatic triage completed",
      metadata: {
        mode: config.automationMode,
        appliedFields: automation.appliedFields,
        skippedReasons: automation.skippedReasons,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Jev automatic triage failed.";
    await ctx.state.set(stateRef, {
      status: "failed",
      eventId: event.eventId,
      failedAt: new Date().toISOString(),
      message,
    });
    ctx.logger.warn("Jev automatic triage failed", { issueId, message });
  }
}

const plugin = definePlugin({
  async setup(ctx) {
    ctx.events.on("issue.created", async (event) => {
      await handleIssueCreated(ctx, event);
    });

    ctx.data.register(DATA_KEYS.issueContext, async (params) => {
      const companyId = requiredString(params, "companyId");
      const issueId = requiredString(params, "issueId");
      return await getIssueContext(ctx, companyId, issueId);
    });

    ctx.data.register(DATA_KEYS.latestAnalysis, async (params) => {
      const issueId = requiredString(params, "issueId");
      return await ctx.state.get({
        scopeKind: "issue",
        scopeId: issueId,
        namespace: STATE_NAMESPACE,
        stateKey: STATE_KEY,
      });
    });

    ctx.actions.register(ACTIONS.analyzeIssue, async (params) => {
      const companyId = requiredString(params, "companyId");
      const issueId = requiredString(params, "issueId");
      return await analyzeIssue(ctx, companyId, issueId, "manual");
    });

    const browserTool = ctx.manifest.tools?.find((tool) => tool.name === TOOL_NAMES.decideBrowserAction);
    if (!browserTool) throw new Error("Browser decision tool is missing from the plugin manifest.");
    ctx.tools.register(
      TOOL_NAMES.decideBrowserAction,
      {
        displayName: browserTool.displayName,
        description: browserTool.description,
        parametersSchema: browserTool.parametersSchema,
      },
      async (params, runCtx) => await decideBrowserAction(ctx, params, runCtx),
    );
  },

  async onHealth() {
    return { status: "ok", message: "Jev Issue Triage worker is running" };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
