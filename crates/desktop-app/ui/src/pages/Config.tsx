import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, Save, ChevronDown, ChevronRight } from 'lucide-react'

import { getConfig, getCredentials, patchCredentials, type CredentialsJson } from '@/api/config'
import { GlassPanel } from '@/components/glass/GlassPanel'
import { cn } from '@/lib/cn'
import { SettingsPageHeader } from '@/components/settings/SettingsPageHeader'

const REDACTED = '***'

type FieldDef = {
  key: keyof CredentialsJson
  label: string
  hint?: string
}

const KEY_FIELDS: FieldDef[] = [
  { key: 'anthropic_api_key', label: 'Anthropic API key', hint: 'sk-ant-…' },
  { key: 'openai_api_key', label: 'OpenAI API key', hint: 'sk-…' },
  { key: 'gemini_api_key', label: 'Gemini API key' },
  { key: 'brave_api_key', label: 'Brave Search key' },
]

const CHANNEL_FIELDS: FieldDef[] = [
  { key: 'telegram_bot_token', label: 'Telegram bot token' },
  { key: 'discord_bot_token', label: 'Discord bot token' },
  { key: 'slack_bot_token', label: 'Slack bot token', hint: 'xoxb-…' },
  { key: 'slack_app_token', label: 'Slack app token', hint: 'xapp-…' },
]

export default function Config() {
  const qc = useQueryClient()
  const config = useQuery({ queryKey: ['config'], queryFn: getConfig })
  const credentials = useQuery({ queryKey: ['credentials'], queryFn: getCredentials })

  const [dirty, setDirty] = useState<CredentialsJson>({})
  const [reveal, setReveal] = useState<Record<string, boolean>>({})
  const [rawOpen, setRawOpen] = useState(false)

  const save = useMutation({
    mutationFn: patchCredentials,
    onSuccess: () => {
      setDirty({})
      qc.invalidateQueries({ queryKey: ['credentials'] })
    },
  })

  useEffect(() => {
    setDirty({})
  }, [credentials.data])

  const isDirty = Object.keys(dirty).length > 0

  function fieldValue(f: FieldDef): string {
    if (f.key in dirty) return String(dirty[f.key] ?? '')
    const existing = credentials.data?.[f.key]
    return typeof existing === 'string' ? existing : ''
  }
  function isRedacted(f: FieldDef): boolean {
    return !(f.key in dirty) && credentials.data?.[f.key] === REDACTED
  }
  function setField(f: FieldDef, v: string) {
    setDirty((d) => ({ ...d, [f.key]: v }))
  }

  function onSave() {
    /* Drop fields that are still the server's redaction sentinel — those
       mean "unchanged" and saving them would overwrite the live value. */
    const patch: CredentialsJson = {}
    for (const [k, v] of Object.entries(dirty)) {
      if (v === REDACTED) continue
      patch[k] = v
    }
    save.mutate(patch)
  }

  return (
    <div className="settings-page">
      <SettingsPageHeader
        title="Settings"
        lede={<>Credentials are PATCH-only — a field reading <span className="mono">***</span> means it exists on disk but is redacted here. Type a new value to replace it, or leave it alone. Secrets live in <span className="mono">~/.rushdino/credentials.toml</span>.</>}
      />

      <SummaryPanel config={config.data} />

      <SecretSection
        title="LLM providers"
        fields={KEY_FIELDS}
        reveal={reveal}
        setReveal={setReveal}
        fieldValue={fieldValue}
        setField={setField}
        isRedacted={isRedacted}
      />

      <SecretSection
        title="Channel bots"
        fields={CHANNEL_FIELDS}
        reveal={reveal}
        setReveal={setReveal}
        fieldValue={fieldValue}
        setField={setField}
        isRedacted={isRedacted}
      />

      <div className="config-save-bar">
        <span className={cn('config-save-bar__status', isDirty && 'config-save-bar__status--dirty')}>
          {isDirty ? `${Object.keys(dirty).length} unsaved change${Object.keys(dirty).length > 1 ? 's' : ''}` : 'all saved'}
        </span>
        <button
          type="button"
          className="approval-btn approval-btn--approve"
          onClick={onSave}
          disabled={!isDirty || save.isPending}
        >
          <Save size={13} strokeWidth={1.8} />
          {save.isPending ? 'saving…' : 'save credentials'}
        </button>
      </div>
      {save.isError && (
        <div role="alert" className="chat-error-banner mono">
          {save.error instanceof Error ? save.error.message : 'save failed'}
        </div>
      )}

      <GlassPanel variant="compact" className="raw-config">
        <button
          type="button"
          className="raw-config__toggle"
          onClick={() => setRawOpen((v) => !v)}
        >
          {rawOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span>raw config.toml</span>
          <span className="raw-config__hint mono">read-only</span>
        </button>
        {rawOpen && (
          <pre className="raw-config__body mono">
            {config.data ? JSON.stringify(config.data, null, 2) : '—'}
          </pre>
        )}
      </GlassPanel>
    </div>
  )
}

function SummaryPanel({ config }: { config?: import('@/api/config').AppConfigJson }) {
  if (!config) return null
  const channels = Object.entries(config.gateway ?? {})
    .filter(([, v]) => (v as { enabled?: boolean })?.enabled)
    .map(([k]) => k)
  return (
    <GlassPanel variant="body" className="config-summary">
      <div className="config-summary__row">
        <span className="config-summary__label mono">Active provider</span>
        <span className="config-summary__value">{config.active_provider || '—'}</span>
      </div>
      <div className="config-summary__row">
        <span className="config-summary__label mono">Default profile</span>
        <span className="config-summary__value mono">{config.default_profile_id ?? '—'}</span>
      </div>
      <div className="config-summary__row">
        <span className="config-summary__label mono">Server</span>
        <span className="config-summary__value mono">
          {config.host ?? '0.0.0.0'}:{config.port ?? 28847}
        </span>
      </div>
      <div className="config-summary__row">
        <span className="config-summary__label mono">Log level</span>
        <span className="config-summary__value mono">{config.log_level ?? 'info'}</span>
      </div>
      <div className="config-summary__row">
        <span className="config-summary__label mono">Channels on</span>
        <span className="config-summary__value">
          {channels.length === 0 ? '—' : channels.map((c) => <span key={c} className="tag">{c}</span>)}
        </span>
      </div>
    </GlassPanel>
  )
}

function SecretSection({
  title,
  fields,
  reveal,
  setReveal,
  fieldValue,
  setField,
  isRedacted,
}: {
  title: string
  fields: FieldDef[]
  reveal: Record<string, boolean>
  setReveal: (r: Record<string, boolean>) => void
  fieldValue: (f: FieldDef) => string
  setField: (f: FieldDef, v: string) => void
  isRedacted: (f: FieldDef) => boolean
}) {
  return (
    <GlassPanel variant="body" className="secret-section">
      <h2 className="secret-section__title">{title}</h2>
      <div className="secret-section__rows">
        {fields.map((f) => {
          const k = String(f.key)
          const shown = Boolean(reveal[k])
          const redacted = isRedacted(f)
          return (
            <label key={k} className="secret-row">
              <span className="secret-row__label">{f.label}</span>
              <span className="secret-row__input">
                <input
                  type={shown || !redacted ? 'text' : 'password'}
                  className="secret-row__field mono"
                  value={fieldValue(f)}
                  placeholder={f.hint ?? 'not set'}
                  onChange={(e) => setField(f, e.target.value)}
                />
                <button
                  type="button"
                  className="secret-row__eye"
                  onClick={() => setReveal({ ...reveal, [k]: !shown })}
                  title={shown ? 'hide' : 'reveal'}
                  aria-label={shown ? 'hide value' : 'reveal value'}
                >
                  {shown ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </span>
            </label>
          )
        })}
      </div>
    </GlassPanel>
  )
}
