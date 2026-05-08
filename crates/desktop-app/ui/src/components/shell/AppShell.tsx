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

  const startNewChat = useCallback(() => navigate('/?new=1'), [navigate])
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
        navigate('/?new=1')
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
      unsubs.push(await listen('menu:new-chat', () => navigate('/?new=1')))
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
        /* Layout: 280px sidebar + main content. Animate the column widths
           so collapse/expand reads as a smooth slide. The
           `app-root--collapsed` class is preserved so the un-migrated
           chat-topbar can still react via its legacy descendant
           selector — drop after the chat shell unit migrates. */
        'relative grid h-screen w-screen overflow-hidden bg-bg-side text-text-primary font-sans',
        'transition-[grid-template-columns] duration-[220ms] ease-ease-cubic',
        showBanner && 'grid-rows-[36px_1fr]',
        collapsed
          ? 'app-root--collapsed grid-cols-[0_1fr]'
          : 'grid-cols-[280px_1fr]',
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
        onNewChat={startNewChat}
        onToggleSidebar={toggleSidebar}
        collapsed={collapsed}
        bannerRow={showBanner}
      />
      {collapsed && (
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Show sidebar"
          title="Show sidebar (⌘\)"
          className={cn(
            /* Floating toggle: parked just right of the macOS traffic
               lights so it's always reachable when the sidebar is hidden. */
            'fixed top-[10px] left-[88px] z-50 inline-flex items-center justify-center',
            'w-7 h-7 rounded-md border border-transparent bg-transparent text-text-secondary cursor-pointer',
            '[-webkit-app-region:no-drag] [app-region:no-drag]',
            'transition-[background-color,color] duration-[140ms] ease-ease-cubic',
            'hover:bg-black/5 hover:text-text-primary dark:hover:bg-white/5',
          )}
        >
          <PanelLeft size={15} strokeWidth={1.7} />
        </button>
      )}
      {/* The `.main` class still drives padding / radius / box-shadow via
          shell-v2.css + index.css — both rule sets stay until later units. */}
      <main className={cn('main', showBanner && 'row-start-2')}>
        <Outlet context={{ collapsed }} />
      </main>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  )
}
