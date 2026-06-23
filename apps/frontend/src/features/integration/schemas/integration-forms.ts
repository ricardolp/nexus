import * as z from 'zod';

export const integrationTokenSchema = z.object({
  name: z.string().min(2, 'Informe um nome com pelo menos 2 caracteres'),
  scopes: z.array(z.string()).min(1, 'Selecione ao menos um escopo'),
  expiresAt: z.string().optional(),
});

export type IntegrationTokenFormValues = z.infer<typeof integrationTokenSchema>;

export const webhookEndpointSchema = z.object({
  url: z
    .string()
    .url('Informe uma URL válida')
    .refine((value) => value.startsWith('https://'), 'A URL deve usar HTTPS'),
  description: z.string().optional(),
  eventTypes: z.array(z.string()).min(1, 'Selecione ao menos um evento'),
  active: z.boolean().optional(),
});

export type WebhookEndpointFormValues = z.infer<typeof webhookEndpointSchema>;

export const sapIntegrationSchema = z.object({
  integrationBaseUrl: z.string().optional(),
  integrationClientId: z.string().optional(),
  clientSecret: z.string().optional(),
  sapClient: z.string().optional(),
  sapLanguage: z.string().optional(),
});

export type SapIntegrationFormValues = z.infer<typeof sapIntegrationSchema>;
