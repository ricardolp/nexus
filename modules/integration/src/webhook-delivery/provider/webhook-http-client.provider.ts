export interface WebhookHttpRequest {
  url: string;
  body: string;
  headers: Record<string, string>;
}

export interface WebhookHttpResponse {
  status: number;
  body: string;
}

export interface WebhookHttpClientProvider {
  post(request: WebhookHttpRequest): Promise<WebhookHttpResponse>;
}
