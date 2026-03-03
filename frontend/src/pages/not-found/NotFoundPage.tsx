import { Bot } from 'lucide-react';
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex-1 flex items-center justify-center p-12 text-center">
      <div className="max-w-md space-y-6">
        <div className="h-16 w-16 bg-muted/20 rounded-2xl flex items-center justify-center mx-auto text-muted-foreground/30">
          <Bot size={32} />
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-bold tracking-tight">Page Not Found</h3>
          <p className="text-muted-foreground text-sm leading-relaxed">
            The page you're looking for doesn't exist or is still being migrated.
          </p>
        </div>
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          ← Back to Workspace
        </Link>
      </div>
    </div>
  );
}
