interface Props {
  eyebrow?: string
  title: string
  lede?: React.ReactNode
  /** When true, renders a thin divider below the header. */
  divider?: boolean
}

export function SettingsPageHeader({
  eyebrow = 'Settings',
  title,
  lede,
  divider,
}: Props) {
  return (
    <>
      <header className="settings-page__header">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="display-title">{title}</h1>
        {lede && <p className="lede">{lede}</p>}
      </header>
      {divider && <div className="settings-page__divider" aria-hidden />}
    </>
  )
}
