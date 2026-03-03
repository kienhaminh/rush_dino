import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AppConfigView, ProviderKind } from '@/lib/types';

interface Props {
  config: AppConfigView;
  onChange: (patch: Partial<AppConfigView>) => void;
}

const PROVIDERS: { value: ProviderKind; label: string }[] = [
  { value: 'ollama', label: 'Ollama (local)' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'codex', label: 'Codex' },
];

export function ConfigSectionProvider({ config, onChange }: Props) {
  return (
    <div className="space-y-6">
      {/* Active provider radio group */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Active Provider</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PROVIDERS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => onChange({ active_provider: value })}
              className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                config.active_provider === value
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-border/50 bg-background hover:bg-muted/40'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Ollama */}
      <div className="rounded-md border border-border/50 p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ollama</p>
        <div className="space-y-1">
          <Label htmlFor="ollama-base-url" className="text-xs">Base URL</Label>
          <Input
            id="ollama-base-url"
            value={config.ollama.base_url}
            onChange={(e) => onChange({ ollama: { ...config.ollama, base_url: e.target.value } })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ollama-model" className="text-xs">Model</Label>
          <Input
            id="ollama-model"
            value={config.ollama.model}
            onChange={(e) => onChange({ ollama: { ...config.ollama, model: e.target.value } })}
          />
        </div>
      </div>

      {/* OpenAI */}
      <div className="rounded-md border border-border/50 p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">OpenAI</p>
        <div className="space-y-1">
          <Label htmlFor="openai-model" className="text-xs">Model</Label>
          <Input
            id="openai-model"
            value={config.openai.model}
            onChange={(e) => onChange({ openai: { model: e.target.value } })}
          />
        </div>
      </div>

      {/* Anthropic */}
      <div className="rounded-md border border-border/50 p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Anthropic</p>
        <div className="space-y-1">
          <Label htmlFor="anthropic-model" className="text-xs">Model</Label>
          <Input
            id="anthropic-model"
            value={config.anthropic.model}
            onChange={(e) => onChange({ anthropic: { model: e.target.value } })}
          />
        </div>
      </div>

      {/* Codex */}
      <div className="rounded-md border border-border/50 p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Codex</p>
        <div className="space-y-1">
          <Label htmlFor="codex-model" className="text-xs">Model</Label>
          <Input
            id="codex-model"
            value={config.codex.model}
            onChange={(e) => onChange({ codex: { model: e.target.value } })}
          />
        </div>
      </div>
    </div>
  );
}
