import { Link } from 'react-router-dom'
import { GlassPanel } from '@/components/glass/GlassPanel'

export default function NotFound() {
  return (
    <GlassPanel variant="hero">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-teal-400 m-0 mb-[14px]">
        404
      </p>
      <h1 className="font-sans font-bold text-[clamp(36px,4.6vw,56px)] leading-[1.05] tracking-[-0.02em] text-text-primary m-0">
        Off the map
      </h1>
      <p className="font-sans text-[15px] leading-[1.55] text-text-secondary max-w-[58ch] mt-5">
        That route doesn&apos;t exist here.{' '}
        <Link
          to="/"
          className="text-teal-400 no-underline border-b border-teal-line hover:text-teal-300 hover:border-teal-300"
        >
          Back to chat
        </Link>
        .
      </p>
    </GlassPanel>
  )
}
