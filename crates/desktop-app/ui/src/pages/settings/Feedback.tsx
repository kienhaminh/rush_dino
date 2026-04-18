import { useState } from 'react'
import { ArrowUp } from 'lucide-react'

import { GlassPanel } from '@/components/glass/GlassPanel'
import { SettingsPageHeader } from '@/components/settings/SettingsPageHeader'

export default function SettingsFeedback() {
  const [text, setText] = useState('')
  const [sent, setSent] = useState(false)

  return (
    <div className="settings-page">
      <SettingsPageHeader
        title="Feedback"
        lede="Tell us what's broken, what's confusing, or what you'd love to see next. Everything stays local until you send."
      />

      {sent ? (
        <GlassPanel variant="compact">
          <p className="kg-hint" style={{ margin: 0 }}>
            Thanks — your note was copied to the clipboard so you can paste it into the
            channel of your choice (GitHub issue, Discord, email).
          </p>
        </GlassPanel>
      ) : (
        <form
          className="composer feedback-composer"
          onSubmit={(e) => {
            e.preventDefault()
            void navigator.clipboard?.writeText(text).catch(() => {})
            setSent(true)
            setText('')
          }}
        >
          <div className="composer__wrap">
            <textarea
              className="composer__input"
              placeholder="What's on your mind?"
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="composer__actions">
              <div className="composer__spacer" />
              <button
                type="submit"
                className="composer__send"
                disabled={!text.trim()}
                aria-label="Send feedback"
              >
                <ArrowUp size={15} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  )
}
