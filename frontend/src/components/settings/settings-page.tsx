import { useState } from 'react';

import { ProviderConfig } from './provider-config';

export function SettingsPage() {
  const [provider, setProvider] = useState('ollama');
  const [model, setModel] = useState('llama3.2:latest');

  return (
    <section className="rounded-2xl border border-ink/10 bg-white/60 p-4">
      <h2 className="font-display text-xl">Settings</h2>
      <p className="mb-4 mt-1 text-sm text-ink/70">
        Provider selection here updates local config manually for v1.
      </p>
      <ProviderConfig
        model={model}
        provider={provider}
        onModelChange={setModel}
        onProviderChange={setProvider}
      />
      <button className="mt-4 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white" type="button">
        Save
      </button>
    </section>
  );
}
