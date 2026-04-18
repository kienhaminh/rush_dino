import { Link } from 'react-router-dom'
import { GlassPanel } from '@/components/glass/GlassPanel'

export default function NotFound() {
  return (
    <GlassPanel variant="hero">
      <p className="eyebrow">404</p>
      <h1 className="display-title">Off the map</h1>
      <p className="lede">
        That route doesn&apos;t exist here.{' '}
        <Link to="/" className="link-copper">
          Back to chat
        </Link>
        .
      </p>
    </GlassPanel>
  )
}
