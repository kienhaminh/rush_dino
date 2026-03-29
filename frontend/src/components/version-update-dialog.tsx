import { ArrowUpCircle, AlertTriangle, Loader2, RotateCw, ExternalLink } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useVersionCheck } from '@/hooks/use-version-check';

interface VersionUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VersionUpdateDialog({ open, onOpenChange }: VersionUpdateDialogProps) {
  const { data, upgradeState, upgradeResult, error, doUpgrade, doRestart, doSkip } =
    useVersionCheck();

  if (!data || !data.has_update) return null;

  const isCritical = data.is_critical;

  const handleSkip = async () => {
    await doSkip();
    onOpenChange(false);
  };

  const handleRemindLater = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-background sm:max-w-sm">
        <DialogHeader className="space-y-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            {isCritical ? (
              <AlertTriangle className="h-5 w-5 text-red-500" />
            ) : (
              <ArrowUpCircle className="h-5 w-5 text-emerald-500" />
            )}
            {isCritical ? 'Critical Update Required' : 'Update Available'}
          </DialogTitle>

          <DialogDescription className="text-sm">
            <span className="font-mono text-xs text-muted-foreground">v{data.current_version}</span>
            <span className="mx-2 text-muted-foreground/60">&rarr;</span>
            <span
              className={`font-mono text-xs font-medium ${
                isCritical ? 'text-red-400' : 'text-emerald-400'
              }`}
            >
              v{data.latest_version}
            </span>
          </DialogDescription>
        </DialogHeader>

        {isCritical && (
          <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs leading-relaxed text-red-400">
            This is a critical update that includes important fixes. You must update to continue.
          </div>
        )}

        {data.release_notes && (
          <div className="max-h-32 overflow-y-auto rounded-md border border-border/40 bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
            <pre className="whitespace-pre-wrap font-sans">{data.release_notes}</pre>
          </div>
        )}

        {upgradeState === 'error' && error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}

        {upgradeState === 'upgraded' && upgradeResult && (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-400">
            Updated to v{upgradeResult.installed_version}.
            {upgradeResult.cleanup_files.length > 0 && (
              <span> Cleaned up {upgradeResult.cleanup_files.length} obsolete file(s).</span>
            )}
            {' '}Restart to apply.
          </div>
        )}

        <div className="flex flex-col gap-2 pt-1">
          {upgradeState === 'idle' || upgradeState === 'error' ? (
            <>
              <Button
                size="sm"
                onClick={doUpgrade}
                className={`w-full ${
                  isCritical
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                <ArrowUpCircle className="mr-1.5 h-3.5 w-3.5" />
                Update Now
              </Button>
              {!isCritical && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={handleRemindLater}
                  >
                    Remind Me Later
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 text-xs text-muted-foreground"
                    onClick={handleSkip}
                  >
                    Skip This Version
                  </Button>
                </div>
              )}
            </>
          ) : upgradeState === 'upgrading' ? (
            <Button size="sm" className="w-full" disabled>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Downloading...
            </Button>
          ) : upgradeState === 'upgraded' ? (
            <Button size="sm" className="w-full" onClick={doRestart}>
              <RotateCw className="mr-1.5 h-3.5 w-3.5" />
              Restart Now
            </Button>
          ) : upgradeState === 'restarting' ? (
            <Button size="sm" className="w-full" disabled>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Restarting...
            </Button>
          ) : null}
        </div>

        {data.release_url && (
          <a
            href={data.release_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground/60 transition-colors hover:text-muted-foreground"
          >
            View full release notes
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
      </DialogContent>
    </Dialog>
  );
}
