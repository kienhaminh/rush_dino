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

/* Shared utility classes for the composer's pill-shaped meta controls
   (Permissions, Model, Thinking). Mirrors the legacy `.composer__pill` and
   `.composer__control` rules.

   - `pill`     — flat, no border, hover background tint (matches legacy
                  composer__pill in chat.css)
   - `control`  — bordered, transparent fill (matches legacy
                  composer__control). Used for Model + Thinking selectors. */
const PILL_BUTTON =
  'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border-0 bg-transparent text-text-muted font-sans text-xs cursor-pointer whitespace-nowrap transition-[background,color,border-color] duration-150 ease-ease-cubic hover:bg-[rgb(0_0_0_/_0.04)] dark:hover:bg-[rgb(255_255_255_/_0.05)] hover:text-text-primary disabled:opacity-50 disabled:cursor-default'

const CONTROL_PILL =
  'inline-flex items-center gap-2 px-2.5 py-1 min-h-[30px] rounded-full border border-border-strong bg-[rgb(255_255_255_/_0.02)]'

const CONTROL_LABEL =
  'font-mono text-[10px] tracking-[0.08em] uppercase text-text-dim'

const SELECT_CLASSES =
  'min-w-[116px] max-w-[220px] border-0 bg-transparent text-text-primary text-xs font-semibold outline-none cursor-pointer disabled:cursor-default disabled:text-text-dim [&>option]:bg-[#0d1117] [&>option]:text-text-primary'

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
  const dropOutline = dragActive
    ? 'outline outline-2 outline-dashed outline-teal-line outline-offset-[3px]'
    : ''
  return (
    <form
      className={`block max-w-[820px] w-[calc(100%-48px)] mx-auto mb-5 px-2 pt-2.5 pb-2 bg-bg-card border border-border-strong rounded-[24px] shadow-[0_1px_4px_rgb(0_0_0_/_0.04)] transition-[border-color,box-shadow] duration-150 ease-ease-cubic focus-within:shadow-[0_2px_16px_-6px_rgb(0_0_0_/_0.10)] ${dropOutline}`}
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
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="inline-flex items-center justify-center w-[30px] h-[30px] rounded-full border-0 bg-transparent text-text-muted cursor-pointer flex-shrink-0 transition-[background,color] duration-150 ease-ease-cubic hover:bg-[rgb(0_0_0_/_0.05)] dark:hover:bg-[rgb(255_255_255_/_0.06)] hover:text-text-primary disabled:opacity-50 disabled:cursor-default"
            aria-label="Attach files"
            onClick={onPickFiles}
            title="Attach files (⌘⇧F)"
            disabled={inputDisabled}
          >
            <Plus size={15} strokeWidth={1.8} />
          </button>
          <button type="button" className={PILL_BUTTON} aria-label="Permissions" disabled={inputDisabled}>
            <ShieldCheck size={13} strokeWidth={1.7} />
            <span>Default permissions</span>
            <ChevronDown size={10} strokeWidth={2} />
          </button>
          <div className="flex-1" />
          <label className={CONTROL_PILL} aria-label="Model profile">
            <span className={CONTROL_LABEL}>Model</span>
            <select
              className={SELECT_CLASSES}
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
              <span className="max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-teal-300">
                {activeProfile.default_model}
              </span>
            )}
          </label>
          <label className={CONTROL_PILL} aria-label="Thinking mode">
            <span className={CONTROL_LABEL}>Thinking</span>
            <select
              className={SELECT_CLASSES}
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
              className="inline-flex items-center justify-center w-[30px] h-[30px] rounded-full bg-bg-base text-text-primary border border-border-strong cursor-pointer flex-shrink-0 p-0 transition-[background,opacity,border-color,color] duration-150 ease-ease-cubic hover:border-error hover:text-error"
              onClick={onStop}
              aria-label="Stop generating"
              title="Stop generating (Esc)"
            >
              <Square size={11} strokeWidth={2.5} fill="currentColor" />
            </button>
          ) : (
            <button
              type="submit"
              className="inline-flex items-center justify-center w-[30px] h-[30px] rounded-full bg-teal-400 text-bg-main border-0 cursor-pointer flex-shrink-0 p-0 transition-[background,opacity] duration-150 ease-ease-cubic [&:hover:not(:disabled)]:opacity-[0.82] disabled:opacity-25 disabled:cursor-default"
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
