'use client';

import { useAuth } from '@/context/auth-context';
import { ImportNfeXmlDialog } from './import-nfe-xml-dialog';

export function NfeDocumentsImportTrigger() {
  const { activeOrganizationId } = useAuth();
  if (!activeOrganizationId) return null;
  return <ImportNfeXmlDialog organizationId={activeOrganizationId} />;
}
