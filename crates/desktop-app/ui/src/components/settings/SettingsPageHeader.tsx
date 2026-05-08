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
      <header className="pb-1 [-webkit-app-region:drag] [app-region:drag]">
        <p className="eyebrow mb-2">{eyebrow}</p>
        <h1 className="display-title mt-0 text-[clamp(24px,2.6vw,32px)] leading-[1.1]">
          {title}
        </h1>
        {lede && <p className="lede mt-2 text-sm">{lede}</p>}
      </header>
      {divider && (
        <div
          className="h-px w-full bg-border-line"
          aria-hidden
        />
      )}
    </>
  )
}
