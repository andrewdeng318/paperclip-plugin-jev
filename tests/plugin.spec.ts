import { describe, expect, it, vi } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import type { Agent, Issue } from "@paperclipai/shared";
import manifest from "../src/manifest.js";
import plugin, { buildQuestions, type JevIssueAnalysis } from "../src/worker.js";

const COMPANY_ID = "00000000-0000-4000-8000-000000000001";
const ISSUE_ID = "00000000-0000-4000-8000-000000000002";
const AGENT_ID = "00000000-0000-4000-8000-000000000003";
const SECRET_ID = "00000000-0000-4000-8000-000000000004";

function testIssue(overrides: Partial<Issue> = {}): Issue {
  const now = new Date();
  return {
    id: ISSUE_ID,
    companyId: COMPANY_ID,
    projectId: null,
    projectWorkspaceId: null,
    goalId: null,
    parentId: null,
    title: "Investigate checkout failures",
    description: "Customers cannot complete checkout after the latest release.",
    status: "todo",
    workMode: "standard",
    priority: "high",
    reviewPolicy: null,
    assigneeAgentId: null,
    assigneeUserId: null,
    checkoutRunId: null,
    executionRunId: null,
    executionAgentNameKey: null,
    executionLockedAt: null,
    createdByAgentId: null,
    createdByUserId: null,
    responsibleUserId: null,
    issueNumber: 1,
    identifier: "DEMO-1",
    requestDepth: 0,
    billingCode: null,
    assigneeAdapterOverrides: null,
    executionWorkspaceId: null,
    executionWorkspacePreference: null,
    executionWorkspaceSettings: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    hiddenAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as unknown as Issue;
}

function testAgent(): Agent {
  const now = new Date();
  return {
    id: AGENT_ID,
    companyId: COMPANY_ID,
    name: "Backend Engineer",
    urlKey: "backend-engineer",
    role: "engineer",
    title: "Senior Backend Engineer",
    icon: null,
    status: "idle",
    reportsTo: null,
    capabilities: "API debugging and checkout services",
    adapterType: "codex_local",
    adapterConfig: {},
    runtimeConfig: {},
    budgetMonthlyCents: 0,
    spentMonthlyCents: 0,
    pauseReason: null,
    pausedAt: null,
    permissions: { canCreateAgents: false },
    lastHeartbeatAt: null,
    metadata: null,
    createdAt: now,
    updatedAt: now,
  } as unknown as Agent;
}

function jevResponse(options: {
  ownerConfidence?: number;
  priorityConfidence?: number;
  needsMoreContext?: number;
} = {}): Response {
  const ownerConfidence = options.ownerConfidence ?? 0.9;
  const priorityConfidence = options.priorityConfidence ?? 0.8;
  return new Response(JSON.stringify({
    model: "jev-test",
    answers: {
      recommended_owner: {
        type: "choice",
        choice: "agent_1",
        confidence: ownerConfidence,
        probabilities: { agent_1: ownerConfidence, unassigned: 1 - ownerConfidence },
      },
      recommended_priority: {
        type: "choice",
        choice: "critical",
        confidence: priorityConfidence,
        probabilities: { critical: priorityConfidence, high: 1 - priorityConfidence, medium: 0, low: 0 },
      },
      issue_type: {
        type: "choice",
        choice: "bug",
        confidence: 0.95,
        probabilities: { bug: 0.96, feature: 0.01, operations: 0.01, research: 0.01, coordination: 0, other: 0.01 },
      },
      needs_more_context: { type: "noul", noul: options.needsMoreContext ?? 0.2 },
      likely_blocked: { type: "noul", noul: 0.1 },
    },
    usage: { input_tokens: 300, output_tokens: 100 },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

describe("Jev Issue Triage plugin", () => {
  it("declares automatic triage capabilities without comment access", () => {
    expect(manifest.capabilities).toEqual(expect.arrayContaining([
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
    ]));
    expect(manifest.capabilities).not.toContain("issue.comments.read");
    const properties = manifest.instanceConfigSchema?.properties as Record<string, unknown> | undefined;
    expect(properties?.apiKeyRef).toMatchObject({
      type: ["string", "object"],
      format: "secret-ref",
    });
  });

  it("builds atomic questions with an explicit unassigned owner option", () => {
    const questions = buildQuestions([{
      key: "agent_1",
      id: AGENT_ID,
      name: "Backend Engineer",
      role: "engineer",
      title: "Senior Backend Engineer",
      capabilities: "API debugging",
      status: "idle",
    }]);

    expect(questions.recommended_owner.type).toBe("choice");
    if (questions.recommended_owner.type === "choice") {
      expect(questions.recommended_owner.criteria).toHaveProperty("agent_1");
      expect(questions.recommended_owner.criteria).toHaveProperty("unassigned");
    }
    expect(questions.needs_more_context.type).toBe("noul");
    expect(questions.likely_blocked.type).toBe("noul");
  });

  it("fails closed before any provider call when no secret is configured", async () => {
    const harness = createTestHarness({ manifest, config: { model: "jev-latest" } });
    harness.seed({ issues: [testIssue()], agents: [testAgent()] });
    await plugin.definition.setup(harness.ctx);
    const fetchSpy = vi.spyOn(harness.ctx.http, "fetch");

    await expect(harness.performAction("analyze-issue", {
      companyId: COMPANY_ID,
      issueId: ISSUE_ID,
    })).rejects.toThrow("Configure a company-scoped Jev API key");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends minimized issue fields and stores the advisory response", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        apiKeyRef: { type: "secret_ref", secretId: SECRET_ID },
        model: "jev-latest",
      },
    });
    harness.seed({ issues: [testIssue()], agents: [testAgent()] });
    await plugin.definition.setup(harness.ctx);
    vi.spyOn(harness.ctx.secrets, "resolve").mockResolvedValue("test-api-key");
    const fetchSpy = vi.spyOn(harness.ctx.http, "fetch").mockImplementation(async (url, init) => {
      expect(String(url)).toBe("https://jev-ai.pro/api/v1/systemone");
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body).not.toHaveProperty("comments");
      expect(body).not.toHaveProperty("attachments");
      expect(body).not.toHaveProperty("logs");
      expect(body.state).toEqual({
        issue: {
          title: "Investigate checkout failures",
          description: "Customers cannot complete checkout after the latest release.",
          status: "todo",
          priority: "high",
        },
      });

      return jevResponse();
    });

    const result = await harness.performAction<JevIssueAnalysis>("analyze-issue", {
      companyId: COMPANY_ID,
      issueId: ISSUE_ID,
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(result.owner).toMatchObject({ agentId: AGENT_ID, name: "Backend Engineer" });
    expect(result.priority.value).toBe("critical");
    expect(result.disclosure).toMatchObject({
      commentsIncluded: false,
      attachmentsIncluded: false,
      logsIncluded: false,
      agentCount: 1,
    });
    expect(harness.getState({
      scopeKind: "issue",
      scopeId: ISSUE_ID,
      namespace: "jev-triage",
      stateKey: "latest-analysis",
    })).toMatchObject({ model: "jev-test", issueId: ISSUE_ID });
    expect(harness.activity).toHaveLength(1);
  });

  it("keeps new issues untouched in advisory mode", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        apiKeyRef: { type: "secret_ref", secretId: SECRET_ID },
        automationMode: "advisory",
      },
    });
    harness.seed({ issues: [testIssue()], agents: [testAgent()] });
    await plugin.definition.setup(harness.ctx);
    const fetchSpy = vi.spyOn(harness.ctx.http, "fetch");

    await harness.emit("issue.created", { issueId: ISSUE_ID }, {
      companyId: COMPANY_ID,
      entityId: ISSUE_ID,
      entityType: "issue",
      eventId: "event-advisory",
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await harness.ctx.issues.get(ISSUE_ID, COMPANY_ID)).toMatchObject({
      assigneeAgentId: null,
      priority: "high",
    });
  });

  it("automatically applies confident owner and priority recommendations once", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        apiKeyRef: { type: "secret_ref", secretId: SECRET_ID },
        automationMode: "auto_confident",
        ownerConfidenceThreshold: 0.8,
        priorityConfidenceThreshold: 0.7,
        contextThreshold: 0.7,
      },
    });
    harness.seed({ issues: [testIssue()], agents: [testAgent()] });
    await plugin.definition.setup(harness.ctx);
    vi.spyOn(harness.ctx.secrets, "resolve").mockResolvedValue("test-api-key");
    const fetchSpy = vi.spyOn(harness.ctx.http, "fetch").mockResolvedValue(jevResponse());

    await harness.emit("issue.created", { issueId: ISSUE_ID }, {
      companyId: COMPANY_ID,
      entityId: ISSUE_ID,
      entityType: "issue",
      eventId: "event-confident",
    });
    await harness.emit("issue.created", { issueId: ISSUE_ID }, {
      companyId: COMPANY_ID,
      entityId: ISSUE_ID,
      entityType: "issue",
      eventId: "event-confident-duplicate",
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(await harness.ctx.issues.get(ISSUE_ID, COMPANY_ID)).toMatchObject({
      assigneeAgentId: AGENT_ID,
      assigneeUserId: null,
      priority: "critical",
    });
    expect(harness.getState({
      scopeKind: "issue",
      scopeId: ISSUE_ID,
      namespace: "jev-triage",
      stateKey: "latest-analysis",
    })).toMatchObject({
      automation: { mode: "auto_confident", appliedFields: ["owner", "priority"] },
    });
  });

  it("does not apply low-confidence recommendations in confident mode", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        apiKeyRef: { type: "secret_ref", secretId: SECRET_ID },
        automationMode: "auto_confident",
      },
    });
    harness.seed({ issues: [testIssue()], agents: [testAgent()] });
    await plugin.definition.setup(harness.ctx);
    vi.spyOn(harness.ctx.secrets, "resolve").mockResolvedValue("test-api-key");
    vi.spyOn(harness.ctx.http, "fetch").mockResolvedValue(jevResponse({
      ownerConfidence: 0.5,
      priorityConfidence: 0.4,
      needsMoreContext: 0.8,
    }));

    await harness.emit("issue.created", { issueId: ISSUE_ID }, {
      companyId: COMPANY_ID,
      entityId: ISSUE_ID,
      entityType: "issue",
      eventId: "event-low-confidence",
    });

    expect(await harness.ctx.issues.get(ISSUE_ID, COMPANY_ID)).toMatchObject({
      assigneeAgentId: null,
      priority: "high",
    });
    expect(harness.getState({
      scopeKind: "issue",
      scopeId: ISSUE_ID,
      namespace: "jev-triage",
      stateKey: "latest-analysis",
    })).toMatchObject({
      automation: { mode: "auto_confident", appliedFields: [] },
    });
  });

  it("applies valid recommendations regardless of confidence in always-auto mode", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        apiKeyRef: { type: "secret_ref", secretId: SECRET_ID },
        automationMode: "always_auto",
      },
    });
    harness.seed({ issues: [testIssue()], agents: [testAgent()] });
    await plugin.definition.setup(harness.ctx);
    vi.spyOn(harness.ctx.secrets, "resolve").mockResolvedValue("test-api-key");
    vi.spyOn(harness.ctx.http, "fetch").mockResolvedValue(jevResponse({
      ownerConfidence: 0.2,
      priorityConfidence: 0.2,
      needsMoreContext: 0.95,
    }));

    await harness.emit("issue.created", { issueId: ISSUE_ID }, {
      companyId: COMPANY_ID,
      entityId: ISSUE_ID,
      entityType: "issue",
      eventId: "event-always-auto",
    });

    expect(await harness.ctx.issues.get(ISSUE_ID, COMPANY_ID)).toMatchObject({
      assigneeAgentId: AGENT_ID,
      priority: "critical",
    });
  });
});
