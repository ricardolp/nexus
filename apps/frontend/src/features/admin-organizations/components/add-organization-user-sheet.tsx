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
import { createOrganizationUserMutation } from '../api/mutations';
import type { Organization } from '../api/types';
import { toast } from 'sonner';
import * as z from 'zod';
import {
  organizationUserSchema,
  type OrganizationUserFormValues,
} from '../schemas/organization-user';

interface AddOrganizationUserSheetProps {
  organization: Organization;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddOrganizationUserSheet({
  organization,
  open,
  onOpenChange,
}: AddOrganizationUserSheetProps) {
  const createMutation = useMutation({
    ...createOrganizationUserMutation,
    onSuccess: () => {
      toast.success('Usuário criado e vinculado à organização');
      onOpenChange(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Falha ao criar usuário');
    },
  });

  const form = useAppForm({
    defaultValues: {
      nome: '',
      sobrenome: '',
      email: '',
      senha: '',
    } as OrganizationUserFormValues,
    validators: {
      onSubmit: organizationUserSchema,
    },
    onSubmit: async ({ value }) => {
      await createMutation.mutateAsync({
        organizationId: organization.id,
        payload: value,
      });
    },
  });

  const { FormTextField } = useFormFields<OrganizationUserFormValues>();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='flex flex-col'>
        <SheetHeader>
          <SheetTitle>Adicionar usuário</SheetTitle>
          <SheetDescription>
            Crie um usuário em <strong>{organization.nome}</strong> e vincule automaticamente como
            membro.
          </SheetDescription>
        </SheetHeader>

        <div className='flex-1 overflow-auto'>
          <form.AppForm>
            <form.Form id='organization-user-form' className='space-y-4'>
              <div className='grid grid-cols-2 gap-4'>
                <FormTextField
                  name='nome'
                  label='Nome'
                  required
                  placeholder='Maria'
                  validators={{
                    onBlur: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
                  }}
                />
                <FormTextField
                  name='sobrenome'
                  label='Sobrenome'
                  required
                  placeholder='Silva'
                  validators={{
                    onBlur: z.string().min(2, 'Sobrenome deve ter pelo menos 2 caracteres'),
                  }}
                />
              </div>

              <FormTextField
                name='email'
                label='E-mail'
                required
                type='email'
                placeholder='maria@empresa.com'
                validators={{
                  onBlur: z.string().email('Informe um e-mail válido'),
                }}
              />

              <FormTextField
                name='senha'
                label='Senha'
                required
                type='password'
                placeholder='Senha forte'
                validators={{
                  onBlur: organizationUserSchema.shape.senha,
                }}
              />
            </form.Form>
          </form.AppForm>
        </div>

        <SheetFooter>
          <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type='submit' form='organization-user-form' isLoading={createMutation.isPending}>
            <Icons.check /> Criar usuário
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
