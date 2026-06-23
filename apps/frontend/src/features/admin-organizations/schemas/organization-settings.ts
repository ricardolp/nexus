import * as z from 'zod';

export const organizationSettingsSchema = z.object({
  maxCompanies: z
    .number({ error: 'Informe um número válido' })
    .int('Deve ser um número inteiro')
    .min(1, 'Mínimo de 1 empresa'),
});

export type OrganizationSettingsFormValues = z.infer<typeof organizationSettingsSchema>;
