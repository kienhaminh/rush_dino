import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, X } from 'lucide-react'

import {
  completeProfileOAuth,
  createProfile,
  deleteProfile,
  listProfiles,
  startProfileOAuth,
  type CreateProfileInput,
  type OAuthStartResponse,
  type ProviderVerifyResponse,
  type ProviderProfile,
  verifyProfile,
} from '@/api/providers'
import { getConfig, patchConfig } from '@/api/config'
import { listAdapters, restartAdapter } from '@/api/gateway'
import {
  getDoctorReport,
  getSystemSummary,
  type DoctorReport,
  type SystemSummary,
} from '@/api/system'
import { SettingsPageHeader } from '@/components/settings/SettingsPageHeader'
import { cn } from '@/lib/cn'

const PROVIDERS = [
  {
    id: 'Z.ai',
    label: 'Z.ai',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    providerKind: 'openai',
    protocol: 'OpenAI',
  },
  {
    id: 'OpenAI',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    providerKind: 'openai',
    protocol: 'OpenAI',
  },
  {
    id: 'Anthropic',
    label: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    providerKind: 'anthropic',
    protocol: 'Anthropic',
  },
  {
    id: 'Ollama',
    label: 'Ollama',
    baseUrl: 'http://localhost:11434',
    providerKind: 'ollama',
    protocol: 'OpenAI',
  },
  {
    id: 'Custom',
    label: 'Custom',
    baseUrl: '',
    providerKind: null,
    protocol: 'OpenAI',
  },
] as const

const PROTOCOLS = ['OpenAI', 'Anthropic'] as const

type ProviderSelection = (typeof PROVIDERS)[number]['id']
type ProtocolSelection = (typeof PROTOCOLS)[number]

export default function Models() {
  const qc = useQueryClient()
  const profilesQ = useQuery({ queryKey: ['profiles'], queryFn: listProfiles })
  const configQ = useQuery({ queryKey: ['config'], queryFn: getConfig })
  const adaptersQ = useQuery({
    queryKey: ['adapters'],
    queryFn: listAdapters,
    refetchInterval: 5000,
  })
  const summaryQ = useQuery({
    queryKey: ['system-summary'],
    queryFn: getSystemSummary,
    staleTime: 10_000,
  })
  const [showDialog, setShowDialog] = useState(false)
  const [oauthProfile, setOAuthProfile] = useState<ProviderProfile | null>(null)
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [verifyState, setVerifyState] = useState<Record<string, ProviderVerifyResponse>>({})

  const isConnected = adaptersQ.data?.some((adapter) => adapter.status === 'running') ?? false
  const port = configQ.data?.port ?? 28847
  const profiles = profilesQ.data ?? []
  const defaultProfileId =
    typeof configQ.data?.default_profile_id === 'string' ? configQ.data.default_profile_id : null

  const reconnect = useMutation({
    mutationFn: async () => {
      const adapters = await listAdapters()
      await Promise.all(adapters.map((adapter) => restartAdapter(adapter.channelId)))
    },
    onSuccess: () => {
      void adaptersQ.refetch()
    },
  })
  const refreshStatus = useMutation({
    mutationFn: async () => {
      setVerifyState({})
      await Promise.all([
        profilesQ.refetch(),
        configQ.refetch(),
        adaptersQ.refetch(),
        summaryQ.refetch(),
      ])
    },
  })

  const setDefault = useMutation({
    mutationFn: async (profileId: string) => patchConfig({ default_profile_id: profileId }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['config'] }),
        qc.invalidateQueries({ queryKey: ['profiles'] }),
      ])
    },
  })

  const removeProfile = useMutation({
    mutationFn: deleteProfile,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['config'] }),
        qc.invalidateQueries({ queryKey: ['profiles'] }),
      ])
    },
  })

  const verify = useMutation({
    mutationFn: verifyProfile,
    onSuccess: (result, profileId) => {
      setVerifyState((prev) => ({ ...prev, [profileId]: result }))
    },
  })

  const pageError =
    (profilesQ.error instanceof Error && profilesQ.error.message) ||
    (configQ.error instanceof Error && configQ.error.message) ||
    (summaryQ.error instanceof Error && summaryQ.error.message) ||
    (setDefault.error instanceof Error && setDefault.error.message) ||
    (removeProfile.error instanceof Error && removeProfile.error.message) ||
    null
  const runtimeStatus = summaryQ.data?.status ?? (isConnected ? 'healthy' : 'attention')
  const runtimeIssue =
    typeof summaryQ.data?.runtimeUnavailableError === 'string'
      ? summaryQ.data.runtimeUnavailableError
      : null

  return (
    <div className="settings-page">
      <SettingsPageHeader
        title="Models & API"
        lede="Manage model providers and the embedded gateway connection."
      />

      <div className="ma-section">
        <div className="ma-section-head">
          <h2 className="ma-section-title">Models</h2>
          <button type="button" className="ma-btn ma-btn--outline" onClick={() => setShowDialog(true)}>
            Add Model
          </button>
        </div>
        {pageError && <div className="chat-error-banner mono">{pageError}</div>}
        <div className="ma-model-list glass-panel">
          {profiles.length === 0 ? (
            <div className="ma-empty">No model profiles configured yet.</div>
          ) : (
            profiles.map((profile) => (
              <ModelRow
                key={profile.id}
                profile={profile}
                isSelected={profile.id === defaultProfileId}
                busy={
                  removeProfile.isPending && removeProfile.variables === profile.id
                    ? 'delete'
                    : setDefault.isPending && setDefault.variables === profile.id
                      ? 'default'
                      : null
                }
                onDelete={() => removeProfile.mutate(profile.id)}
                onSetDefault={() => setDefault.mutate(profile.id)}
                onVerify={() => verify.mutate(profile.id)}
                onConnectOAuth={() => setOAuthProfile(profile)}
                verifyBusy={verify.isPending && verify.variables === profile.id}
                verifyState={verifyState[profile.id]}
              />
            ))
          )}
        </div>
      </div>

      <div className="ma-section">
        <div className="ma-section-head">
          <div className="ma-gateway-left">
            <h2 className="ma-section-title">Gateway URL</h2>
            <span
              className={cn(
                'ma-status-badge',
                isConnected ? 'ma-status-badge--on' : 'ma-status-badge--off',
              )}
            >
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div className="ma-section-actions">
            <button
              type="button"
              className="ma-btn ma-btn--outline"
              onClick={() => reconnect.mutate()}
              disabled={reconnect.isPending}
            >
              {reconnect.isPending ? 'Reconnecting…' : 'Reconnect'}
            </button>
            <button
              type="button"
              className="ma-btn ma-btn--outline"
              onClick={() => refreshStatus.mutate()}
              disabled={refreshStatus.isPending}
            >
              {refreshStatus.isPending ? 'Refreshing…' : 'Refresh Status'}
            </button>
            <button
              type="button"
              className="ma-btn ma-btn--outline"
              onClick={() => setShowDiagnostics(true)}
            >
              Diagnose
            </button>
          </div>
        </div>

        <div className="ma-info-card glass-panel">
          <div className="ma-info-card__left">
            <p className="ma-info-card__title">Port</p>
            <p className="ma-info-card__desc">
              Gateway will restart automatically after changing the port. If the default port is
              occupied, the system will try adjacent ports.
            </p>
          </div>
          <span className="ma-url-chip">ws://127.0.0.1:{port}</span>
        </div>

        <div className="ma-runtime-card glass-panel glass-panel--compact">
          <div className="ma-runtime-card__head">
            <span className="ma-runtime-card__label">Desktop runtime</span>
            <span className={cn('ma-status-badge', runtimeBadgeClass(runtimeStatus))}>
              {runtimeStatus}
            </span>
          </div>
          <div className="ma-runtime-card__grid">
            <RuntimeStat label="Active provider" value={summaryQ.data?.activeProvider ?? '—'} />
            <RuntimeStat
              label="Effective profile"
              value={summaryQ.data?.effectiveProfileId ?? defaultProfileId ?? '—'}
            />
            <RuntimeStat
              label="Configured profiles"
              value={String(summaryQ.data?.profilesCount ?? profiles.length)}
            />
            <RuntimeStat label="Uptime" value={formatUptime(summaryQ.data?.uptimeSecs)} />
          </div>
          {runtimeIssue && <div className="chat-error-banner mono">{runtimeIssue}</div>}
        </div>

        <div className="ma-tips glass-panel glass-panel--compact">
          <p className="ma-tips__title">If the connection is not working, try these options:</p>
          <ul className="ma-tips__list">
            <li>Reconnect refreshes gateway adapters without changing saved model settings.</li>
            <li>Refresh Status reloads runtime health, profiles, config, and adapter state.</li>
            <li>Diagnose opens the embedded doctor report with suggested fixes.</li>
          </ul>
        </div>
      </div>

      {showDialog && (
        <AddModelDialog
          onClose={() => setShowDialog(false)}
          onAdded={() => {
            setShowDialog(false)
            void qc.invalidateQueries({ queryKey: ['profiles'] })
            void qc.invalidateQueries({ queryKey: ['config'] })
          }}
        />
      )}

      {oauthProfile && (
        <OAuthConnectDialog
          profile={oauthProfile}
          onClose={() => setOAuthProfile(null)}
          onConnected={() => {
            setOAuthProfile(null)
            void qc.invalidateQueries({ queryKey: ['profiles'] })
          }}
        />
      )}

      {showDiagnostics && (
        <DiagnosticsDialog
          onClose={() => setShowDiagnostics(false)}
          summary={summaryQ.data}
        />
      )}
    </div>
  )
}

function ModelRow({
  profile,
  isSelected,
  busy,
  onDelete,
  onSetDefault,
  onVerify,
  onConnectOAuth,
  verifyBusy,
  verifyState,
}: {
  profile: ProviderProfile
  isSelected: boolean
  busy: 'default' | 'delete' | null
  onDelete: () => void
  onSetDefault: () => void
  onVerify: () => void
  onConnectOAuth: () => void
  verifyBusy: boolean
  verifyState?: ProviderVerifyResponse
}) {
  const oauthConnectable =
    profile.auth_method === 'oauth' &&
    (profile.provider_kind === 'openai' || profile.provider_kind === 'anthropic')

  return (
    <div className="ma-model-row">
      <div className="ma-model-copy">
        <span className="ma-model-name">{profile.name}</span>
        <span className="ma-model-meta">
          {formatProfileLabel(profile.provider_kind)} · {formatProfileLabel(profile.auth_method)} ·{' '}
          {profile.default_model}
          {profile.base_url ? ` · ${profile.base_url}` : ''}
        </span>
        {verifyState && (
          <span
            className={cn(
              'ma-model-status',
              verifyState.ok ? 'ma-model-status--ok' : 'ma-model-status--error',
            )}
          >
            {verifyState.message}
          </span>
        )}
      </div>
      <div className="ma-model-actions">
        {oauthConnectable && (
          <button
            type="button"
            className="ma-btn ma-btn--outline"
            onClick={onConnectOAuth}
            disabled={busy !== null || verifyBusy}
          >
            Connect OAuth
          </button>
        )}
        <button
          type="button"
          className="ma-btn ma-btn--outline"
          onClick={onVerify}
          disabled={busy !== null || verifyBusy}
        >
          {verifyBusy ? 'Verifying…' : 'Verify'}
        </button>
        {isSelected ? (
          <span className="ma-sel-badge">Current Selection</span>
        ) : (
          <button
            type="button"
            className="ma-btn ma-btn--outline"
            onClick={onSetDefault}
            disabled={busy !== null}
          >
            {busy === 'default' ? 'Saving…' : 'Set default'}
          </button>
        )}
        <button
          type="button"
          className="ma-btn ma-btn--outline"
          onClick={onDelete}
          disabled={busy !== null}
        >
          {busy === 'delete' ? 'Removing…' : 'Remove'}
        </button>
      </div>
    </div>
  )
}

function AddModelDialog({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [provider, setProvider] = useState<ProviderSelection>(PROVIDERS[0].id)
  const [modelId, setModelId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [protocol, setProtocol] = useState<ProtocolSelection>(PROVIDERS[0].protocol)
  const [authMode, setAuthMode] = useState<'apikey' | 'oauth'>('apikey')
  const [baseUrl, setBaseUrl] = useState<string>(PROVIDERS[0].baseUrl)
  const [formError, setFormError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: (input: CreateProfileInput) => createProfile(input),
    onSuccess: () => onAdded(),
  })

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  const selectedProvider = PROVIDERS.find((item) => item.id === provider) ?? PROVIDERS[0]
  const showProtocol = provider === 'Custom'
  const showApiKey = selectedProvider.providerKind !== 'ollama'
  const canOAuth =
    selectedProvider.providerKind === 'openai' || selectedProvider.providerKind === 'anthropic'

  const handleProviderChange = (id: ProviderSelection) => {
    const next = PROVIDERS.find((item) => item.id === id)
    if (!next) return
    setProvider(next.id)
    setBaseUrl(next.baseUrl)
    setProtocol(next.protocol)
    setAuthMode(next.providerKind === 'anthropic' || next.providerKind === 'openai' ? 'apikey' : 'apikey')
  }

  const handleAdd = () => {
    setFormError(null)
    const trimmedModel = modelId.trim()
    if (!trimmedModel) {
      setFormError('Model ID is required.')
      return
    }

    const providerKind =
      selectedProvider.providerKind ?? (protocol === 'Anthropic' ? 'anthropic' : 'openai')

    const payload: CreateProfileInput = {
      name: displayName.trim() || trimmedModel,
      provider_kind: providerKind,
      auth_method:
        providerKind === 'ollama' ? 'none' : canOAuth && authMode === 'oauth' ? 'oauth' : 'apikey',
      default_model: trimmedModel,
      base_url: baseUrl.trim() || null,
      api_key:
        showApiKey && (!canOAuth || authMode === 'apikey') ? apiKey.trim() || undefined : undefined,
    }

    create.mutate(payload, {
      onError: (error) => {
        setFormError(error instanceof Error ? error.message : 'Failed to create profile')
      },
    })
  }

  return (
    <dialog ref={dialogRef} className="ma-dialog" onClose={onClose}>
      <div className="ma-dialog__inner">
        <div className="ma-dialog__header">
          <h2 className="ma-dialog__title">Add Model</h2>
          <button type="button" className="ma-dialog__close" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={1.8} />
          </button>
        </div>

        <div className="ma-dialog__warning">
          <span>!</span>
          Adding a provider profile updates the embedded desktop runtime immediately and persists to
          your local RushDino config.
        </div>

        <div className="ma-form-group">
          <label className="ma-form-label">
            <span className="ma-required">*</span> Provider
          </label>
          <select
            className="ma-form-select"
            value={provider}
            onChange={(event) => handleProviderChange(event.target.value as ProviderSelection)}
          >
            {PROVIDERS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <div className="ma-form-row">
          <div className="ma-form-group">
            <label className="ma-form-label">
              <span className="ma-required">*</span> Model ID
            </label>
            <input
              className="ma-form-input"
              placeholder="gpt-5.4, claude-3-7-sonnet, llama3.2:latest…"
              value={modelId}
              onChange={(event) => setModelId(event.target.value)}
            />
          </div>
          <div className="ma-form-group">
            <label className="ma-form-label">Display Name</label>
            <input
              className="ma-form-input"
              placeholder="Defaults to Model ID"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>
        </div>

        <div className="ma-form-row">
          <div className="ma-form-group">
            <label className="ma-form-label">Auth method</label>
            <select
              className="ma-form-select"
              value={authMode}
              onChange={(event) => setAuthMode(event.target.value as 'apikey' | 'oauth')}
              disabled={!canOAuth}
            >
              <option value="apikey">API key</option>
              <option value="oauth">OAuth</option>
            </select>
          </div>
          {showApiKey ? (
            <div className="ma-form-group">
              <label className="ma-form-label">{provider} API Key</label>
              <div className="ma-input-wrap">
                <input
                  className="ma-form-input"
                  type={showKey ? 'text' : 'password'}
                  placeholder={
                    canOAuth && authMode === 'oauth'
                      ? 'Not needed for OAuth profiles'
                      : 'Optional for now — you can add it later'
                  }
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  disabled={canOAuth && authMode === 'oauth'}
                />
                <button
                  type="button"
                  className="ma-eye-btn"
                  onClick={() => setShowKey((current) => !current)}
                  aria-label="Toggle visibility"
                  disabled={canOAuth && authMode === 'oauth'}
                >
                  {showKey ? (
                    <EyeOff size={14} strokeWidth={1.8} />
                  ) : (
                    <Eye size={14} strokeWidth={1.8} />
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="ma-form-group">
              <label className="ma-form-label">Authentication</label>
              <input className="ma-form-input" value="No API key required" disabled />
            </div>
          )}
          <div className="ma-form-group">
            <label className="ma-form-label">API Protocol</label>
            <select
              className="ma-form-select"
              value={protocol}
              onChange={(event) => setProtocol(event.target.value as ProtocolSelection)}
              disabled={!showProtocol}
            >
              {PROTOCOLS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="ma-form-group">
          <label className="ma-form-label">Base URL</label>
          <input
            className="ma-form-input"
            placeholder="https://..."
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
          />
        </div>

        <div className="ma-connectivity">
          <div className="ma-connectivity__info">
            <div>
              <p className="ma-connectivity__label">Connectivity test is no longer mocked</p>
              <p className="ma-connectivity__desc">
                Save the profile first. Verification and OAuth connection now happen against real
                saved desktop profiles.
              </p>
            </div>
          </div>
          <button type="button" className="ma-btn ma-btn--outline" disabled>
            Save first
          </button>
        </div>

        {formError && <div className="chat-error-banner mono">{formError}</div>}

        <div className="ma-dialog__footer">
          <button type="button" className="ma-btn ma-btn--outline" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="ma-btn ma-btn--primary"
            onClick={handleAdd}
            disabled={create.isPending || !modelId.trim()}
          >
            {create.isPending ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>
    </dialog>
  )
}

function DiagnosticsDialog({
  onClose,
  summary,
}: {
  onClose: () => void
  summary?: SystemSummary
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const doctorQ = useQuery({
    queryKey: ['system-doctor'],
    queryFn: getDoctorReport,
    staleTime: 0,
  })

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  const findings = doctorQ.data?.findings ?? []

  return (
    <dialog ref={dialogRef} className="ma-dialog" onClose={onClose}>
      <div className="ma-dialog__inner">
        <div className="ma-dialog__header">
          <h2 className="ma-dialog__title">Desktop Diagnostics</h2>
          <button type="button" className="ma-dialog__close" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={1.8} />
          </button>
        </div>

        <div className="ma-runtime-card glass-panel glass-panel--compact">
          <div className="ma-runtime-card__head">
            <span className="ma-runtime-card__label">Overall status</span>
            <span
              className={cn(
                'ma-status-badge',
                runtimeBadgeClass(doctorQ.data?.status ?? 'attention'),
              )}
            >
              {doctorQ.data?.status ?? 'loading'}
            </span>
          </div>
          <div className="ma-runtime-card__grid">
            <RuntimeStat label="Active provider" value={summary?.activeProvider ?? '—'} />
            <RuntimeStat label="Default profile" value={summary?.defaultProfileId ?? '—'} />
            <RuntimeStat label="Runtime profile" value={summary?.effectiveProfileId ?? '—'} />
            <RuntimeStat
              label="Doctor timestamp"
              value={formatTimestamp(doctorQ.data?.generatedAt)}
            />
          </div>
        </div>

        <div className="ma-diagnostic-overview">
          <DiagnosticCounter
            label="Errors"
            count={doctorQ.data?.summary.errorCount ?? 0}
            tone="error"
          />
          <DiagnosticCounter
            label="Warnings"
            count={doctorQ.data?.summary.warnCount ?? 0}
            tone="warn"
          />
          <DiagnosticCounter
            label="Info"
            count={doctorQ.data?.summary.infoCount ?? 0}
            tone="info"
          />
        </div>

        {doctorQ.error instanceof Error && (
          <div className="chat-error-banner mono">{doctorQ.error.message}</div>
        )}

        <div className="ma-diagnostic-list">
          {doctorQ.isLoading ? (
            <div className="ma-empty">Loading doctor report…</div>
          ) : findings.length === 0 ? (
            <div className="ma-empty">No findings reported by the embedded runtime.</div>
          ) : (
            findings.map((finding) => (
              <DiagnosticFinding key={finding.code} finding={finding} />
            ))
          )}
        </div>

        <div className="ma-dialog__footer">
          <button
            type="button"
            className="ma-btn ma-btn--outline"
            onClick={() => doctorQ.refetch()}
            disabled={doctorQ.isFetching}
          >
            {doctorQ.isFetching ? 'Refreshing…' : 'Refresh Report'}
          </button>
          <button type="button" className="ma-btn ma-btn--primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </dialog>
  )
}

function DiagnosticCounter({
  label,
  count,
  tone,
}: {
  label: string
  count: number
  tone: 'error' | 'warn' | 'info'
}) {
  return (
    <div className={cn('ma-diagnostic-counter', `ma-diagnostic-counter--${tone}`)}>
      <span className="ma-diagnostic-counter__count">{count}</span>
      <span className="ma-diagnostic-counter__label">{label}</span>
    </div>
  )
}

function DiagnosticFinding({ finding }: { finding: DoctorReport['findings'][number] }) {
  return (
    <article className="ma-diagnostic-item">
      <div className="ma-diagnostic-item__head">
        <span className={cn('ma-model-status', diagnosticToneClass(finding.severity))}>
          {finding.severity}
        </span>
        <span className="ma-diagnostic-item__code mono">{finding.code}</span>
      </div>
      <strong className="ma-diagnostic-item__title">{finding.title}</strong>
      <p className="ma-diagnostic-item__detail">{finding.detail}</p>
      <p className="ma-diagnostic-item__action">{finding.action}</p>
      <span className="ma-diagnostic-item__fixable mono">
        {finding.fixable ? 'Fixable from desktop config' : 'Needs manual follow-up'}
      </span>
    </article>
  )
}

function RuntimeStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="ma-runtime-stat">
      <span className="ma-runtime-stat__label">{label}</span>
      <span className="ma-runtime-stat__value mono">{value}</span>
    </div>
  )
}

function formatProfileLabel(value: string): string {
  switch (value) {
    case 'apikey':
      return 'API key'
    case 'oauth':
      return 'OAuth'
    default:
      return value.charAt(0).toUpperCase() + value.slice(1)
  }
}

function runtimeBadgeClass(status: string): string {
  switch (status) {
    case 'healthy':
      return 'ma-status-badge--on'
    case 'degraded':
    case 'attention':
      return 'ma-status-badge--off'
    default:
      return 'ma-status-badge--off'
  }
}

function diagnosticToneClass(severity: string): string {
  switch (severity) {
    case 'error':
      return 'ma-model-status--error'
    case 'warn':
      return 'ma-model-status--pending'
    default:
      return 'ma-model-status--ok'
  }
}

function formatTimestamp(value?: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function formatUptime(seconds?: number): string {
  if (!seconds || seconds < 1) return '—'
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
}

function OAuthConnectDialog({
  profile,
  onClose,
  onConnected,
}: {
  profile: ProviderProfile
  onClose: () => void
  onConnected: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [session, setSession] = useState<OAuthStartResponse | null>(null)
  const [redirectUrl, setRedirectUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  const start = useMutation({
    mutationFn: () => startProfileOAuth(profile.id),
    onSuccess: (result) => {
      setSession(result)
      setError(null)
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to start OAuth')
    },
  })

  const complete = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error('Start OAuth first')
      await completeProfileOAuth(profile.id, session.session_id, redirectUrl.trim())
    },
    onSuccess: () => {
      onConnected()
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to complete OAuth')
    },
  })

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  return (
    <dialog ref={dialogRef} className="ma-dialog" onClose={onClose}>
      <div className="ma-dialog__inner">
        <div className="ma-dialog__header">
          <h2 className="ma-dialog__title">Connect OAuth</h2>
          <button type="button" className="ma-dialog__close" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={1.8} />
          </button>
        </div>

        <div className="ma-dialog__warning">
          <span>!</span>
          Complete OAuth in your browser, then paste the final redirect URL back here so the
          desktop app can exchange tokens locally.
        </div>

        <div className="ma-form-group">
          <label className="ma-form-label">Profile</label>
          <input
            className="ma-form-input"
            value={`${profile.name} · ${formatProfileLabel(profile.provider_kind)}`}
            disabled
          />
        </div>

        <div className="ma-connectivity">
          <div className="ma-connectivity__info">
            <div>
              <p className="ma-connectivity__label">
                {session ? 'OAuth session ready' : 'Start an OAuth session'}
              </p>
              <p className="ma-connectivity__desc">
                {session
                  ? 'Open the auth URL below, authorize the provider, then paste the redirected URL.'
                  : 'The embedded server will generate a PKCE login URL for this saved profile.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="ma-btn ma-btn--outline"
            onClick={() => start.mutate()}
            disabled={start.isPending}
          >
            {start.isPending ? 'Starting…' : session ? 'Restart OAuth' : 'Start OAuth'}
          </button>
        </div>

        {session && (
          <>
            <div className="ma-form-group">
              <label className="ma-form-label">Authorization URL</label>
              <textarea
                className="ma-form-input"
                value={session.auth_url}
                readOnly
                rows={4}
              />
            </div>
            <div className="ma-form-group">
              <label className="ma-form-label">Redirect URL</label>
              <textarea
                className="ma-form-input"
                placeholder="Paste the full redirect URL after approval"
                rows={4}
                value={redirectUrl}
                onChange={(event) => setRedirectUrl(event.target.value)}
              />
            </div>
          </>
        )}

        {error && <div className="chat-error-banner mono">{error}</div>}

        <div className="ma-dialog__footer">
          <button type="button" className="ma-btn ma-btn--outline" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="ma-btn ma-btn--primary"
            onClick={() => complete.mutate()}
            disabled={!session || !redirectUrl.trim() || complete.isPending}
          >
            {complete.isPending ? 'Connecting…' : 'Complete OAuth'}
          </button>
        </div>
      </div>
    </dialog>
  )
}
