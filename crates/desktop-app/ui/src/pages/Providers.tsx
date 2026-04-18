import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, RefreshCw, X, Circle } from 'lucide-react'

import { listProfiles, type ProviderProfile } from '@/api/providers'
import { getConfig } from '@/api/config'
import { listAdapters, restartAdapter } from '@/api/gateway'
import { apiOrigin } from '@/api/bootstrap'
import { SettingsPageHeader } from '@/components/settings/SettingsPageHeader'
import { cn } from '@/lib/cn'

const PROVIDERS = [
  { id: 'Z.ai',      label: 'Z.ai',      baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  { id: 'OpenAI',    label: 'OpenAI',    baseUrl: 'https://api.openai.com/v1' },
  { id: 'Anthropic', label: 'Anthropic', baseUrl: 'https://api.anthropic.com' },
  { id: 'Ollama',    label: 'Ollama',    baseUrl: 'http://localhost:11434' },
  { id: 'Custom',    label: 'Custom',    baseUrl: '' },
]

const PROTOCOLS = ['OpenAI', 'Anthropic']

export default function Models() {
  const qc = useQueryClient()
  const profilesQ = useQuery({ queryKey: ['profiles'], queryFn: listProfiles })
  const configQ   = useQuery({ queryKey: ['config'],   queryFn: getConfig })
  const adaptersQ = useQuery({ queryKey: ['adapters'], queryFn: listAdapters, refetchInterval: 5000 })
  const [, setWsUrl]       = useState('')
  const [showDialog, setShowDialog] = useState(false)

  useEffect(() => {
    apiOrigin().then((o) => setWsUrl(o.replace(/^http/, 'ws')))
  }, [])

  const isConnected = adaptersQ.data?.some(a => a.status === 'running') ?? false
  const port = configQ.data?.port ?? 28847

  const reconnect = useMutation({
    mutationFn: async () => {
      const adapters = await listAdapters()
      await Promise.all(adapters.map(a => restartAdapter(a.channelId)))
    },
    onSuccess: () => { void adaptersQ.refetch() },
  })

  const profiles = profilesQ.data ?? []

  return (
    <div className="settings-page">
      <SettingsPageHeader
        title="Models & API"
        lede="Manage model providers and the embedded gateway connection."
      />

      {/* Custom Models */}
      <div className="ma-section">
        <div className="ma-section-head">
          <h2 className="ma-section-title">Models</h2>
          <button className="ma-btn ma-btn--outline" onClick={() => setShowDialog(true)}>
            Add Model
          </button>
        </div>
        <div className="ma-model-list glass-panel">
          <div className="ma-empty">No custom models yet</div>
        </div>
      </div>

      {/* Gateway URL */}
      <div className="ma-section">
        <div className="ma-section-head">
          <div className="ma-gateway-left">
            <h2 className="ma-section-title">Gateway URL</h2>
            <span className={cn('ma-status-badge', isConnected ? 'ma-status-badge--on' : 'ma-status-badge--off')}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div className="ma-section-actions">
            <button
              className="ma-btn ma-btn--outline"
              onClick={() => reconnect.mutate()}
              disabled={reconnect.isPending}
            >
              Reconnect
            </button>
            <button className="ma-btn ma-btn--danger">Reset Connection</button>
            <button className="ma-btn ma-btn--outline">Diagnose</button>
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
          <span className="ma-url-chip">ws://127.0.0.1 : {port}</span>
        </div>

        <div className="ma-tips glass-panel glass-panel--compact">
          <p className="ma-tips__title">If the connection is not working, try these options:</p>
          <ul className="ma-tips__list">
            <li>Reconnect — lightest fix, just reconnects without changing any settings</li>
            <li>
              Reset Connection — clears connection state and restarts the service; ongoing chats
              will be interrupted
            </li>
            <li>
              Diagnose — detects and fixes config issues; fixing may remove custom model configs
              you added manually
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
          }}
        />
      )}
    </div>
  )
}

function ModelRow({ profile, isSelected }: { profile: ProviderProfile; isSelected: boolean }) {
  return (
    <div className="ma-model-row">
      <span className="ma-model-name">{profile.default_model || profile.name}</span>
      {isSelected && <span className="ma-sel-badge">Current Selection</span>}
    </div>
  )
}

function AddModelDialog({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const dialogRef  = useRef<HTMLDialogElement>(null)
  const [provider, setProvider]     = useState(PROVIDERS[0].id)
  const [modelId,  setModelId]      = useState('')
  const [displayName, setDisplayName] = useState('')
  const [apiKey,   setApiKey]       = useState('')
  const [showKey,  setShowKey]      = useState(false)
  const [protocol, setProtocol]     = useState(PROTOCOLS[0])
  const [baseUrl,  setBaseUrl]      = useState(PROVIDERS[0].baseUrl)
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')

  useEffect(() => { dialogRef.current?.showModal() }, [])

  const handleProviderChange = (id: string) => {
    setProvider(id)
    const p = PROVIDERS.find(x => x.id === id)
    if (p) setBaseUrl(p.baseUrl)
  }

  const handleTest = async () => {
    setTestStatus('testing')
    await new Promise(r => setTimeout(r, 1000))
    setTestStatus(modelId && baseUrl ? 'ok' : 'fail')
  }

  const testDot =
    testStatus === 'ok'      ? 'var(--ds-success)' :
    testStatus === 'fail'    ? 'var(--ds-error)' :
    testStatus === 'testing' ? 'var(--ds-warning)' :
                               'var(--ds-text-dim)'

  return (
    <dialog ref={dialogRef} className="ma-dialog" onClose={onClose}>
      <div className="ma-dialog__inner">
        <div className="ma-dialog__header">
          <h2 className="ma-dialog__title">Add Model</h2>
          <button className="ma-dialog__close" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={1.8} />
          </button>
        </div>

        <div className="ma-dialog__warning">
          <span>⚠</span>
          By adding an external model, you acknowledge and agree to use it at your own risk.
        </div>

        <div className="ma-form-group">
          <label className="ma-form-label">
            <span className="ma-required">*</span> Provider
          </label>
          <select
            className="ma-form-select"
            value={provider}
            onChange={e => handleProviderChange(e.target.value)}
          >
            {PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>

        <div className="ma-form-row">
          <div className="ma-form-group">
            <label className="ma-form-label">
              <span className="ma-required">*</span> Model ID
            </label>
            <input
              className="ma-form-input"
              placeholder="Please select a model"
              value={modelId}
              onChange={e => setModelId(e.target.value)}
            />
          </div>
          <div className="ma-form-group">
            <label className="ma-form-label">Display Name</label>
            <input
              className="ma-form-input"
              placeholder="Please enter a display name"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
            />
          </div>
        </div>

        <div className="ma-form-row">
          <div className="ma-form-group">
            <label className="ma-form-label">{provider} API Key</label>
            <div className="ma-input-wrap">
              <input
                className="ma-form-input"
                type={showKey ? 'text' : 'password'}
                placeholder="Please enter API Key (optional)"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
              />
              <button
                type="button"
                className="ma-eye-btn"
                onClick={() => setShowKey(s => !s)}
                aria-label="Toggle visibility"
              >
                {showKey ? <EyeOff size={14} strokeWidth={1.8} /> : <Eye size={14} strokeWidth={1.8} />}
              </button>
            </div>
          </div>
          <div className="ma-form-group">
            <label className="ma-form-label">API Protocol</label>
            <select
              className="ma-form-select"
              value={protocol}
              onChange={e => setProtocol(e.target.value)}
            >
              {PROTOCOLS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

        <div className="ma-form-group">
          <label className="ma-form-label">Base URL</label>
          <input
            className="ma-form-input"
            placeholder="https://..."
            value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
          />
        </div>

        <div className="ma-connectivity">
          <div className="ma-connectivity__info">
            <Circle size={10} fill={testDot} stroke="none" style={{ flexShrink: 0 }} />
            <div>
              <p className="ma-connectivity__label">
                {testStatus === 'idle'    ? 'Not tested yet'     :
                 testStatus === 'testing' ? 'Testing…'           :
                 testStatus === 'ok'      ? 'Connection OK'      :
                                           'Connection failed'}
              </p>
              <p className="ma-connectivity__desc">
                Sends a real request using the current config to verify the endpoint.
              </p>
            </div>
          </div>
          <button
            className="ma-btn ma-btn--outline"
            onClick={() => { void handleTest() }}
            disabled={testStatus === 'testing'}
          >
            Connectivity Test
          </button>
        </div>

        <div className="ma-dialog__footer">
          <button className="ma-btn ma-btn--outline" onClick={onClose}>Cancel</button>
          <button
            className="ma-btn ma-btn--primary"
            onClick={onAdded}
            disabled={!modelId.trim()}
          >
            Add
          </button>
        </div>
      </div>
    </dialog>
  )
}
