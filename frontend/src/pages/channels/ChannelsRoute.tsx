import { ChannelsPage } from './ChannelsPage';

export function ChannelsRoute() {
  return (
    <ChannelsPage
      connected={false}
      loading={false}
      snapshot={null}
      lastError={null}
      lastSuccessAt={null}
      whatsappMessage={null}
      whatsappQrDataUrl={null}
      whatsappConnected={null}
      whatsappBusy={false}
      configSchema={null}
      configSchemaLoading={false}
      configForm={null}
      configUiHints={{}}
      configSaving={false}
      configFormDirty={false}
      nostrProfileFormState={null}
      nostrProfileAccountId={null}
      onRefresh={() => {}}
      onWhatsAppStart={() => {}}
      onWhatsAppWait={() => {}}
      onWhatsAppLogout={() => {}}
      onConfigPatch={() => {}}
      onConfigSave={() => {}}
      onConfigReload={() => {}}
      onNostrProfileEdit={() => {}}
      onNostrProfileFieldChange={() => {}}
      onNostrProfileSave={() => {}}
      onNostrProfileImport={() => {}}
      onNostrProfileCancel={() => {}}
      onNostrProfileToggleAdvanced={() => {}}
    />
  );
}
