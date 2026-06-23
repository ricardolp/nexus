import * as z from 'zod';

export const organizationUserSchema = z.object({
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
});

export type OrganizationUserFormValues = z.infer<typeof organizationUserSchema>;
