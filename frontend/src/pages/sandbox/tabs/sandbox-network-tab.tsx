import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SandboxAuditFeed } from '../components/sandbox-audit-feed';
import type { AuditEntry, NetworkRule, SandboxNetworkPolicy } from '@/lib/types';

interface SandboxNetworkTabProps {
  policy: SandboxNetworkPolicy;
  auditEntries: AuditEntry[];
  loadingAudit: boolean;
  sessionId: string | null;
  onPolicyChange: (policy: SandboxNetworkPolicy) => void;
  onApply: () => Promise<void>;
}

const DEFAULT_INBOUND = {
  max_size_kb: 256,
  strip_headers: [] as string[],
  allowed_content_types: [] as string[],
};

export function SandboxNetworkTab({
  policy,
  auditEntries,
  loadingAudit,
  sessionId: _sessionId, // reserved for future session-scoped audit filtering
  onPolicyChange,
  onApply,
}: SandboxNetworkTabProps) {
  const [newHost, setNewHost] = useState('');
  const [newHeader, setNewHeader] = useState('');
  const inbound = policy.inbound ?? DEFAULT_INBOUND;

  function addAllowRule() {
    const trimmed = newHost.trim();
    if (!trimmed) return;
    const rule: NetworkRule = { host: trimmed, port: 443, methods: ['GET', 'POST'], paths: ['/*'] };
    onPolicyChange({ ...policy, allow: [...policy.allow, rule] });
    setNewHost('');
  }

  function removeAllowRule(index: number) {
    onPolicyChange({ ...policy, allow: policy.allow.filter((_, i) => i !== index) });
  }

  function addStripHeader() {
    const trimmed = newHeader.trim();
    if (!trimmed) return;
    onPolicyChange({
      ...policy,
      inbound: { ...inbound, strip_headers: [...inbound.strip_headers, trimmed] },
    });
    setNewHeader('');
  }

  function removeStripHeader(index: number) {
    onPolicyChange({
      ...policy,
      inbound: {
        ...inbound,
        strip_headers: inbound.strip_headers.filter((_, i) => i !== index),
      },
    });
  }

  const networkEntries = auditEntries.filter((e) => e.category === 'network');

  return (
    <div className="grid flex-1 grid-cols-[1fr_300px] gap-0">
      {/* Left: Audit Feed */}
      <div className="overflow-y-auto border-r border-border/60 p-4">
        <div className="mb-3 text-[10px] uppercase tracking-wider text-muted-foreground">
          Network Audit
        </div>
        <SandboxAuditFeed
          entries={networkEntries}
          loading={loadingAudit}
          extraColumns={[
            { key: 'method', label: 'Method', render: (e) => e.method ?? '—' },
            { key: 'path', label: 'Path', render: (e) => e.path ?? '—' },
          ]}
        />
      </div>

      {/* Right: Policy Panel */}
      <div className="overflow-y-auto p-4">
        {/* Outbound section */}
        <div className="mb-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-orange-400">
              ↑ Outbound
            </span>
          </div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Default:</span>
            <Select
              value={policy.default}
              onValueChange={(v) =>
                onPolicyChange({ ...policy, default: v as 'allow' | 'deny' })
              }
            >
              <SelectTrigger className="h-6 w-20 text-[10px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="allow">allow</SelectItem>
                <SelectItem value="deny">deny</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-[11px] text-muted-foreground">On block:</span>
            <Select
              value={policy.on_block}
              onValueChange={(v) =>
                onPolicyChange({ ...policy, on_block: v as SandboxNetworkPolicy['on_block'] })
              }
            >
              <SelectTrigger className="h-6 w-24 text-[10px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="prompt">prompt</SelectItem>
                <SelectItem value="deny">deny</SelectItem>
                <SelectItem value="hard-stop">hard-stop</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* Allow rules list */}
          <div className="space-y-1">
            {policy.allow.map((rule, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded border border-border/60 px-2 py-1"
              >
                <span className="text-[11px] text-foreground">{rule.host}:{rule.port}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-muted-foreground hover:text-destructive"
                  onClick={() => removeAllowRule(i)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
          {/* Add allow rule input */}
          <div className="mt-2 flex gap-2">
            <Input
              value={newHost}
              onChange={(e) => setNewHost(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addAllowRule()}
              placeholder="api.example.com"
              className="h-7 text-xs"
            />
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addAllowRule}>
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Inbound section */}
        <div className="mb-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-green-400">
              ↓ Inbound
            </span>
          </div>
          <div className="mb-2">
            <div className="mb-1 text-[10px] text-muted-foreground">Max response size (KB)</div>
            <Input
              type="number"
              value={inbound.max_size_kb}
              onChange={(e) =>
                onPolicyChange({
                  ...policy,
                  inbound: { ...inbound, max_size_kb: Math.max(1, Number(e.target.value)) },
                })
              }
              className="h-7 w-24 text-xs"
            />
          </div>
          {/* Strip response headers editor */}
          <div>
            <div className="mb-1 text-[10px] text-muted-foreground">Strip response headers</div>
            <div className="space-y-1">
              {inbound.strip_headers.map((h, i) => (
                <div key={i} className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-muted px-2 py-0.5 text-[10px]">{h}</code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-muted-foreground hover:text-destructive"
                    onClick={() => removeStripHeader(i)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="mt-1 flex gap-2">
              <Input
                value={newHeader}
                onChange={(e) => setNewHeader(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addStripHeader()}
                placeholder="Authorization"
                className="h-7 text-xs"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={addStripHeader}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>

        <Button size="sm" className="w-full text-xs" onClick={() => void onApply()}>
          Apply (Hot-reload)
        </Button>
      </div>
    </div>
  );
}
