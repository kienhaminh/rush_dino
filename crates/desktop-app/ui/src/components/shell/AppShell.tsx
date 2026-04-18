import { useCallback, useEffect, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { PanelLeft } from 'lucide-react'

import { CommandPalette } from '@/components/command-palette/CommandPalette'
import { LeftRail } from './LeftRail'
import { UpdateBanner } from './UpdateBanner'
import { useUpdater } from '@/hooks/useUpdater'
import { cn } from '@/lib/cn'

export function AppShell() {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()

  const openPalette = useCallback(() => setPaletteOpen(true), [])
  const startNewChat = useCallback(() => navigate('/'), [navigate])
  const toggleSidebar = useCallback(() => setCollapsed((v) => !v), [])

  /* Poll the updater 5s after mount, then every six hours. Shows an
     in-window banner when a newer release is available. */
  const updater = useUpdater({ autoCheck: true })

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey
      if (!meta) return
      const k = e.key.toLowerCase()
      if (k === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      } else if (k === 'n') {
        e.preventDefault()
        navigate('/')
      } else if (k === ',') {
        e.preventDefault()
        navigate('/settings')
      } else if (e.key === '\\') {
        /* ⌘\ toggles the sidebar — matches Mail.app / Messages.app. */
        e.preventDefault()
        setCollapsed((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  /* Tauri-side events: global ⌘⇧Space shortcut emits `palette:toggle`, and
     the native menu bar emits `menu:new-chat` / `menu:settings` clicks. */
  useEffect(() => {
    if (typeof (window as { __TAURI__?: unknown }).__TAURI__ === 'undefined') return
    const unsubs: Array<() => void> = []
    void import('@tauri-apps/api/event').then(async ({ listen }) => {
      unsubs.push(await listen('palette:toggle', () => setPaletteOpen((v) => !v)))
      unsubs.push(await listen('menu:new-chat', () => navigate('/')))
      unsubs.push(await listen('menu:settings', () => navigate('/settings')))
    })
    return () => {
      for (const off of unsubs) off()
    }
  }, [navigate])

  /* Keep the banner up through install so the user sees "Installing…"
     until Tauri relaunches the app. `info` stays populated across that
     transition because the hook doesn't clear it on install(). */
  const showBanner =
    (updater.status === 'available' || updater.status === 'installing') &&
    updater.info !== null

  return (
    <div
      className={cn(
        'app-root',
        collapsed && 'app-root--collapsed',
        showBanner && 'app-root--with-banner',
      )}
    >
      {showBanner && updater.info && (
        <UpdateBanner
          info={updater.info}
          installing={updater.status === 'installing'}
          onInstall={() => void updater.install()}
          onDismiss={updater.dismiss}
        />
      )}
      <LeftRail
        onOpenPalette={openPalette}
        onNewChat={startNewChat}
        onToggleSidebar={toggleSidebar}
      />
      {collapsed && (
        <button
          type="button"
          className="sidebar-floating-toggle"
          onClick={toggleSidebar}
          aria-label="Show sidebar"
          title="Show sidebar (⌘\\)"
        >
          <PanelLeft size={15} strokeWidth={1.7} />
        </button>
      )}
      <main className="main">
        <Outlet />
      </main>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  )
}
