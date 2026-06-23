import { redirect } from 'next/navigation';

export default function LegacyIntegrationTokensRedirect() {
  redirect('/dashboard/integrations/tokens');
}
