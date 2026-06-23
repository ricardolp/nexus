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
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  createOrganizationRoleMutation,
  updateOrganizationRoleMutation,
} from '../api/mutations';
import type { OrganizationRole } from '../api/types';
import {
  organizationRoleSchema,
  type OrganizationRoleFormValues,
} from '../schemas/organization-forms';
import { slugify } from '../utils/slugify';
import { toast } from 'sonner';
import * as z from 'zod';
import { RolePermissionsField } from './role-permissions-field';

interface RoleFormSheetProps {
  role?: OrganizationRole;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RoleFormSheet({ role, open, onOpenChange }: RoleFormSheetProps) {
  const { activeOrganization, activeOrganizationId } = useAuth();
  const isEdit = Boolean(role);
  const [permissions, setPermissions] = useState<string[]>(role?.permissions ?? []);

  const createMutation = useMutation({
    ...createOrganizationRoleMutation,
    onSuccess: () => {
      toast.success('Perfil criado com sucesso');
      onOpenChange(false);
      form.reset();
      setPermissions([]);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Falha ao criar perfil');
    },
  });

  const updateMutation = useMutation({
    ...updateOrganizationRoleMutation,
    onSuccess: () => {
      toast.success('Perfil atualizado com sucesso');
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Falha ao atualizar perfil');
    },
  });

  const form = useAppForm({
    defaultValues: {
      nome: '',
      slug: '',
      permissions: [],
    } as OrganizationRoleFormValues,
    validators: {
      onSubmit: organizationRoleSchema,
    },
    onSubmit: async ({ value }) => {
      if (!activeOrganizationId) {
        return;
      }

      if (isEdit && role) {
        await updateMutation.mutateAsync({
          organizationId: activeOrganizationId,
          roleId: role.id,
          permissions,
        });
        return;
      }

      await createMutation.mutateAsync({
        organizationId: activeOrganizationId,
        payload: {
          nome: value.nome,
          slug: value.slug || slugify(value.nome),
        },
        permissions,
      });
    },
  });

  useEffect(() => {
    if (open) {
      setPermissions(role?.permissions ?? []);
      form.reset({
        nome: role?.nome ?? '',
        slug: role?.slug ?? '',
        permissions: role?.permissions ?? [],
      });
    }
  }, [open, role, form]);

  const { FormTextField } = useFormFields<OrganizationRoleFormValues>();
  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='flex flex-col'>
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Editar perfil' : 'Novo perfil'}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? `Atualize as permissões do perfil ${role?.nome} em ${activeOrganization?.nome}.`
              : `Crie um perfil de acesso em ${activeOrganization?.nome}.`}
          </SheetDescription>
        </SheetHeader>

        <div className='flex-1 overflow-auto'>
          <form.AppForm>
            <form.Form id='role-form' className='space-y-4'>
              <FormTextField
                name='nome'
                label='Nome'
                required
                disabled={isEdit}
                placeholder='Financeiro'
                validators={{
                  onBlur: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
                }}
              />

              <FormTextField
                name='slug'
                label='Slug'
                required
                disabled={isEdit}
                placeholder='financeiro'
                validators={{
                  onBlur: organizationRoleSchema.shape.slug,
                }}
              />

              <RolePermissionsField value={permissions} onChange={setPermissions} />
            </form.Form>
          </form.AppForm>
        </div>

        <SheetFooter>
          <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type='submit' form='role-form' isLoading={isPending}>
            <Icons.check /> {isEdit ? 'Salvar' : 'Criar perfil'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
