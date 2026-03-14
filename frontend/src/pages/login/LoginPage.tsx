import { FormEvent, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDashboardAuth } from '@/hooks/use-dashboard-auth';

export function LoginPage() {
  const { exchangeCode } = useDashboardAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await exchangeCode(code.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to exchange dashboard code.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-[24px] border border-border/50 bg-card/80 shadow-xl backdrop-blur-sm p-8">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
            <ShieldCheck size={20} />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Private Dashboard
            </p>
            <h1 className="font-display text-2xl font-bold uppercase tracking-tight">
              RushDino Login
            </h1>
          </div>
        </div>

        <p className="mt-5 text-sm text-muted-foreground">
          Run `rushdino dashboard issue-code` on the server, then enter the one-time code here.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="dashboard-code">One-time code</Label>
            <Input
              id="dashboard-code"
              autoFocus
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="ABCD-EFGH-JKLM"
              autoComplete="one-time-code"
            />
          </div>

          {error ? (
            <div className="rounded-[12px] border border-destructive/25 bg-destructive/[0.06] px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          ) : null}

          <Button className="w-full" disabled={!code.trim() || submitting} type="submit">
            {submitting ? 'Checking code…' : 'Unlock dashboard'}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default LoginPage;
