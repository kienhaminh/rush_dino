import { useState } from 'react'
import { ArrowUp } from 'lucide-react'

import { GlassPanel } from '@/components/glass/GlassPanel'
import { SettingsPageHeader } from '@/components/settings/SettingsPageHeader'

export default function SettingsFeedback() {
  const [text, setText] = useState('')
  const [sent, setSent] = useState(false)

  return (
    <div className="flex w-full max-w-[920px] flex-col gap-5">
      <SettingsPageHeader
        title="Feedback"
        lede="Tell us what's broken, what's confusing, or what you'd love to see next. Everything stays local until you send."
      />

      {sent ? (
        <GlassPanel variant="compact">
          <p className="m-0 text-[13px] text-text-dim">
            Thanks — your note was copied to the clipboard so you can paste it into the
            channel of your choice (GitHub issue, Discord, email).
          </p>
        </GlassPanel>
      ) : (
        <form
          className="flex w-full flex-col gap-3 rounded-lg border border-border-strong bg-bg-panel px-4 py-3.5 transition-colors duration-[160ms] ease-ease-cubic focus-within:border-teal-line"
          onSubmit={(e) => {
            e.preventDefault()
            void navigator.clipboard?.writeText(text).catch(() => {})
            setSent(true)
            setText('')
          }}
        >
          <textarea
            className="min-h-[120px] w-full resize-none border-none bg-transparent px-2 py-1 text-left font-sans text-[13px] leading-[1.5] text-text-primary outline-none placeholder:text-text-dim"
            placeholder="What's on your mind?"
            rows={6}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex items-center justify-end">
            <button
              type="submit"
              className="inline-flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-full border border-teal-line bg-teal-soft text-teal-400 transition-[background-color,color,transform] duration-[160ms] ease-ease-cubic enabled:hover:bg-teal-400 enabled:hover:text-bg-base disabled:cursor-default disabled:opacity-[0.35]"
              disabled={!text.trim()}
              aria-label="Send feedback"
            >
              <ArrowUp size={15} strokeWidth={2.5} />
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
