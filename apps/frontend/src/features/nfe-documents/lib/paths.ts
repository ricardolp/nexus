export function nfeDocumentDetailPath(documentId: string): string {
  return `/dashboard/documents/nfe/${documentId}`;
}

export function nfeEventsPath(): string {
  return '/dashboard/documents/nfe/events';
}

export function nfeEventDetailPath(eventId: string): string {
  return `/dashboard/documents/nfe/events/${eventId}`;
}
