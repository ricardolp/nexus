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
import { useEffect } from 'react';
import {
  createOrganizationCompanyMutation,
  updateOrganizationCompanyMutation,
} from '../api/mutations';
import type { OrganizationCompany } from '../api/types';
import {
  organizationCompanySchema,
  type OrganizationCompanyFormValues,
} from '../schemas/organization-forms';
import { toast } from 'sonner';
import * as z from 'zod';

interface CompanyFormSheetProps {
  company?: OrganizationCompany;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CompanyFormSheet({ company, open, onOpenChange }: CompanyFormSheetProps) {
  const { activeOrganization, activeOrganizationId } = useAuth();
  const isEdit = Boolean(company);

  const createMutation = useMutation({
    ...createOrganizationCompanyMutation,
    onSuccess: () => {
      toast.success('Empresa criada com sucesso');
      onOpenChange(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Falha ao criar empresa');
    },
  });

  const updateMutation = useMutation({
    ...updateOrganizationCompanyMutation,
    onSuccess: () => {
      toast.success('Empresa atualizada com sucesso');
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Falha ao atualizar empresa');
    },
  });

  const form = useAppForm({
    defaultValues: {
      cnpj: '',
      razaoSocial: '',
    } as OrganizationCompanyFormValues,
    validators: {
      onSubmit: organizationCompanySchema,
    },
    onSubmit: async ({ value }) => {
      if (!activeOrganizationId) {
        return;
      }

      if (isEdit && company) {
        await updateMutation.mutateAsync({
          organizationId: activeOrganizationId,
          companyId: company.id,
          payload: { razaoSocial: value.razaoSocial },
        });
        return;
      }

      await createMutation.mutateAsync({
        organizationId: activeOrganizationId,
        payload: value,
      });
    },
  });

  const { FormTextField } = useFormFields<OrganizationCompanyFormValues>();

  useEffect(() => {
    if (open) {
      form.reset({
        cnpj: company?.cnpj ?? '',
        razaoSocial: company?.razaoSocial ?? '',
      });
    }
  }, [open, company, form]);

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='flex flex-col'>
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Editar empresa' : 'Nova empresa'}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? `Atualize os dados da empresa em ${activeOrganization?.nome}.`
              : `Cadastre uma empresa em ${activeOrganization?.nome}.`}
          </SheetDescription>
        </SheetHeader>

        <div className='flex-1 overflow-auto'>
          <form.AppForm>
            <form.Form id='company-form' className='space-y-4'>
              {!isEdit && (
                <FormTextField
                  name='cnpj'
                  label='CNPJ'
                  required
                  placeholder='00.000.000/0001-00'
                  validators={{
                    onBlur: organizationCompanySchema.shape.cnpj,
                  }}
                />
              )}

              <FormTextField
                name='razaoSocial'
                label='Razão social'
                required
                placeholder='Empresa Exemplo LTDA'
                validators={{
                  onBlur: z.string().min(2, 'Razão social deve ter pelo menos 2 caracteres'),
                }}
              />
            </form.Form>
          </form.AppForm>
        </div>

        <SheetFooter>
          <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type='submit' form='company-form' isLoading={isPending}>
            <Icons.check /> {isEdit ? 'Salvar' : 'Criar empresa'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
