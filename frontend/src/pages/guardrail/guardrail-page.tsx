import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrustDashboard } from './components/trust-dashboard';
import { PolicyRulesEditor } from './components/policy-rules-editor';
import { ApprovalPrompt } from './components/approval-prompt';
import type { ApprovalRequest } from '@/lib/guardrail-api';

// Placeholder agent list — agent selection wiring is out of scope for this task.
// When the real agent list API is available, replace this with a hook.
const PLACEHOLDER_AGENTS: { id: string; label: string }[] = [];

export function GuardrailPage() {
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null);

  return (
    <div className="flex-1 flex flex-col min-h-0 p-6 md:p-8 space-y-6 overflow-y-auto">
      {/* Page header */}
      <div className="space-y-1">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-primary" />
          Guardrail
        </h1>
        <p className="text-sm text-muted-foreground">
          Control what agents can do and see.
        </p>
      </div>

      {/* Agent selector */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground shrink-0">Agent:</span>
        {PLACEHOLDER_AGENTS.length === 0 ? (
          <div className="rounded-md border border-border/50 bg-muted/30 px-3 py-1.5 text-sm text-muted-foreground">
            No agents available — select an agent to view guardrail data.
          </div>
        ) : (
          <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
            <SelectTrigger className="w-[260px]">
              <SelectValue placeholder="Select an agent" />
            </SelectTrigger>
            <SelectContent>
              {PLACEHOLDER_AGENTS.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Tab panels — shown regardless of agent selection so layout is visible */}
      <Tabs defaultValue="trust" className="flex-1">
        <TabsList>
          <TabsTrigger value="trust">Trust Levels</TabsTrigger>
          <TabsTrigger value="policy">Policy Rules</TabsTrigger>
          <TabsTrigger value="approvals">Approvals</TabsTrigger>
        </TabsList>

        <TabsContent value="trust" className="mt-4">
          {selectedAgentId ? (
            <TrustDashboard agentId={selectedAgentId} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Select an agent above to view trust levels.
            </p>
          )}
        </TabsContent>

        <TabsContent value="policy" className="mt-4">
          {selectedAgentId ? (
            <PolicyRulesEditor agentId={selectedAgentId} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Select an agent above to view policy rules.
            </p>
          )}
        </TabsContent>

        <TabsContent value="approvals" className="mt-4">
          <p className="text-sm text-muted-foreground">
            Approval prompts appear here during active sessions.
          </p>
          {/* ApprovalPrompt is rendered at page level so it can show as a modal
              regardless of which tab is active. pendingApproval is set by the
              backend push mechanism (to be wired in a later task). */}
          <ApprovalPrompt
            request={pendingApproval}
            sessionId={selectedAgentId}
            onClose={() => setPendingApproval(null)}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
