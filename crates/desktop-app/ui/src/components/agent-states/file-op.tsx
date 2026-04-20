import { TEAL, SUCCESS, WARN, ERROR, INK, LINE, SURFACE_2 } from './tokens'
import { Card } from './card'

export type FileOpKind = 'read' | 'write' | 'edit' | 'del'

const FILE_COLOR: Record<FileOpKind, string> = {
  read: TEAL,
  write: SUCCESS,
  edit: WARN,
  del: ERROR,
}

export function FileOp({
  op = 'edit',
  path = 'src/engine/router.rs',
  additions = 12,
  deletions = 3,
  preview,
  defaultOpen = false,
}: {
  op?: FileOpKind
  path?: string
  additions?: number
  deletions?: number
  preview?: string
  defaultOpen?: boolean
}) {
  const c = FILE_COLOR[op] ?? FILE_COLOR.edit
  return (
    <Card
      kind={op.toUpperCase()}
      title={path}
      defaultOpen={defaultOpen}
      accent={c}
      meta={op === 'read' ? null : `+${additions} -${deletions}`}
      compact={op === 'read' ? 'read-only' : null}
    >
      {preview && (
        <pre
          style={{
            margin: '10px 0 0',
            padding: '10px 12px',
            background: SURFACE_2,
            border: `1px solid ${LINE}`,
            borderRadius: 6,
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            lineHeight: 1.6,
            color: INK,
            overflow: 'auto',
          }}
        >
          {preview}
        </pre>
      )}
    </Card>
  )
}
