'use client';

import { useAppForm, useFormFields } from '@/components/ui/tanstack-form';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Icons } from '@/components/icons';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as z from 'zod';
import { createOrganizationMutation } from '../api/mutations';
import {
  organizationSchema,
  slugifyOrganizationName,
  type OrganizationFormValues,
} from '../schemas/organization';
import { useAuth } from '@/context/auth-context';
import { FormOrganizationLogoField } from './organization-logo-field';

interface CreateOrganizationSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateOrganizationSheet({ open, onOpenChange }: CreateOrganizationSheetProps) {
  const { refreshSession, patchOrganizationLogo } = useAuth();

  const createMutation = useMutation({
    ...createOrganizationMutation,
    onSuccess: async (createdOrganization) => {
      patchOrganizationLogo(createdOrganization.id, createdOrganization.logo ?? null);
      toast.success('Organização criada com sucesso');
      await refreshSession();
      onOpenChange(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Falha ao criar organização');
    },
  });

  const form = useAppForm({
    defaultValues: {
      nome: '',
      slug: '',
      logo: null,
    } as OrganizationFormValues,
    validators: {
      onSubmit: organizationSchema.pick({ nome: true }).extend({
        slug: z.string(),
        logo: organizationSchema.shape.logo,
      }),
    },
    onSubmit: async ({ value }) => {
      const nome = value.nome.trim();
      const slug = value.slug.trim() || slugifyOrganizationName(nome);
      const parsed = organizationSchema.safeParse({
        nome,
        slug,
        logo: value.logo ?? null,
      });

      if (!parsed.success) {
        toast.error(parsed.error.issues[0]?.message ?? 'Dados inválidos');
        return;
      }

      await createMutation.mutateAsync(parsed.data);
    },
  });

  const { FormTextField } = useFormFields<OrganizationFormValues>();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='flex flex-col'>
        <SheetHeader>
          <SheetTitle>Nova organização</SheetTitle>
          <SheetDescription>
            Crie a organização e depois adicione usuários e empresas para o setup inicial.
          </SheetDescription>
        </SheetHeader>

        <div className='flex-1 overflow-auto'>
          <form.AppForm>
            <form.Form id='create-organization-form' className='space-y-4'>
              <FormOrganizationLogoField
                name='logo'
                label='Logo'
                description='Imagem quadrada exibida no seletor de organizações (150×150 px).'
              />

              <FormTextField
                name='nome'
                label='Nome'
                required
                placeholder='Minha Empresa'
                validators={{
                  onBlur: organizationSchema.shape.nome,
                }}
              />

              <FormTextField
                name='slug'
                label='Slug'
                placeholder='minha-empresa'
                description='Opcional. Se vazio, será gerado automaticamente a partir do nome.'
              />
            </form.Form>
          </form.AppForm>
        </div>

        <SheetFooter>
          <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type='submit'
            form='create-organization-form'
            isLoading={createMutation.isPending}
          >
            <Icons.check /> Criar organização
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
