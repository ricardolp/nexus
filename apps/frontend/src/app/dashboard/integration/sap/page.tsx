import { redirect } from 'next/navigation';

export default function LegacyIntegrationSapRedirect() {
  redirect('/dashboard/integrations/sap');
}
