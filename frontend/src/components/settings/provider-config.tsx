import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ProviderConfigProps {
  provider: string;
  model: string;
  onProviderChange: (provider: string) => void;
  onModelChange: (model: string) => void;
}

export function ProviderConfig({
  provider,
  model,
  onProviderChange,
  onModelChange,
}: ProviderConfigProps) {
  return (
    <div className="grid gap-3">
      <label className="grid gap-1 text-sm">
        Provider
        <Select value={provider} onValueChange={(val) => onProviderChange(val)}>
          <SelectTrigger className="w-full rounded-lg border border-ink/20 bg-white px-3 py-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ollama">Ollama</SelectItem>
            <SelectItem value="openai">OpenAI</SelectItem>
            <SelectItem value="anthropic">Anthropic</SelectItem>
          </SelectContent>
        </Select>
      </label>
      <label className="grid gap-1 text-sm">
        Model
        <input
          className="rounded-lg border border-ink/20 bg-white px-3 py-2"
          value={model}
          onChange={(event) => onModelChange(event.target.value)}
        />
      </label>
    </div>
  );
}
