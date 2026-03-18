import { Outlet } from 'react-router-dom';

export function SystemPage() {
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-background">
      <Outlet />
    </div>
  );
}

export default SystemPage;
