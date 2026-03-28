import { ArrowUpCircle, AlertTriangle, Loader2, RotateCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useVersionCheck } from '@/hooks/use-version-check';

interface VersionUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VersionUpdateDialog({ open, onOpenChange }: VersionUpdateDialogProps) {
  const { data, upgradeState, upgradeResult, error, doUpgrade, doRestart, doSkip } =
    useVersionCheck();

  if (!data || !data.has_update) return null;

  const handleSkip = async () => {
    await doSkip();
    onOpenChange(false);
  };

  const handleRemindLater = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {data.is_critical ? (
              <AlertTriangle className="h-5 w-5 text-red-500" />
            ) : (
              <ArrowUpCircle className="h-5 w-5 text-emerald-500" />
            )}
            Update Available
          </DialogTitle>
          <DialogDescription asChild>
            <div className="mt-2 flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                v{data.current_version}
              </Badge>
              <span className="text-muted-foreground">&rarr;</span>
              <Badge
                variant="outline"
                className={`text-xs ${
                  data.is_critical
                    ? 'border-red-500/40 bg-red-500/10 text-red-400'
                    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                }`}
              >
                v{data.latest_version}
              </Badge>
              {data.is_critical && (
                <Badge variant="destructive" className="text-[10px]">
                  CRITICAL
                </Badge>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        {data.is_critical && (
          <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-400">
            This is a critical update that includes important fixes. You must update to continue.
          </div>
        )}

        {data.release_notes && (
          <div className="max-h-40 overflow-y-auto rounded-md border border-border/40 bg-muted/30 p-3 text-xs text-muted-foreground">
            <pre className="whitespace-pre-wrap font-body">{data.release_notes}</pre>
          </div>
        )}

        {upgradeState === 'error' && error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-400">
            {error}
          </div>
        )}

        {upgradeState === 'upgraded' && upgradeResult && (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-400">
            Updated to v{upgradeResult.installed_version}.
            {upgradeResult.cleanup_files.length > 0 && (
              <span> Cleaned up {upgradeResult.cleanup_files.length} obsolete file(s).</span>
            )}
            {' '}Restart to apply.
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {upgradeState === 'idle' || upgradeState === 'error' ? (
            <>
              {!data.is_critical && (
                <>
                  <Button variant="ghost" size="sm" onClick={handleSkip}>
                    Skip This Version
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleRemindLater}>
                    Remind Me Later
                  </Button>
                </>
              )}
              <Button
                size="sm"
                onClick={doUpgrade}
                className={
                  data.is_critical
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }
              >
                <ArrowUpCircle className="mr-1.5 h-3.5 w-3.5" />
                Update Now
              </Button>
            </>
          ) : upgradeState === 'upgrading' ? (
            <Button size="sm" disabled>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Downloading...
            </Button>
          ) : upgradeState === 'upgraded' ? (
            <Button size="sm" onClick={doRestart}>
              <RotateCw className="mr-1.5 h-3.5 w-3.5" />
              Restart Now
            </Button>
          ) : upgradeState === 'restarting' ? (
            <Button size="sm" disabled>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Restarting...
            </Button>
          ) : null}
        </DialogFooter>

        {data.release_url && (
          <div className="text-center">
            <a
              href={data.release_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-muted-foreground underline hover:text-foreground"
            >
              View full release notes
            </a>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
