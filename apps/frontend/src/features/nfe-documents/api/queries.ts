import { queryOptions } from '@tanstack/react-query';
import {
  getNfeDocument,
  getNfeDocumentsSummary,
  getNfeFlowInstance,
  getNfeInboundProcess,
  listNfeDocumentAttachments,
  listNfeDocumentEvents,
  listNfeDocumentItems,
  listNfeDocuments,
  listNfeDocumentTimeline,
  listNfeSapDocuments,
} from './service';
import type { NfeDocumentListFilters } from './types';

export const nfeDocumentsKeys = {
  all: ['nfe-documents'] as const,
  list: (organizationId: string, filters: NfeDocumentListFilters) =>
    [...nfeDocumentsKeys.all, 'list', organizationId, filters] as const,
  summary: (organizationId: string, companyId?: string) =>
    [...nfeDocumentsKeys.all, 'summary', organizationId, companyId] as const,
  detail: (organizationId: string, documentId: string) =>
    [...nfeDocumentsKeys.all, 'detail', organizationId, documentId] as const,
  inbound: (organizationId: string, documentId: string) =>
    [...nfeDocumentsKeys.all, 'inbound', organizationId, documentId] as const,
  items: (organizationId: string, documentId: string) =>
    [...nfeDocumentsKeys.all, 'items', organizationId, documentId] as const,
  events: (organizationId: string, documentId: string) =>
    [...nfeDocumentsKeys.all, 'events', organizationId, documentId] as const,
  timeline: (organizationId: string, documentId: string) =>
    [...nfeDocumentsKeys.all, 'timeline', organizationId, documentId] as const,
  attachments: (organizationId: string, documentId: string) =>
    [...nfeDocumentsKeys.all, 'attachments', organizationId, documentId] as const,
  sapDocuments: (organizationId: string, documentId: string) =>
    [...nfeDocumentsKeys.all, 'sap-documents', organizationId, documentId] as const,
  flowInstance: (organizationId: string, documentId: string) =>
    [...nfeDocumentsKeys.all, 'flow-instance', organizationId, documentId] as const,
};

export const nfeDocumentsListQueryOptions = (
  organizationId: string,
  filters: NfeDocumentListFilters,
) =>
  queryOptions({
    queryKey: nfeDocumentsKeys.list(organizationId, filters),
    queryFn: () => listNfeDocuments(organizationId, filters),
  });

export const nfeDocumentsSummaryQueryOptions = (
  organizationId: string,
  companyId?: string,
) =>
  queryOptions({
    queryKey: nfeDocumentsKeys.summary(organizationId, companyId),
    queryFn: () => getNfeDocumentsSummary(organizationId, companyId),
  });

export const nfeDocumentDetailQueryOptions = (
  organizationId: string,
  documentId: string,
) =>
  queryOptions({
    queryKey: nfeDocumentsKeys.detail(organizationId, documentId),
    queryFn: () => getNfeDocument(organizationId, documentId),
  });

export const nfeInboundProcessQueryOptions = (
  organizationId: string,
  documentId: string,
) =>
  queryOptions({
    queryKey: nfeDocumentsKeys.inbound(organizationId, documentId),
    queryFn: () => getNfeInboundProcess(organizationId, documentId),
  });

export const nfeDocumentItemsQueryOptions = (
  organizationId: string,
  documentId: string,
) =>
  queryOptions({
    queryKey: nfeDocumentsKeys.items(organizationId, documentId),
    queryFn: () => listNfeDocumentItems(organizationId, documentId),
  });

export const nfeDocumentEventsQueryOptions = (
  organizationId: string,
  documentId: string,
) =>
  queryOptions({
    queryKey: nfeDocumentsKeys.events(organizationId, documentId),
    queryFn: () => listNfeDocumentEvents(organizationId, documentId),
  });

export const nfeDocumentTimelineQueryOptions = (
  organizationId: string,
  documentId: string,
) =>
  queryOptions({
    queryKey: nfeDocumentsKeys.timeline(organizationId, documentId),
    queryFn: () => listNfeDocumentTimeline(organizationId, documentId),
  });

export const nfeDocumentAttachmentsQueryOptions = (
  organizationId: string,
  documentId: string,
) =>
  queryOptions({
    queryKey: nfeDocumentsKeys.attachments(organizationId, documentId),
    queryFn: () => listNfeDocumentAttachments(organizationId, documentId),
  });

export const nfeSapDocumentsQueryOptions = (
  organizationId: string,
  documentId: string,
) =>
  queryOptions({
    queryKey: nfeDocumentsKeys.sapDocuments(organizationId, documentId),
    queryFn: () => listNfeSapDocuments(organizationId, documentId),
  });

export const nfeFlowInstanceQueryOptions = (
  organizationId: string,
  documentId: string,
) =>
  queryOptions({
    queryKey: nfeDocumentsKeys.flowInstance(organizationId, documentId),
    queryFn: () => getNfeFlowInstance(organizationId, documentId),
  });
