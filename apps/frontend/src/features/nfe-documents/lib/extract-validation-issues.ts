import type { NfeFlowInstance } from '../api/types';

export type AlertIssue = {
  message: string;
  scope?: string;
  field?: string;
  expected?: number | string;
  actual?: number | string;
  lineNumber?: number;
  xPed?: string;
  nItemPed?: string;
};

type RawIssue = {
  message?: string;
  scope?: string;
  field?: string;
  expected?: number | string;
  actual?: number | string;
  lineNumber?: number;
  xPed?: string;
  nItemPed?: string;
};

function normalizeIssue(raw: RawIssue): AlertIssue | null {
  if (!raw.message?.trim()) return null;
  return {
    message: raw.message.trim(),
    scope: raw.scope,
    field: raw.field,
    expected: raw.expected,
    actual: raw.actual,
    lineNumber: raw.lineNumber,
    xPed: raw.xPed,
    nItemPed: raw.nItemPed,
  };
}

function extractFromFlow(flowInstance: NfeFlowInstance | null): AlertIssue[] {
  const issues: AlertIssue[] = [];

  for (const execution of flowInstance?.executions ?? []) {
    const payload = execution.payload;
    if (!payload || typeof payload !== 'object') continue;

    const rawIssues = (payload as { issues?: RawIssue[] }).issues;
    if (!Array.isArray(rawIssues)) continue;

    for (const raw of rawIssues) {
      const issue = normalizeIssue(raw);
      if (issue) issues.push(issue);
    }
  }

  return issues;
}

function parseAlertMessage(alertMessage: string): AlertIssue[] {
  return alertMessage
    .split(/;\s*/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((message) => ({ message }));
}

function dedupeIssues(issues: AlertIssue[]): AlertIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = issue.message;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function extractValidationIssues(input: {
  alertMessage?: string | null;
  flowInstance?: NfeFlowInstance | null;
}): AlertIssue[] {
  const fromFlow = extractFromFlow(input.flowInstance ?? null);
  if (fromFlow.length > 0) {
    return dedupeIssues(fromFlow);
  }

  if (input.alertMessage?.trim()) {
    return parseAlertMessage(input.alertMessage);
  }

  return [];
}
