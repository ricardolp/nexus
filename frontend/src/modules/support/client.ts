import { apiBaseUrl, apiFetch, apiFetchBlob, triggerBlobDownload } from '@/lib/api';

const supportBaseUrl = () => import.meta.env.VITE_SUPPORT_API_URL || apiBaseUrl();

export interface SupportDocumentLink {
  id?: string;
  ticket_id?: string;
  document_number: string;
  document_type: 'nfe' | 'nfse' | string;
  fiscal_document_id?: string | null;
}

export interface SupportAttachment {
  id: string;
  ticket_id: string;
  message_id?: string | null;
  original_filename: string;
  content_type: string;
  sha256: string;
  size_bytes: number;
  created_by_user_id: string;
  created_at: string;
}

export interface SupportMessage {
  id: string;
  ticket_id: string;
  author_user_id: string;
  author_email?: string;
  body_html: string;
  body_text: string;
  created_at: string;
}

export interface SupportTicket {
  id: string;
  organization_id: string;
  opened_by_user_id: string;
  opened_by_email?: string;
  public_number: number;
  public_id: string;
  subject: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  sla_hours: number;
  sla_due_at: string;
  environment: 'production' | 'homologation';
  preview?: string;
  attachment_count?: number;
  created_at: string;
  updated_at: string;
  messages?: SupportMessage[];
  attachments?: SupportAttachment[];
  document_links?: SupportDocumentLink[];
}

export interface SupportTicketList {
  items: SupportTicket[];
  total: number;
  page: number;
  limit: number;
  counts: Record<string, number>;
}

export interface SupportConfig {
  environment: 'production' | 'homologation';
  allowed_priorities: Array<'low' | 'medium' | 'high' | 'critical'>;
}

export function getSupportConfig(token: string, organizationId: string) {
  return apiFetch<SupportConfig>(`/v1/organizations/${organizationId}/support/config`, {
    token,
    baseUrl: supportBaseUrl()
  });
}

export function listSupportTickets(
  token: string,
  organizationId: string,
  params?: { page?: number; limit?: number; status?: string }
) {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.status) query.set('status', params.status);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return apiFetch<SupportTicketList>(`/v1/organizations/${organizationId}/support/tickets${suffix}`, {
    token,
    baseUrl: supportBaseUrl()
  });
}

export function getSupportTicket(token: string, organizationId: string, ticketId: string) {
  return apiFetch<SupportTicket>(`/v1/organizations/${organizationId}/support/tickets/${ticketId}`, {
    token,
    baseUrl: supportBaseUrl()
  });
}

export function createSupportTicket(
  token: string,
  organizationId: string,
  body: {
    subject: string;
    body_html: string;
    priority: string;
    document_links?: Array<{
      document_number: string;
      document_type: string;
      fiscal_document_id?: string;
    }>;
  }
) {
  return apiFetch<SupportTicket>(`/v1/organizations/${organizationId}/support/tickets`, {
    method: 'POST',
    token,
    body,
    baseUrl: supportBaseUrl()
  });
}

export function addSupportTicketMessage(
  token: string,
  organizationId: string,
  ticketId: string,
  bodyHtml: string
) {
  return apiFetch<SupportTicket>(`/v1/organizations/${organizationId}/support/tickets/${ticketId}/messages`, {
    method: 'POST',
    token,
    body: { body_html: bodyHtml },
    baseUrl: supportBaseUrl()
  });
}

export function uploadSupportAttachment(
  token: string,
  organizationId: string,
  ticketId: string,
  file: File,
  messageId?: string
) {
  const formData = new FormData();
  formData.append('file', file);
  if (messageId) formData.append('message_id', messageId);
  return apiFetch<SupportAttachment>(
    `/v1/organizations/${organizationId}/support/tickets/${ticketId}/attachments`,
    {
      method: 'POST',
      token,
      formData,
      baseUrl: supportBaseUrl()
    }
  );
}

export async function downloadSupportAttachment(
  token: string,
  organizationId: string,
  ticketId: string,
  attachmentId: string
) {
  const { blob, filename } = await apiFetchBlob(
    `/v1/organizations/${organizationId}/support/tickets/${ticketId}/attachments/${attachmentId}`,
    { token, baseUrl: supportBaseUrl() }
  );
  triggerBlobDownload(blob, filename);
}
