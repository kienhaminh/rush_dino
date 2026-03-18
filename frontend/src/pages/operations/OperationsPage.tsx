import { Outlet } from 'react-router-dom';

export function OperationsPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <Outlet />
    </div>
  );
}

export default OperationsPage;
