import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import type { SandboxInboundFilter } from '@/lib/types';

interface SandboxInboundFilterEditorProps {
  value: SandboxInboundFilter;
  onChange: (value: SandboxInboundFilter) => void;
  disabled?: boolean;
}

export function SandboxInboundFilterEditor({ value, onChange, disabled }: SandboxInboundFilterEditorProps) {
  const [newPattern, setNewPattern] = useState('');

  function addPattern() {
    const trimmed = newPattern.trim();
    if (!trimmed) return;
    onChange({ ...value, strip_patterns: [...value.strip_patterns, trimmed] });
    setNewPattern('');
  }

  function removePattern(index: number) {
    onChange({
      ...value,
      strip_patterns: value.strip_patterns.filter((_, i) => i !== index),
    });
  }

  return (
    <div className="space-y-4">
      {/* Max size */}
      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          Max response size (KB)
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            value={value.max_size_kb}
            onChange={(e) => {
              const v = Number(e.target.value);
              onChange({ ...value, max_size_kb: v < 1 ? 1 : v });
            }}
            className="h-7 w-24 text-xs"
            disabled={disabled}
          />
          <span className="text-[11px] text-muted-foreground">· truncate on exceed</span>
        </div>
      </div>

      {/* Strip patterns */}
      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          Strip patterns (regex)
        </div>
        <div className="space-y-1.5">
          {value.strip_patterns.length === 0 ? (
            <div className="text-[11px] text-muted-foreground">No patterns</div>
          ) : (
            value.strip_patterns.map((pattern, i) => (
              <div key={i} className="flex items-center gap-2">
                <code className="flex-1 rounded bg-muted px-2 py-0.5 text-[10px] text-yellow-400">
                  {pattern}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-muted-foreground hover:text-destructive"
                  onClick={() => removePattern(i)}
                  disabled={disabled}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))
          )}
        </div>
        <div className="mt-2 flex gap-2">
          <Input
            value={newPattern}
            onChange={(e) => setNewPattern(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addPattern()}
            placeholder="e.g. AKIA[A-Z0-9]{16}"
            className="h-7 text-xs font-mono"
            disabled={disabled}
          />
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addPattern} disabled={disabled}>
            <Plus className="mr-1 h-3 w-3" />
            Add
          </Button>
        </div>
      </div>

      {/* Block on match */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] text-foreground">Block on match</div>
          <div className="text-[10px] text-muted-foreground">Hard-stop session if pattern matched</div>
        </div>
        <Switch
          checked={value.block_on_match}
          onCheckedChange={(checked) => onChange({ ...value, block_on_match: checked })}
          disabled={disabled}
          aria-label="Block on match"
        />
      </div>
    </div>
  );
}
