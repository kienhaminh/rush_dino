// Types matching the Rust guardrail API
import { parseJsonOrThrow } from './api';

export type ActionCategory = 'bash' | 'network' | 'fs_read' | 'fs_write';
export type TrustLevel = 'untrusted' | 'supervised' | 'trusted';
export type RuleType = 'deny' | 'allow';

export interface CategoryTrustInfo {
  category: ActionCategory;
  level: TrustLevel;
  consecutive_approvals: number;
  approved_patterns: string[];
}

export interface TrustLevelResponse {
  agent_id: string;
  trust_levels: CategoryTrustInfo[];
}

export interface CategoryRules {
  category: ActionCategory;
  patterns: string[];
}

export interface PolicyRulesResponse {
  deny_rules: CategoryRules[];
  allow_rules: CategoryRules[];
}

export interface ApprovalRequest {
  id: string;
  session_id: string;
  category: ActionCategory;
  description: string;
  redacted_content: string;
}

// Trust level management

/** Fetch trust levels for all action categories for an agent. */
export async function getTrustLevels(agentId: string): Promise<TrustLevelResponse> {
  const endpoint = `/api/agents/${encodeURIComponent(agentId)}/guardrail/trust`;
  const response = await fetch(endpoint);
  return parseJsonOrThrow(response, endpoint);
}

/** Set the trust level for a specific action category for an agent. */
export async function setTrustLevel(
  agentId: string,
  category: ActionCategory,
  level: TrustLevel,
): Promise<void> {
  const endpoint = `/api/agents/${encodeURIComponent(agentId)}/guardrail/trust`;
  const response = await fetch(endpoint, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ category, level }),
  });
  await parseJsonOrThrow(response, endpoint);
}

// Policy rules management

/** Fetch the deny/allow policy rules for an agent. */
export async function getPolicyRules(agentId: string): Promise<PolicyRulesResponse> {
  const endpoint = `/api/agents/${encodeURIComponent(agentId)}/guardrail/policy`;
  const response = await fetch(endpoint);
  return parseJsonOrThrow(response, endpoint);
}

/** Add a deny or allow policy rule for a specific category and pattern. */
export async function addPolicyRule(
  agentId: string,
  ruleType: RuleType,
  category: ActionCategory,
  pattern: string,
): Promise<void> {
  const endpoint = `/api/agents/${encodeURIComponent(agentId)}/guardrail/policy/rule`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ rule_type: ruleType, category, pattern }),
  });
  await parseJsonOrThrow(response, endpoint);
}

// Approval decisions

/** Approve or deny a pending guardrail action request for a session. */
export async function approveAction(
  sessionId: string,
  requestId: string,
  approved: boolean,
): Promise<void> {
  const endpoint = `/api/sessions/${encodeURIComponent(sessionId)}/guardrail/approve`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ request_id: requestId, approved }),
  });
  await parseJsonOrThrow(response, endpoint);
}
