import { Injectable } from '@nestjs/common';
import {
  WebhookHttpClientProvider,
  WebhookHttpRequest,
  WebhookHttpResponse,
} from '@nexus/integration';

@Injectable()
export class FetchWebhookHttpClient implements WebhookHttpClientProvider {
  async post(request: WebhookHttpRequest): Promise<WebhookHttpResponse> {
    const response = await fetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
    });

    const body = await response.text();

    return {
      status: response.status,
      body,
    };
  }
}
