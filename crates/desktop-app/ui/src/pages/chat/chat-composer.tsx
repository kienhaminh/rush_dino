import { useNavigate } from 'react-router-dom'
import { Plus, ShieldCheck, ChevronDown, ArrowUp, Square, Settings } from 'lucide-react'
import { FileText, X as XIcon } from 'lucide-react'
import type { ProviderProfile } from '@/api/providers'
import type { ThinkingLevel } from '@/api/system'
import { Button } from '@/components/primitives/Button'
import { basename } from '@/hooks/useAttachments'

export const THINKING_OPTIONS: Array<{ value: ThinkingLevel; label: string }> = [
  { value: 'off', label: 'Off' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Extra High' },
  { value: 'adaptive', label: 'Adaptive' },
]

/** Returns a human-readable label for a provider profile. */
export function profileLabel(profile: ProviderProfile): string {
  const provider = profile.provider_kind.toLowerCase()
  return `${profile.name} · ${provider}`
}

/** Native select keeps macOS keyboard navigation and system menu behavior. */
function CustomDropdown<T extends string>({
  value,
  options,
  sectionLabel,
  disabled,
  onChange,
}: {
  value: T
  options: Array<{ value: T; label: string }>
  sectionLabel: string
  disabled?: boolean
  onChange: (v: T) => void
}) {
  return (
    <label className="relative inline-flex h-7 items-center gap-1.5 rounded-md border border-border-strong bg-bg-card pl-2 pr-1 text-xs text-text-muted">
      <span className="text-[11px]">{sectionLabel}</span>
      <select
        aria-label={sectionLabel}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as T)}
        className="min-w-0 max-w-[180px] appearance-none border-0 bg-transparent py-1 pl-0 pr-5 font-sans text-xs font-medium text-text-primary outline-none disabled:cursor-default disabled:opacity-50"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={10}
        strokeWidth={2}
        className="pointer-events-none absolute right-1.5 text-text-dim"
        aria-hidden
      />
    </label>
  )
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
  activeProfile: _activeProfile,
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
  activeProfile?: ProviderProfile | null
  profiles: ProviderProfile[]
  selectedProfileId: string
  thinkingMode: ThinkingLevel
  onSelectProfile: (profileId: string) => void
  onSelectThinkingMode: (level: ThinkingLevel) => void
}) {
  const navigate = useNavigate()
  const inputDisabled = disabled || streaming === true
  const canSubmit = !inputDisabled && (value.trim().length > 0 || attachments.length > 0)
  const dropOutline = dragActive
    ? 'outline outline-2 outline-dashed outline-teal-line outline-offset-[3px]'
    : ''

  const profileOptions = profiles.map((p) => ({ value: p.id, label: profileLabel(p) }))

  return (
    <form
      className={`block max-w-[820px] w-[calc(100%_-_48px)] mx-auto mb-4 px-3 pt-2.5 pb-2 bg-bg-panel border border-border-strong rounded-xl shadow-[0_1px_2px_rgb(0_0_0_/_0.04)] transition-[border-color,box-shadow] duration-150 ease-ease-cubic focus-within:border-teal-line focus-within:shadow-[0_0_0_3px_var(--ds-teal-soft)] ${dropOutline}`}
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <div className="flex flex-col gap-2.5">
        {attachments.length > 0 && (
          <ul className="list-none m-0 mb-2 p-0 flex flex-wrap gap-1.5">
            {attachments.map((p) => (
              <li
                key={p}
                className="inline-flex items-center gap-1.5 pl-2 pr-1 py-[3px] bg-bg-card border border-border-strong rounded-md font-mono text-[11px] text-text-secondary max-w-[220px]"
              >
                <FileText
                  size={11}
                  strokeWidth={1.7}
                  className="text-text-dim flex-shrink-0"
                />
                <span className="overflow-hidden text-ellipsis whitespace-nowrap" title={p}>
                  {basename(p)}
                </span>
                <button
                  type="button"
                  className="inline-flex items-center justify-center w-[18px] h-[18px] border-0 rounded bg-transparent text-text-dim cursor-pointer hover:bg-[rgb(248_113_113_/_0.12)] hover:text-error transition-[background,color] duration-150 ease-ease-cubic"
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
          className="w-full bg-transparent border-0 outline-none text-text-primary font-sans text-[13px] leading-[1.5] resize-none px-2 py-1 min-h-[26px] max-h-[220px] placeholder:text-text-dim"
          placeholder={dragActive ? 'Drop files to attach…' : 'Message RushDino'}
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
          rows={2}
        />
        <div className="flex items-center gap-1.5">
          <Button
            variant="square"
            className="size-7"
            aria-label="Attach files"
            onClick={onPickFiles}
            title="Attach files (⌘⇧F)"
            disabled={inputDisabled}
          >
            <Plus size={15} strokeWidth={1.8} />
          </Button>
          <Button
            variant="ghost"
            className="h-7 rounded-md px-2 text-xs"
            aria-label="Open permission settings"
            title="Permission settings"
            onClick={() => navigate('/settings/privacy')}
            disabled={inputDisabled}
          >
            <ShieldCheck size={13} strokeWidth={1.7} />
            <span>Default permissions</span>
          </Button>
          <div className="flex-1" />
          {profiles.length === 0 ? (
            <button
              type="button"
              onClick={() => navigate('/settings/models')}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border-strong bg-bg-card px-2 text-xs text-text-muted cursor-pointer group"
              title="Configure a model profile to get started"
            >
              <span>Model</span>
              <span className="text-text-dim transition-colors group-hover:text-text-primary">
                No profile configured
              </span>
              <Settings size={11} className="text-text-dim transition-colors group-hover:text-text-primary" />
            </button>
          ) : (
            <CustomDropdown
              value={selectedProfileId}
              options={profileOptions}
              sectionLabel="Model"
              disabled={inputDisabled}
              onChange={onSelectProfile}
            />
          )}
          <CustomDropdown
            value={thinkingMode}
            options={THINKING_OPTIONS}
            sectionLabel="Thinking"
            disabled={inputDisabled}
            onChange={onSelectThinkingMode}
          />
          {streaming ? (
            <Button
              variant="square"
              className="ml-0.5 size-7 text-text-primary hover:!border-error hover:!text-error"
              onClick={onStop}
              aria-label="Stop generating"
              title="Stop generating (Esc)"
            >
              <Square size={11} strokeWidth={2.5} fill="currentColor" />
            </Button>
          ) : (
            <Button
              type="submit"
              variant="primary"
              className="ml-0.5 size-7 rounded-full p-0"
              disabled={!canSubmit}
              aria-label="Send message"
            >
              <ArrowUp size={15} strokeWidth={2.5} />
            </Button>
          )}
        </div>
      </div>
    </form>
  )
}
