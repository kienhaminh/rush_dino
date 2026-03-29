import { Button } from '@/components/ui/button';
import { SandboxInboundFilterEditor } from './sandbox-inbound-filter-editor';
import type { McpServerStatus, SandboxMcpPolicy } from '@/lib/types';

interface Props {
  servers: McpServerStatus[];
  policy: SandboxMcpPolicy;
  onPolicyChange: (policy: SandboxMcpPolicy) => void;
  onApply: (policy: SandboxMcpPolicy) => Promise<void>;
}

function ServerToggle({
  server,
  decision,
  onChange,
}: {
  server: McpServerStatus;
  decision: 'allow' | 'deny';
  onChange: (name: string, decision: 'allow' | 'deny') => void;
}) {
  const isAllow = decision === 'allow';
  return (
    <div
      className={`flex items-center justify-between rounded-md border p-3 ${
        isAllow ? 'border-border/60' : 'border-red-500/20'
      }`}
    >
      <div>
        <div className="text-[12px] font-medium text-foreground">{server.name}</div>
        <div
          className={`mt-0.5 text-[10px] ${server.connected ? 'text-green-400' : 'text-muted-foreground'}`}
        >
          {server.connected ? `● connected · ${server.tool_count} tools` : '○ disconnected'}
        </div>
      </div>
      <button
        onClick={() => onChange(server.name, isAllow ? 'deny' : 'allow')}
        className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold transition-colors ${
          isAllow
            ? 'border-blue-500/40 bg-blue-500/10 text-blue-400'
            : 'border-red-500/40 bg-red-500/10 text-red-400'
        }`}
      >
        {isAllow ? 'ALLOW' : 'DENY'}
      </button>
    </div>
  );
}

export function SandboxMcpPolicyPanel({ servers, policy, onPolicyChange, onApply }: Props) {
  function toggleServer(name: string, decision: 'allow' | 'deny') {
    onPolicyChange({ ...policy, servers: { ...policy.servers, [name]: decision } });
  }

  return (
    <div className="overflow-y-auto p-4">
      <div className="mb-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-orange-400">
            ↑ Outbound
          </span>
          <span className="text-[10px] text-muted-foreground">What agent can call</span>
        </div>
        <div className="space-y-2">
          {servers.length === 0 ? (
            <div className="text-[11px] text-muted-foreground">No MCP servers configured</div>
          ) : (
            servers.map((server) => (
              <ServerToggle
                key={server.name}
                server={server}
                decision={policy.servers[server.name] ?? policy.default}
                onChange={toggleServer}
              />
            ))
          )}
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-green-400">
            ↓ Inbound
          </span>
          <span className="text-[10px] text-muted-foreground">Response filtering</span>
        </div>
        <SandboxInboundFilterEditor
          value={policy.inbound}
          onChange={(inbound) => onPolicyChange({ ...policy, inbound })}
        />
      </div>

      <Button size="sm" className="w-full text-xs" onClick={() => void onApply(policy)}>
        Apply Policy
      </Button>
    </div>
  );
}
