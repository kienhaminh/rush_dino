import { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react'
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

// ── Reusable utility class fragments ───────────────────────────────────────
// BTN_BASE intentionally omits border utilities so variants can own them;
// otherwise Tailwind's `border-none` would override variant `border` rules
// (CSS source order, not class-string order, decides specificity).
const BTN_BASE =
  'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-sans text-[13px] font-medium cursor-pointer transition-[background,opacity] duration-[140ms] ease-ease-cubic whitespace-nowrap disabled:opacity-45 disabled:cursor-not-allowed'
const BTN_OUTLINE =
  'bg-transparent border border-border-strong text-text-primary enabled:hover:bg-bg-elevated'
const BTN_PRIMARY =
  'bg-teal-600 text-white border border-transparent enabled:hover:bg-teal-800 disabled:bg-bg-elevated disabled:text-text-dim'

const FORM_INPUT =
  'bg-bg-input border border-border-strong rounded-md px-3 py-[9px] font-sans text-[13px] text-text-primary outline-none transition-[border-color] duration-[140ms] ease-ease-cubic w-full box-border focus:border-teal-400 placeholder:text-text-dim'
const FORM_SELECT =
  'bg-bg-input border border-border-strong rounded-md px-3 py-[9px] pr-[30px] font-sans text-[13px] text-text-primary outline-none cursor-pointer w-full transition-[border-color] duration-[140ms] ease-ease-cubic appearance-none focus:border-teal-400'
// SVG chevron has no design token; raw rgba data URI lives here so it can be
// applied via inline style alongside FORM_SELECT utilities.
const SELECT_STYLE: React.CSSProperties = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.4)' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
}

const BADGE_BASE =
  'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-[3px] rounded-full whitespace-nowrap'
const BADGE_ON =
  'bg-[rgba(74,222,128,0.12)] text-[#4ade80] border border-[rgba(74,222,128,0.28)]'
const BADGE_OFF =
  'bg-[rgba(248,113,113,0.10)] text-[#f87171] border border-[rgba(248,113,113,0.25)]'

const CARD_SURFACE = 'border border-border-strong rounded-md bg-white/[0.02]'

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

      {/* Models section */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-text-primary m-0">Models</h2>
          <button
            type="button"
            className={cn(BTN_BASE, BTN_OUTLINE)}
            onClick={() => setShowDialog(true)}
          >
            Add Model
          </button>
        </div>
        {pageError && <div className="chat-error-banner mono">{pageError}</div>}
        <div className="glass-panel flex flex-col !rounded-lg overflow-hidden">
          {profiles.length === 0 ? (
            <div className="px-[18px] py-7 text-center text-text-dim text-[13px]">
              No model profiles configured yet.
            </div>
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

      {/* Gateway section */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <h2 className="text-sm font-semibold text-text-primary m-0">Gateway URL</h2>
            <span className={cn(BADGE_BASE, isConnected ? BADGE_ON : BADGE_OFF)}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              className={cn(BTN_BASE, BTN_OUTLINE)}
              onClick={() => reconnect.mutate()}
              disabled={reconnect.isPending}
            >
              {reconnect.isPending ? 'Reconnecting…' : 'Reconnect'}
            </button>
            <button
              type="button"
              className={cn(BTN_BASE, BTN_OUTLINE)}
              onClick={() => refreshStatus.mutate()}
              disabled={refreshStatus.isPending}
            >
              {refreshStatus.isPending ? 'Refreshing…' : 'Refresh Status'}
            </button>
            <button
              type="button"
              className={cn(BTN_BASE, BTN_OUTLINE)}
              onClick={() => setShowDiagnostics(true)}
            >
              Diagnose
            </button>
          </div>
        </div>

        <div className="glass-panel flex items-center justify-between gap-5 !px-5 !py-[18px] flex-wrap">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text-primary m-0 mb-1.5">Port</p>
            <p className="text-[13px] text-text-muted leading-[1.55] m-0">
              Gateway will restart automatically after changing the port. If the default port is
              occupied, the system will try adjacent ports.
            </p>
          </div>
          <span className="font-mono text-xs text-text-secondary bg-bg-elevated border border-border-strong rounded-md px-3 py-1.5 whitespace-nowrap flex-shrink-0">
            ws://127.0.0.1:{port}
          </span>
        </div>

        <RuntimeCard
          label="Desktop runtime"
          status={runtimeStatus}
          stats={[
            ['Active provider', summaryQ.data?.activeProvider ?? '—'],
            [
              'Effective profile',
              summaryQ.data?.effectiveProfileId ?? defaultProfileId ?? '—',
            ],
            [
              'Configured profiles',
              String(summaryQ.data?.profilesCount ?? profiles.length),
            ],
            ['Uptime', formatUptime(summaryQ.data?.uptimeSecs)],
          ]}
          footer={
            runtimeIssue ? <div className="chat-error-banner mono">{runtimeIssue}</div> : null
          }
        />

        <div className="glass-panel glass-panel--compact !px-[18px] !py-[14px]">
          <p className="text-[13px] font-semibold text-text-primary m-0 mb-2">
            If the connection is not working, try these options:
          </p>
          <ul className="m-0 pl-[18px] flex flex-col gap-1">
            <li className="text-[13px] text-text-muted leading-[1.5]">
              Reconnect refreshes gateway adapters without changing saved model settings.
            </li>
            <li className="text-[13px] text-text-muted leading-[1.5]">
              Refresh Status reloads runtime health, profiles, config, and adapter state.
            </li>
            <li className="text-[13px] text-text-muted leading-[1.5]">
              Diagnose opens the embedded doctor report with suggested fixes.
            </li>
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
    <div className="flex items-center justify-between px-[18px] py-3.5 border-b border-border-line last:border-b-0">
      <div className="flex flex-col gap-1 min-w-0">
        <span className="text-sm text-text-primary">{profile.name}</span>
        <span className="text-xs text-text-dim [overflow-wrap:anywhere]">
          {formatProfileLabel(profile.provider_kind)} · {formatProfileLabel(profile.auth_method)} ·{' '}
          {profile.default_model}
          {profile.base_url ? ` · ${profile.base_url}` : ''}
        </span>
        {verifyState && (
          <span
            className={cn(
              'text-xs leading-[1.5]',
              verifyState.ok ? 'text-success' : 'text-warning',
            )}
          >
            {verifyState.message}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2.5 flex-wrap justify-end">
        {oauthConnectable && (
          <button
            type="button"
            className={cn(BTN_BASE, BTN_OUTLINE)}
            onClick={onConnectOAuth}
            disabled={busy !== null || verifyBusy}
          >
            Connect OAuth
          </button>
        )}
        <button
          type="button"
          className={cn(BTN_BASE, BTN_OUTLINE)}
          onClick={onVerify}
          disabled={busy !== null || verifyBusy}
        >
          {verifyBusy ? 'Verifying…' : 'Verify'}
        </button>
        {isSelected ? (
          <span className={cn(BADGE_BASE, BADGE_ON)}>Current Selection</span>
        ) : (
          <button
            type="button"
            className={cn(BTN_BASE, BTN_OUTLINE)}
            onClick={onSetDefault}
            disabled={busy !== null}
          >
            {busy === 'default' ? 'Saving…' : 'Set default'}
          </button>
        )}
        <button
          type="button"
          className={cn(BTN_BASE, BTN_OUTLINE)}
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
  const requiresApiKey =
    showApiKey &&
    (selectedProvider.providerKind === 'openai' || selectedProvider.providerKind === 'anthropic') &&
    authMode === 'apikey'

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
    if (requiresApiKey && !apiKey.trim()) {
      setFormError('API key is required for API-key profiles.')
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
        requiresApiKey ? apiKey.trim() : undefined,
    }

    create.mutate(payload, {
      onError: (error) => {
        setFormError(error instanceof Error ? error.message : 'Failed to create profile')
      },
    })
  }

  return (
    <DialogShell ref={dialogRef} title="Add Model" onClose={onClose}>
      <div className="flex items-start gap-2.5 px-3.5 py-3 bg-[rgba(245,193,24,0.08)] border border-[rgba(245,193,24,0.22)] rounded-md text-[13px] text-warning leading-[1.5]">
        <span>!</span>
        Adding a provider profile updates the embedded desktop runtime immediately and persists to
        your local RushDino config.
      </div>

      <FormGroup>
        <FormLabel required>Provider</FormLabel>
        <select
          className={FORM_SELECT}
          style={SELECT_STYLE}
          value={provider}
          onChange={(event) => handleProviderChange(event.target.value as ProviderSelection)}
        >
          {PROVIDERS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </FormGroup>

      <div className="grid grid-cols-2 gap-3.5">
        <FormGroup>
          <FormLabel required>Model ID</FormLabel>
          <input
            className={FORM_INPUT}
            placeholder="gpt-5.4, claude-3-7-sonnet, llama3.2:latest…"
            value={modelId}
            onChange={(event) => setModelId(event.target.value)}
          />
        </FormGroup>
        <FormGroup>
          <FormLabel>Display Name</FormLabel>
          <input
            className={FORM_INPUT}
            placeholder="Defaults to Model ID"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </FormGroup>
      </div>

      <div className="grid grid-cols-2 gap-3.5">
        <FormGroup>
          <FormLabel>Auth method</FormLabel>
          <select
            className={FORM_SELECT}
            style={SELECT_STYLE}
            value={authMode}
            onChange={(event) => setAuthMode(event.target.value as 'apikey' | 'oauth')}
            disabled={!canOAuth}
          >
            <option value="apikey">API key</option>
            <option value="oauth">OAuth</option>
          </select>
        </FormGroup>
        {showApiKey ? (
          <FormGroup>
            <FormLabel>{provider} API Key</FormLabel>
            <div className="relative">
              <input
                className={cn(FORM_INPUT, 'pr-[38px]')}
                type={showKey ? 'text' : 'password'}
                placeholder={
                  canOAuth && authMode === 'oauth'
                    ? 'Not needed for OAuth profiles'
                    : 'Required for API-key profiles'
                }
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                disabled={canOAuth && authMode === 'oauth'}
              />
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 bg-transparent border-none text-text-dim cursor-pointer flex items-center p-0.5 transition-colors duration-[140ms] hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed"
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
          </FormGroup>
        ) : (
          <FormGroup>
            <FormLabel>Authentication</FormLabel>
            <input className={FORM_INPUT} value="No API key required" disabled />
          </FormGroup>
        )}
        <FormGroup>
          <FormLabel>API Protocol</FormLabel>
          <select
            className={FORM_SELECT}
            style={SELECT_STYLE}
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
        </FormGroup>
      </div>

      <FormGroup>
        <FormLabel>Base URL</FormLabel>
        <input
          className={FORM_INPUT}
          placeholder="https://..."
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
        />
      </FormGroup>

      <ConnectivityCard
        label="Connectivity test is no longer mocked"
        desc="Save the profile first. Verification and OAuth connection now happen against real saved desktop profiles."
        action={
          <button type="button" className={cn(BTN_BASE, BTN_OUTLINE)} disabled>
            Save first
          </button>
        }
      />

      {formError && <div className="chat-error-banner mono">{formError}</div>}

      <div className="flex items-center justify-end gap-2.5 pt-1">
        <button type="button" className={cn(BTN_BASE, BTN_OUTLINE)} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={cn(BTN_BASE, BTN_PRIMARY)}
          onClick={handleAdd}
          disabled={create.isPending || !modelId.trim() || (requiresApiKey && !apiKey.trim())}
        >
          {create.isPending ? 'Adding…' : 'Add'}
        </button>
      </div>
    </DialogShell>
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
    <DialogShell ref={dialogRef} title="Desktop Diagnostics" onClose={onClose}>
      <RuntimeCard
        label="Overall status"
        status={doctorQ.data?.status ?? 'attention'}
        statusText={doctorQ.data?.status ?? 'loading'}
        stats={[
          ['Active provider', summary?.activeProvider ?? '—'],
          ['Default profile', summary?.defaultProfileId ?? '—'],
          ['Runtime profile', summary?.effectiveProfileId ?? '—'],
          ['Doctor timestamp', formatTimestamp(doctorQ.data?.generatedAt)],
        ]}
      />

      <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
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

      <div className="flex flex-col gap-3">
        {doctorQ.isLoading ? (
          <div className="px-[18px] py-7 text-center text-text-dim text-[13px]">
            Loading doctor report…
          </div>
        ) : findings.length === 0 ? (
          <div className="px-[18px] py-7 text-center text-text-dim text-[13px]">
            No findings reported by the embedded runtime.
          </div>
        ) : (
          findings.map((finding) => <DiagnosticFinding key={finding.code} finding={finding} />)
        )}
      </div>

      <div className="flex items-center justify-end gap-2.5 pt-1">
        <button
          type="button"
          className={cn(BTN_BASE, BTN_OUTLINE)}
          onClick={() => doctorQ.refetch()}
          disabled={doctorQ.isFetching}
        >
          {doctorQ.isFetching ? 'Refreshing…' : 'Refresh Report'}
        </button>
        <button type="button" className={cn(BTN_BASE, BTN_PRIMARY)} onClick={onClose}>
          Close
        </button>
      </div>
    </DialogShell>
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
  const toneBorder = {
    error: 'border-[rgba(248,113,113,0.32)]',
    warn: 'border-[rgba(245,193,24,0.28)]',
    info: 'border-[rgba(34,211,200,0.24)]',
  }[tone]
  return (
    <div
      className={cn(
        'flex flex-col gap-1.5 px-4 py-3.5 rounded-md border bg-white/[0.02]',
        toneBorder,
      )}
    >
      <span className="text-2xl leading-none font-bold text-text-primary">{count}</span>
      <span className="text-[11px] tracking-[0.08em] uppercase text-text-muted">{label}</span>
    </div>
  )
}

function DiagnosticFinding({ finding }: { finding: DoctorReport['findings'][number] }) {
  return (
    <article className={cn('flex flex-col gap-2 px-[18px] py-4', CARD_SURFACE)}>
      <div className="flex items-center justify-between gap-2.5">
        <span className={cn('text-xs leading-[1.5]', diagnosticToneTextClass(finding.severity))}>
          {finding.severity}
        </span>
        <span className="text-[11px] text-text-dim mono">{finding.code}</span>
      </div>
      <strong className="text-sm text-text-primary">{finding.title}</strong>
      <p className="m-0 text-[13px] leading-[1.55] text-text-muted">{finding.detail}</p>
      <p className="m-0 text-[13px] leading-[1.55] text-text-secondary">{finding.action}</p>
      <span className="text-[11px] text-teal-300 mono">
        {finding.fixable ? 'Fixable from desktop config' : 'Needs manual follow-up'}
      </span>
    </article>
  )
}

function RuntimeCard({
  label,
  status,
  statusText,
  stats,
  footer,
}: {
  label: string
  status: string
  statusText?: string
  stats: ReadonlyArray<readonly [string, string]>
  footer?: React.ReactNode
}) {
  const isOn = status === 'healthy'
  return (
    <div className="glass-panel glass-panel--compact flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-text-dim">
          {label}
        </span>
        <span className={cn(BADGE_BASE, isOn ? BADGE_ON : BADGE_OFF)}>{statusText ?? status}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        {stats.map(([k, v]) => (
          <RuntimeStat key={k} label={k} value={v} />
        ))}
      </div>
      {footer}
    </div>
  )
}

function RuntimeStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] text-text-muted uppercase tracking-[0.08em]">{label}</span>
      <span className="text-[13px] text-text-primary mono">{value}</span>
    </div>
  )
}

// ── Form helpers ────────────────────────────────────────────────────────────
function FormGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-1.5">{children}</div>
}

function FormLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-xs font-medium text-text-muted">
      {required && <span className="text-error mr-0.5">*</span>}
      {children}
    </label>
  )
}

function ConnectivityCard({
  label,
  desc,
  action,
}: {
  label: string
  desc: string
  action: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5 bg-bg-card border border-border-base rounded-md">
      <div className="flex items-start gap-2.5 flex-1">
        <div>
          <p className="text-[13px] font-semibold text-text-primary m-0 mb-0.5">{label}</p>
          <p className="text-xs text-text-dim m-0">{desc}</p>
        </div>
      </div>
      {action}
    </div>
  )
}

// ── Dialog shell ────────────────────────────────────────────────────────────
type DialogShellProps = {
  children: ReactNode
  title: string
  onClose: () => void
}

const DialogShell = forwardRef<HTMLDialogElement, DialogShellProps>(
  function DialogShell({ children, title, onClose }, ref) {
    return (
      <dialog
        ref={ref}
        onClose={onClose}
        className="border-none rounded-xl bg-bg-panel shadow-[0_24px_80px_rgba(0,0,0,0.6),0_0_0_1px_var(--ds-border-strong)] p-0 max-w-[680px] w-[calc(100vw-48px)] max-h-[calc(100vh-80px)] overflow-hidden backdrop:bg-[rgba(0,0,0,0.55)] backdrop:[backdrop-filter:blur(4px)]"
      >
        <div className="flex flex-col gap-[18px] px-7 pt-6 pb-7 overflow-y-auto max-h-[calc(100vh-80px)]">
          <div className="flex items-center justify-between">
            <h2 className="text-[17px] font-semibold text-text-primary m-0">{title}</h2>
            <button
              type="button"
              className="bg-transparent border-none text-text-dim cursor-pointer p-1 rounded-sm flex items-center transition-colors duration-[140ms] hover:text-text-primary"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={18} strokeWidth={1.8} />
            </button>
          </div>
          {children}
        </div>
      </dialog>
    )
  },
)

// ── Helpers ─────────────────────────────────────────────────────────────────
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

function diagnosticToneTextClass(severity: string): string {
  // Mirrors legacy ma-model-status--{error,pending,ok}: error→warning hue,
  // warn→default text, default→success.
  switch (severity) {
    case 'error':
      return 'text-warning'
    case 'warn':
      return ''
    default:
      return 'text-success'
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
    <DialogShell ref={dialogRef} title="Connect OAuth" onClose={onClose}>
      <div className="flex items-start gap-2.5 px-3.5 py-3 bg-[rgba(245,193,24,0.08)] border border-[rgba(245,193,24,0.22)] rounded-md text-[13px] text-warning leading-[1.5]">
        <span>!</span>
        Complete OAuth in your browser, then paste the final redirect URL back here so the desktop
        app can exchange tokens locally.
      </div>

      <FormGroup>
        <FormLabel>Profile</FormLabel>
        <input
          className={FORM_INPUT}
          value={`${profile.name} · ${formatProfileLabel(profile.provider_kind)}`}
          disabled
        />
      </FormGroup>

      <ConnectivityCard
        label={session ? 'OAuth session ready' : 'Start an OAuth session'}
        desc={
          session
            ? 'Open the auth URL below, authorize the provider, then paste the redirected URL.'
            : 'The embedded server will generate a PKCE login URL for this saved profile.'
        }
        action={
          <button
            type="button"
            className={cn(BTN_BASE, BTN_OUTLINE)}
            onClick={() => start.mutate()}
            disabled={start.isPending}
          >
            {start.isPending ? 'Starting…' : session ? 'Restart OAuth' : 'Start OAuth'}
          </button>
        }
      />

      {session && (
        <>
          <FormGroup>
            <FormLabel>Authorization URL</FormLabel>
            <textarea className={FORM_INPUT} value={session.auth_url} readOnly rows={4} />
          </FormGroup>
          <FormGroup>
            <FormLabel>Redirect URL</FormLabel>
            <textarea
              className={FORM_INPUT}
              placeholder="Paste the full redirect URL after approval"
              rows={4}
              value={redirectUrl}
              onChange={(event) => setRedirectUrl(event.target.value)}
            />
          </FormGroup>
        </>
      )}

      {error && <div className="chat-error-banner mono">{error}</div>}

      <div className="flex items-center justify-end gap-2.5 pt-1">
        <button type="button" className={cn(BTN_BASE, BTN_OUTLINE)} onClick={onClose}>
          Close
        </button>
        <button
          type="button"
          className={cn(BTN_BASE, BTN_PRIMARY)}
          onClick={() => complete.mutate()}
          disabled={!session || !redirectUrl.trim() || complete.isPending}
        >
          {complete.isPending ? 'Connecting…' : 'Complete OAuth'}
        </button>
      </div>
    </DialogShell>
  )
}
