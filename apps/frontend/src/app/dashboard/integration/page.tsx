import { redirect } from 'next/navigation';

export default function LegacyIntegrationIndexRedirect() {
  redirect('/dashboard/integrations/sap');
}
