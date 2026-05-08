import { Plus, ShieldCheck, ChevronDown, ArrowUp, Square } from 'lucide-react'
import { FileText, X as XIcon } from 'lucide-react'
import type { ProviderProfile } from '@/api/providers'
import type { ThinkingLevel } from '@/api/system'
import { basename } from '@/hooks/useAttachments'

export const THINKING_OPTIONS: Array<{ value: ThinkingLevel; label: string }> = [
  { value: 'off', label: 'Off' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'XHigh' },
  { value: 'adaptive', label: 'Adaptive' },
]

/** Returns a human-readable label for a provider profile. */
export function profileLabel(profile: ProviderProfile): string {
  const provider = profile.provider_kind.toLowerCase()
  return `${profile.name} · ${provider}`
}

/** The message composer form with attachment support, model selector, and thinking mode selector. */
export function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  textareaRef,
  disabled,
  streaming,
  attachments,
  dragActive,
  onPickFiles,
  onRemoveAttachment,
  activeProfile,
  profiles,
  selectedProfileId,
  thinkingMode,
  onSelectProfile,
  onSelectThinkingMode,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  onStop?: () => void
  textareaRef: React.RefObject<HTMLTextAreaElement>
  disabled?: boolean
  /** True while the agent is actively streaming. Renders the stop button and disables input. */
  streaming?: boolean
  attachments: string[]
  dragActive: boolean
  onPickFiles: () => void
  onRemoveAttachment: (path: string) => void
  activeProfile: ProviderProfile | null
  profiles: ProviderProfile[]
  selectedProfileId: string
  thinkingMode: ThinkingLevel
  onSelectProfile: (profileId: string) => void
  onSelectThinkingMode: (level: ThinkingLevel) => void
}) {
  const inputDisabled = disabled || streaming === true
  return (
    <form
      className={`composer ${dragActive ? 'composer--drop' : ''}`}
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <div className="composer__wrap">
        {attachments.length > 0 && (
          <ul className="composer__attachments">
            {attachments.map((p) => (
              <li key={p} className="composer-attach">
                <FileText size={11} strokeWidth={1.7} className="composer-attach__icon" />
                <span className="composer-attach__name" title={p}>
                  {basename(p)}
                </span>
                <button
                  type="button"
                  className="composer-attach__remove"
                  onClick={() => onRemoveAttachment(p)}
                  aria-label={`Remove ${basename(p)}`}
                >
                  <XIcon size={10} strokeWidth={1.8} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <textarea
          ref={textareaRef}
          className="composer__input"
          placeholder={dragActive ? 'Drop files to attach…' : 'Message rushdino'}
          value={value}
          disabled={inputDisabled}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (inputDisabled) return
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              onSubmit()
            } else if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSubmit()
            }
          }}
          rows={3}
        />
        <div className="composer__actions">
          <button
            type="button"
            className="composer__icon"
            aria-label="Attach files"
            onClick={onPickFiles}
            title="Attach files (⌘⇧F)"
            disabled={inputDisabled}
          >
            <Plus size={15} strokeWidth={1.8} />
          </button>
          <button type="button" className="composer__pill" aria-label="Permissions" disabled={inputDisabled}>
            <ShieldCheck size={13} strokeWidth={1.7} />
            <span>Default permissions</span>
            <ChevronDown size={10} strokeWidth={2} />
          </button>
          <div className="composer__spacer" />
          <label className="composer__control" aria-label="Model profile">
            <span className="composer__control-label">Model</span>
            <select
              className="composer__select"
              value={selectedProfileId}
              disabled={inputDisabled || profiles.length === 0}
              onChange={(event) => onSelectProfile(event.target.value)}
            >
              {profiles.length === 0 ? (
                <option value="">No profile configured</option>
              ) : (
                profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profileLabel(profile)}
                  </option>
                ))
              )}
            </select>
            {activeProfile && (
              <span className="composer__control-meta">{activeProfile.default_model}</span>
            )}
          </label>
          <label className="composer__control" aria-label="Thinking mode">
            <span className="composer__control-label">Thinking</span>
            <select
              className="composer__select"
              value={thinkingMode}
              disabled={inputDisabled}
              onChange={(event) => onSelectThinkingMode(event.target.value as ThinkingLevel)}
            >
              {THINKING_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {streaming ? (
            <button
              type="button"
              className="composer__send composer__send--stop"
              onClick={onStop}
              aria-label="Stop generating"
              title="Stop generating (Esc)"
            >
              <Square size={11} strokeWidth={2.5} fill="currentColor" />
            </button>
          ) : (
            <button
              type="submit"
              className="composer__send"
              disabled={disabled}
              aria-label="Send message"
            >
              <ArrowUp size={15} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>
    </form>
  )
}
