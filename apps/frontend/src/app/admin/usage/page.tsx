import PageContainer from '@/components/layout/page-container';
import UsageListingPage from '@/features/admin-organizations/components/usage-listing';

export const metadata = {
  title: 'Admin: Indicadores de uso',
};

export default function AdminUsagePage() {
  return (
    <PageContainer
      pageTitle='Indicadores de uso'
      pageDescription='Consumo por organização para apoio à precificação — notas emitidas, eventos e integrações.'
    >
      <UsageListingPage />
    </PageContainer>
  );
}
