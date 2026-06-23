import * as z from 'zod';

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const organizationSchema = z.object({
  nome: z
    .string()
    .min(2, 'Nome deve ter pelo menos 2 caracteres')
    .max(120, 'Nome deve ter no máximo 120 caracteres'),
  slug: z
    .string()
    .min(2, 'Slug deve ter pelo menos 2 caracteres')
    .max(80, 'Slug deve ter no máximo 80 caracteres')
    .regex(slugRegex, 'Use apenas letras minúsculas, números e hífens'),
});

export type OrganizationFormValues = z.infer<typeof organizationSchema>;

export function slugifyOrganizationName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
