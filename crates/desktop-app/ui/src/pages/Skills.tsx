import { useQuery } from '@tanstack/react-query'
import { Sparkles, Lock } from 'lucide-react'

import { listSkills } from '@/api/skills'
import { GlassPanel } from '@/components/glass/GlassPanel'
import { SettingsPageHeader } from '@/components/settings/SettingsPageHeader'
import { SkeletonCard } from '@/components/Skeleton'

const SKILL_GRID = 'grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3.5'

export default function Skills() {
  const q = useQuery({ queryKey: ['skills'], queryFn: listSkills })

  return (
    <div className="flex w-full max-w-[920px] flex-col gap-5">
      <SettingsPageHeader
        title="Skills"
        lede="Every capability the agent can pick up. Built-ins carry a lock; local skills are editable. The skill graph ranks relevance for each run."
      />

      {q.isLoading && (
        <div className={SKILL_GRID}>
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}
      {q.data && q.data.length === 0 && (
        <GlassPanel variant="compact">
          <p className="kg-hint">No skills registered yet.</p>
        </GlassPanel>
      )}
      <div className={SKILL_GRID}>
        {q.data?.map((s) => (
          <GlassPanel
            key={s.name}
            variant="body"
            className="!flex flex-col gap-2 !px-5 !py-[18px]"
          >
            <div className="flex items-center justify-between gap-2.5">
              <h3 className="m-0 inline-flex items-center gap-2 text-base font-semibold text-text-primary">
                <Sparkles size={14} strokeWidth={1.8} className="text-teal-400" /> {s.name}
              </h3>
              {s.isBuiltIn && (
                <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-text-dim">
                  <Lock size={10} strokeWidth={2} /> built-in
                </span>
              )}
            </div>
            <p className="m-0 text-[13px] leading-[1.5] text-text-muted">{s.description || '—'}</p>
            {s.tools && s.tools.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {s.tools.slice(0, 6).map((t) => (
                  <span key={t} className="tag">{t}</span>
                ))}
                {s.tools.length > 6 && <span className="tag">+{s.tools.length - 6}</span>}
              </div>
            )}
            <p className="mono break-all font-mono text-[10px] text-text-dim">{s.path}</p>
          </GlassPanel>
        ))}
      </div>
    </div>
  )
}
