import { SessionsPage } from './SessionsPage';

export function SessionsRoute() {
  return (
    <SessionsPage
      loading={false}
      result={null}
      error={null}
      activeMinutes="60"
      limit="100"
      includeGlobal={false}
      includeUnknown={false}
      basePath="/sessions"
      onFiltersChange={() => {}}
      onRefresh={() => {}}
      onPatch={() => {}}
      onDelete={() => {}}
    />
  );
}
