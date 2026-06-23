import * as z from 'zod';
import { isValidCnpj } from '../utils/cnpj';

export const organizationMemberUserSchema = z.object({
  nome: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  sobrenome: z.string().min(2, 'Sobrenome deve ter pelo menos 2 caracteres'),
  email: z.string().email('Informe um e-mail válido'),
  senha: z
    .string()
    .min(8, 'Senha deve ter pelo menos 8 caracteres')
    .regex(/[A-Z]/, 'Senha deve conter letra maiúscula')
    .regex(/[a-z]/, 'Senha deve conter letra minúscula')
    .regex(/[0-9]/, 'Senha deve conter número')
    .regex(/[^A-Za-z0-9]/, 'Senha deve conter caractere especial'),
  roleId: z.string().min(1, 'Selecione um perfil'),
});

export type OrganizationMemberUserFormValues = z.infer<typeof organizationMemberUserSchema>;

export const organizationCompanySchema = z.object({
  cnpj: z
    .string()
    .min(14, 'CNPJ inválido')
    .refine((value) => isValidCnpj(value), 'CNPJ inválido'),
  razaoSocial: z.string().min(2, 'Razão social deve ter pelo menos 2 caracteres'),
});

export type OrganizationCompanyFormValues = z.infer<typeof organizationCompanySchema>;

export const organizationCompanyUpdateSchema = z.object({
  razaoSocial: z.string().min(2, 'Razão social deve ter pelo menos 2 caracteres'),
});

export type OrganizationCompanyUpdateFormValues = z.infer<typeof organizationCompanyUpdateSchema>;

export const organizationRoleSchema = z.object({
  nome: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  slug: z
    .string()
    .min(2, 'Slug deve ter pelo menos 2 caracteres')
    .regex(/^[a-z0-9-]+$/, 'Use apenas letras minúsculas, números e hífen'),
  permissions: z.array(z.string()),
});

export type OrganizationRoleFormValues = z.infer<typeof organizationRoleSchema>;

export const organizationCompanyCertificateUploadSchema = z.object({
  certificate: z
    .array(z.instanceof(File))
    .min(1, 'Selecione o arquivo do certificado')
    .max(1, 'Envie apenas um arquivo')
    .refine(
      (files) => files[0]?.name.toLowerCase().endsWith('.pfx'),
      'O certificado deve estar no formato .pfx',
    ),
  password: z.string().min(1, 'Senha do certificado é obrigatória'),
  name: z.string().max(200, 'Nome deve ter no máximo 200 caracteres'),
  description: z.string().max(500, 'Descrição deve ter no máximo 500 caracteres'),
  activate: z.boolean(),
});

export type OrganizationCompanyCertificateUploadFormValues = z.infer<
  typeof organizationCompanyCertificateUploadSchema
>;
