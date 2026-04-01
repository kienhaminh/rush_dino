import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { approveAction } from '@/lib/guardrail-api';
import type { ActionCategory, ApprovalRequest } from '@/lib/guardrail-api';

const CATEGORY_LABELS: Record<ActionCategory, string> = {
  bash: 'Bash',
  network: 'Network',
  fs_read: 'File Read',
  fs_write: 'File Write',
};

interface ApprovalPromptProps {
  request: ApprovalRequest | null;
  sessionId: string;
  onClose: () => void;
}

export function ApprovalPrompt({ request, sessionId, onClose }: ApprovalPromptProps) {
  const [submitting, setSubmitting] = useState(false);

  async function handleDecision(approved: boolean) {
    if (!request) return;
    setSubmitting(true);
    try {
      await approveAction(sessionId, request.id, approved);
    } catch {
      // Silently ignore errors — the dialog still closes so the user can continue
    } finally {
      setSubmitting(false);
      onClose();
    }
  }

  return (
    <Dialog open={request !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Agent requesting permission</DialogTitle>
        </DialogHeader>

        {request && (
          <div className="space-y-4 py-2">
            {/* Category badge */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Category:</span>
              <Badge variant="secondary">{CATEGORY_LABELS[request.category]}</Badge>
            </div>

            {/* Description */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">Description</p>
              <p className="text-sm">{request.description}</p>
            </div>

            {/* Redacted content */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">Content (redacted)</p>
              <pre className="bg-muted/60 rounded-md p-3 text-xs font-mono whitespace-pre-wrap break-all overflow-auto max-h-48">
                {request.redacted_content}
              </pre>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => handleDecision(false)}
            disabled={submitting}
          >
            Deny
          </Button>
          <Button
            size="sm"
            onClick={() => handleDecision(true)}
            disabled={submitting}
          >
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
