import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { SandboxInboundFilterEditor } from './sandbox-inbound-filter-editor';
import type { SandboxInboundFilter, SandboxProcessPolicy } from '@/lib/types';

const DEFAULT_INBOUND: SandboxInboundFilter = {
  max_size_kb: 32,
  strip_patterns: ['AKIA[A-Z0-9]{16}', 'sk-[A-Za-z0-9]{32,}', 'ghp_[A-Za-z0-9]{36}'],
  block_on_match: false,
};

interface Props {
  policy: SandboxProcessPolicy;
  onPolicyChange: (policy: SandboxProcessPolicy) => void;
  onApply: (policy: SandboxProcessPolicy) => Promise<void>;
}

export function SandboxBashPolicyPanel({ policy, onPolicyChange, onApply }: Props) {
  const [newCommand, setNewCommand] = useState('');
  const inbound = policy.inbound ?? DEFAULT_INBOUND;

  function addDeniedCommand() {
    const trimmed = newCommand.trim();
    if (!trimmed) return;
    onPolicyChange({ ...policy, deny_commands: [...policy.deny_commands, trimmed] });
    setNewCommand('');
  }

  function removeDeniedCommand(index: number) {
    onPolicyChange({
      ...policy,
      deny_commands: policy.deny_commands.filter((_, i) => i !== index),
    });
  }

  return (
    <div className="overflow-y-auto p-4">
      <div className="mb-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-orange-400">
            ↑ Outbound
          </span>
          <span className="text-[10px] text-muted-foreground">Command controls</span>
        </div>
        <div className="mb-3 space-y-2">
          <div>
            <div className="mb-1 text-[10px] text-muted-foreground">Denied commands</div>
            <div className="flex flex-wrap gap-1.5">
              {policy.deny_commands.map((cmd, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1 rounded border border-red-500/20 bg-red-500/10 px-2 py-0.5"
                >
                  <code className="text-[10px] text-red-400">{cmd}</code>
                  <button
                    onClick={() => removeDeniedCommand(i)}
                    className="text-red-400/60 hover:text-red-400"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex gap-2">
              <Input
                value={newCommand}
                onChange={(e) => setNewCommand(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addDeniedCommand()}
                placeholder="e.g. rm -rf"
                className="h-7 font-mono text-xs"
              />
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addDeniedCommand}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between rounded border border-border/60 px-3 py-2">
            <span className="text-[11px] text-foreground">Allow privileged</span>
            <Switch
              checked={policy.allow_privileged}
              onCheckedChange={(checked) => onPolicyChange({ ...policy, allow_privileged: checked })}
              aria-label="Allow privileged"
            />
          </div>
          <div className="flex items-center justify-between rounded border border-border/60 px-3 py-2">
            <span className="text-[11px] text-foreground">Max concurrent</span>
            <Input
              type="number"
              min={1}
              value={policy.max_concurrent}
              onChange={(e) =>
                onPolicyChange({ ...policy, max_concurrent: Math.max(1, Number(e.target.value)) })
              }
              className="h-6 w-16 text-xs"
            />
          </div>
          <div className="flex items-center justify-between rounded border border-border/60 px-3 py-2">
            <span className="text-[11px] text-foreground">Timeout (seconds)</span>
            <Input
              type="number"
              min={1}
              value={policy.timeout_seconds ?? 30}
              onChange={(e) =>
                onPolicyChange({ ...policy, timeout_seconds: Math.max(1, Number(e.target.value)) })
              }
              className="h-6 w-16 text-xs"
            />
          </div>
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-green-400">
            ↓ Inbound
          </span>
          <span className="text-[10px] text-muted-foreground">stdout/stderr filtering</span>
        </div>
        <SandboxInboundFilterEditor
          value={inbound}
          onChange={(newInbound) => onPolicyChange({ ...policy, inbound: newInbound })}
        />
      </div>

      <Button size="sm" className="w-full text-xs" onClick={() => void onApply(policy)}>
        Apply Policy
      </Button>
    </div>
  );
}
