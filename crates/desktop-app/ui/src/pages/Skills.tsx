import { useQuery } from '@tanstack/react-query'
import { Sparkles, Lock } from 'lucide-react'

import { listSkills } from '@/api/skills'
import { GlassPanel } from '@/components/glass/GlassPanel'
import { SettingsPageHeader } from '@/components/settings/SettingsPageHeader'
import { SkeletonCard } from '@/components/Skeleton'

export default function Skills() {
  const q = useQuery({ queryKey: ['skills'], queryFn: listSkills })

  return (
    <div className="settings-page">
      <SettingsPageHeader
        title="Skills"
        lede="Every capability the agent can pick up. Built-ins carry a lock; local skills are editable. The skill graph ranks relevance for each run."
      />

      {q.isLoading && (
        <div className="skill-grid">
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
      <div className="skill-grid">
        {q.data?.map((s) => (
          <GlassPanel key={s.name} variant="body" className="skill-card">
            <div className="skill-card__head">
              <h3 className="skill-card__name">
                <Sparkles size={14} strokeWidth={1.8} className="skill-card__icon" /> {s.name}
              </h3>
              {s.isBuiltIn && (
                <span className="skill-card__badge">
                  <Lock size={10} strokeWidth={2} /> built-in
                </span>
              )}
            </div>
            <p className="skill-card__description">{s.description || '—'}</p>
            {s.tools && s.tools.length > 0 && (
              <div className="skill-card__tools">
                {s.tools.slice(0, 6).map((t) => (
                  <span key={t} className="tag">{t}</span>
                ))}
                {s.tools.length > 6 && <span className="tag">+{s.tools.length - 6}</span>}
              </div>
            )}
            <p className="skill-card__path mono">{s.path}</p>
          </GlassPanel>
        ))}
      </div>
    </div>
  )
}
