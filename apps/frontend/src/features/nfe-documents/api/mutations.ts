import type { MutationOptions } from '@tanstack/react-query';
import {
  confirmPortaria,
  deleteNfeDocument,
  importNfeDocument,
  registerMigo,
  rejectInbound,
  reprocessInbound,
  resetInbound,
  retrySapStep,
} from './service';
import type {
  ImportNfeDocumentPayload,
  ImportNfeDocumentResponse,
  NfeInboundProcess,
  RegisterMigoPayload,
  SapRetryStep,
} from './types';

export function importNfeDocumentMutation(): MutationOptions<
  ImportNfeDocumentResponse,
  Error,
  { organizationId: string; payload: ImportNfeDocumentPayload }
> {
  return {
    mutationFn: ({ organizationId, payload }) =>
      importNfeDocument(organizationId, payload),
  };
}

export function confirmPortariaMutation(): MutationOptions<
  NfeInboundProcess,
  Error,
  { organizationId: string; documentId: string }
> {
  return {
    mutationFn: ({ organizationId, documentId }) =>
      confirmPortaria(organizationId, documentId),
  };
}

export function registerMigoMutation(): MutationOptions<
  NfeInboundProcess,
  Error,
  {
    organizationId: string;
    documentId: string;
    payload?: RegisterMigoPayload;
  }
> {
  return {
    mutationFn: ({ organizationId, documentId, payload }) =>
      registerMigo(organizationId, documentId, payload),
  };
}

export function rejectInboundMutation(): MutationOptions<
  NfeInboundProcess,
  Error,
  { organizationId: string; documentId: string; reason: string }
> {
  return {
    mutationFn: ({ organizationId, documentId, reason }) =>
      rejectInbound(organizationId, documentId, reason),
  };
}

export function retrySapStepMutation(): MutationOptions<
  NfeInboundProcess,
  Error,
  { organizationId: string; documentId: string; step: SapRetryStep }
> {
  return {
    mutationFn: ({ organizationId, documentId, step }) =>
      retrySapStep(organizationId, documentId, step),
  };
}

export function reprocessInboundMutation(): MutationOptions<
  NfeInboundProcess,
  Error,
  { organizationId: string; documentId: string; runInline?: boolean }
> {
  return {
    mutationFn: ({ organizationId, documentId, runInline }) =>
      reprocessInbound(organizationId, documentId, runInline),
  };
}

export function resetInboundMutation(): MutationOptions<
  Awaited<ReturnType<typeof resetInbound>>,
  Error,
  { organizationId: string; documentId: string }
> {
  return {
    mutationFn: ({ organizationId, documentId }) =>
      resetInbound(organizationId, documentId),
  };
}

export function deleteNfeDocumentMutation(): MutationOptions<
  Awaited<ReturnType<typeof deleteNfeDocument>>,
  Error,
  { organizationId: string; documentId: string }
> {
  return {
    mutationFn: ({ organizationId, documentId }) =>
      deleteNfeDocument(organizationId, documentId),
  };
}
