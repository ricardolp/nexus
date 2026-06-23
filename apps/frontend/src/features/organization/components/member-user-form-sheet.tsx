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
import { useAuth } from '@/context/auth-context';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createOrganizationMemberUserMutation } from '../api/mutations';
import { organizationRolesQueryOptions } from '../api/queries';
import {
  organizationMemberUserSchema,
  type OrganizationMemberUserFormValues,
} from '../schemas/organization-forms';
import { toast } from 'sonner';
import * as z from 'zod';

interface MemberUserFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MemberUserFormSheet({ open, onOpenChange }: MemberUserFormSheetProps) {
  const { activeOrganization, activeOrganizationId } = useAuth();

  const rolesQuery = useQuery({
    ...organizationRolesQueryOptions(activeOrganizationId ?? '', {
      page: 1,
      limit: 100,
    }),
    enabled: open && Boolean(activeOrganizationId),
  });

  const roleOptions =
    rolesQuery.data?.items.map((role) => ({
      value: role.id,
      label: role.nome,
    })) ?? [];

  const createMutation = useMutation({
    ...createOrganizationMemberUserMutation,
    onSuccess: () => {
      toast.success('Usuário criado com sucesso');
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
      roleId: '',
    } as OrganizationMemberUserFormValues,
    validators: {
      onSubmit: organizationMemberUserSchema,
    },
    onSubmit: async ({ value }) => {
      if (!activeOrganizationId) {
        return;
      }

      await createMutation.mutateAsync({
        organizationId: activeOrganizationId,
        payload: value,
      });
    },
  });

  const { FormTextField, FormSelectField } = useFormFields<OrganizationMemberUserFormValues>();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='flex flex-col'>
        <SheetHeader>
          <SheetTitle>Novo usuário</SheetTitle>
          <SheetDescription>
            Crie um usuário em <strong>{activeOrganization?.nome}</strong> e vincule-o à
            organização.
          </SheetDescription>
        </SheetHeader>

        <div className='flex-1 overflow-auto'>
          <form.AppForm>
            <form.Form id='member-user-form' className='space-y-4'>
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
                  onBlur: organizationMemberUserSchema.shape.senha,
                }}
              />

              <FormSelectField
                name='roleId'
                label='Perfil'
                required
                options={roleOptions}
                placeholder='Selecione um perfil'
                validators={{
                  onBlur: z.string().min(1, 'Selecione um perfil'),
                }}
              />
            </form.Form>
          </form.AppForm>
        </div>

        <SheetFooter>
          <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type='submit' form='member-user-form' isLoading={createMutation.isPending}>
            <Icons.check /> Criar usuário
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
