import { IntegrationPageShell } from '@/features/integration/components/integration-page-shell';
import { SapIntegrationSettingsCard } from '@/features/integration/components/sap-integration-settings-card';

export const metadata = {
  title: 'Integrações: SAP',
};

export default function IntegrationSapPage() {
  return (
    <IntegrationPageShell
      pageTitle='Integração SAP'
      pageDescription='Configure a conexão com o SAP CPI para coletar pedidos de compra e enviar notas fiscais de entrada.'
    >
      <SapIntegrationSettingsCard />
    </IntegrationPageShell>
  );
}
