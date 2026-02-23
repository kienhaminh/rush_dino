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
        <select
          className="rounded-lg border border-ink/20 bg-white px-3 py-2"
          value={provider}
          onChange={(event) => onProviderChange(event.target.value)}
        >
          <option value="ollama">Ollama</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
        </select>
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
