'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InboundFlowStepper } from '../inbound-flow-stepper';
import { DetailParties } from '../detail-parties';
import { DetailItemsTab } from './detail-items-tab';
import { DetailEventsTab } from './detail-events-tab';
import { DetailSapDocsTab } from './detail-sap-docs-tab';
import { DetailAttachmentsTab } from './detail-attachments-tab';
import { DetailHistoryTab } from './detail-history-tab';
import { DetailAlertsTab } from './detail-alerts-tab';
import type { InboundFlowStep } from '../../../lib/build-inbound-steps';
import type { AlertIssue } from '../../../lib/extract-validation-issues';
import type {
  NfeDocumentAttachment,
  NfeDocumentEvent,
  NfeDocumentItem,
  NfeDocumentListItem,
  NfeDocumentTimeline,
  NfeSapDocument,
} from '../../../api/types';

type DetailMainTabsProps = {
  document: NfeDocumentListItem;
  flowSteps: InboundFlowStep[];
  items: NfeDocumentItem[];
  events: NfeDocumentEvent[];
  sapDocuments: NfeSapDocument[];
  attachments: NfeDocumentAttachment[];
  timeline: NfeDocumentTimeline[];
  alertIssues: AlertIssue[];
  alertCode?: string | null;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
};

export function DetailMainTabs({
  document,
  flowSteps,
  items,
  events,
  sapDocuments,
  attachments,
  timeline,
  alertIssues,
  alertCode,
  activeTab,
  onTabChange,
}: DetailMainTabsProps) {
  const isInbound = document.direction === 'inbound';
  const hasAlerts = alertIssues.length > 0;

  return (
    <Tabs
      value={activeTab}
      onValueChange={onTabChange}
      className='w-full'
    >
      <TabsList className='mb-4 flex h-auto flex-wrap'>
        <TabsTrigger value='resumo'>Resumo</TabsTrigger>
        {hasAlerts && (
          <TabsTrigger value='alertas'>
            Alertas ({alertIssues.length})
          </TabsTrigger>
        )}
        <TabsTrigger value='itens'>Itens ({items.length})</TabsTrigger>
        <TabsTrigger value='eventos'>
          Eventos (
          {isInbound && flowSteps.length > 0 ? flowSteps.length : events.length})
        </TabsTrigger>
        {isInbound && (
          <TabsTrigger value='sap'>SAP ({sapDocuments.length})</TabsTrigger>
        )}
        <TabsTrigger value='anexos'>Anexos ({attachments.length})</TabsTrigger>
        <TabsTrigger value='historico'>Histórico ({timeline.length})</TabsTrigger>
      </TabsList>

      <TabsContent value='resumo' className='space-y-6'>
        {isInbound && flowSteps.length > 0 && (
          <InboundFlowStepper steps={flowSteps} />
        )}
        <DetailParties document={document} />
      </TabsContent>

      {hasAlerts && (
        <TabsContent value='alertas'>
          <DetailAlertsTab issues={alertIssues} alertCode={alertCode} />
        </TabsContent>
      )}

      <TabsContent value='itens'>
        <DetailItemsTab items={items} />
      </TabsContent>

      <TabsContent value='eventos'>
        <DetailEventsTab
          events={events}
          flowSteps={isInbound ? flowSteps : []}
          timeline={timeline}
        />
      </TabsContent>

      {isInbound && (
        <TabsContent value='sap'>
          <DetailSapDocsTab documents={sapDocuments} />
        </TabsContent>
      )}

      <TabsContent value='anexos'>
        <DetailAttachmentsTab attachments={attachments} />
      </TabsContent>

      <TabsContent value='historico'>
        <DetailHistoryTab entries={timeline} />
      </TabsContent>
    </Tabs>
  );
}
