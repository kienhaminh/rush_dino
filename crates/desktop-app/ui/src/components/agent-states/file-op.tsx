import { TEAL, SUCCESS, WARN, ERROR } from './tokens'
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
        <pre className="mt-2.5 mb-0 mx-0 px-3 py-2.5 bg-bg-card border border-border-line rounded-md font-mono text-xs leading-[1.6] text-text-primary overflow-auto">
          {preview}
        </pre>
      )}
    </Card>
  )
}
