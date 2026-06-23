'use client';

import { useState } from 'react';
import { useSuspenseQueries } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-context';
import {
  nfeDocumentAttachmentsQueryOptions,
  nfeDocumentDetailQueryOptions,
  nfeDocumentEventsQueryOptions,
  nfeDocumentItemsQueryOptions,
  nfeDocumentTimelineQueryOptions,
  nfeFlowInstanceQueryOptions,
  nfeInboundProcessQueryOptions,
  nfeSapDocumentsQueryOptions,
} from '../../api/queries';
import { buildInboundFlowSteps } from '../../lib/build-inbound-steps';
import { extractValidationIssues } from '../../lib/extract-validation-issues';
import { DetailHeader } from './detail-header';
import { DetailMainTabs } from './detail-tabs/detail-main-tabs';
import { DetailSkeleton } from './detail-skeleton';

type NfeDocumentDetailViewProps = {
  documentId: string;
};

export function NfeDocumentDetailView({ documentId }: NfeDocumentDetailViewProps) {
  const { activeOrganizationId, isLoading } = useAuth();

  if (isLoading || !activeOrganizationId) {
    return <DetailSkeleton />;
  }

  return (
    <NfeDocumentDetailContent
      organizationId={activeOrganizationId}
      documentId={documentId}
    />
  );
}

function NfeDocumentDetailContent({
  organizationId,
  documentId,
}: {
  organizationId: string;
  documentId: string;
}) {
  const [
    documentQuery,
    inboundQuery,
    itemsQuery,
    eventsQuery,
    timelineQuery,
    attachmentsQuery,
    sapQuery,
    flowQuery,
  ] = useSuspenseQueries({
    queries: [
      nfeDocumentDetailQueryOptions(organizationId, documentId),
      nfeInboundProcessQueryOptions(organizationId, documentId),
      nfeDocumentItemsQueryOptions(organizationId, documentId),
      nfeDocumentEventsQueryOptions(organizationId, documentId),
      nfeDocumentTimelineQueryOptions(organizationId, documentId),
      nfeDocumentAttachmentsQueryOptions(organizationId, documentId),
      nfeSapDocumentsQueryOptions(organizationId, documentId),
      nfeFlowInstanceQueryOptions(organizationId, documentId),
    ],
  });

  const document = documentQuery.data;
  const inbound = inboundQuery.data;
  const timeline = timelineQuery.data.items;
  const flowInstance = flowQuery.data;
  const flowSteps = buildInboundFlowSteps(
    inbound,
    sapQuery.data.items,
    flowInstance,
  );
  const alertIssues = extractValidationIssues({
    alertMessage: inbound?.alertMessage,
    flowInstance,
  });
  const [activeTab, setActiveTab] = useState('resumo');

  return (
    <div className='flex flex-col gap-6'>
      <DetailHeader
        document={document}
        inbound={inbound}
        organizationId={organizationId}
        timeline={timeline}
        flowInstance={flowInstance}
        onOpenAlertsTab={() => setActiveTab('alertas')}
      />
      <DetailMainTabs
        document={document}
        flowSteps={flowSteps}
        items={itemsQuery.data.items}
        events={eventsQuery.data.items}
        sapDocuments={sapQuery.data.items}
        attachments={attachmentsQuery.data.items}
        timeline={timeline}
        alertIssues={alertIssues}
        alertCode={inbound?.alertCode}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
    </div>
  );
}
