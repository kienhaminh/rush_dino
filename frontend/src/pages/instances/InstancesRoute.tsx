import { InstancesPage } from './InstancesPage';

export function InstancesRoute() {
  return (
    <InstancesPage
      loading={false}
      entries={[]}
      lastError={null}
      statusMessage={null}
      onRefresh={() => {}}
    />
  );
}
