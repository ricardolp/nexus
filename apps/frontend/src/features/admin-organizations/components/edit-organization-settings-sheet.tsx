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
import { Spinner } from '@/components/ui/spinner';
import { Icons } from '@/components/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';
import * as z from 'zod';
import { updateOrganizationSettingsMutation } from '../api/mutations';
import { organizationSettingsQueryOptions } from '../api/queries';
import type { Organization } from '../api/types';
import {
  organizationSettingsSchema,
  type OrganizationSettingsFormValues,
} from '../schemas/organization-settings';

interface EditOrganizationSettingsSheetProps {
  organization: Organization;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditOrganizationSettingsSheet({
  organization,
  open,
  onOpenChange,
}: EditOrganizationSettingsSheetProps) {
  const settingsQuery = useQuery({
    ...organizationSettingsQueryOptions(organization.id),
    enabled: open,
  });

  const updateMutation = useMutation({
    ...updateOrganizationSettingsMutation,
    onSuccess: () => {
      toast.success('Configurações atualizadas');
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Falha ao atualizar configurações');
    },
  });

  const form = useAppForm({
    defaultValues: {
      maxCompanies: 1,
    } as OrganizationSettingsFormValues,
    validators: {
      onSubmit: organizationSettingsSchema,
    },
    onSubmit: async ({ value }) => {
      await updateMutation.mutateAsync({
        organizationId: organization.id,
        payload: value,
      });
    },
  });

  useEffect(() => {
    if (open && settingsQuery.data) {
      form.reset({
        maxCompanies: settingsQuery.data.maxCompanies,
      });
    }
  }, [open, settingsQuery.data, form]);

  const { FormTextField } = useFormFields<OrganizationSettingsFormValues>();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='flex flex-col'>
        <SheetHeader>
          <SheetTitle>Configurações da organização</SheetTitle>
          <SheetDescription>
            Ajuste os limites e parâmetros de <strong>{organization.nome}</strong>.
          </SheetDescription>
        </SheetHeader>

        <div className='flex-1 overflow-auto'>
          {settingsQuery.isLoading ? (
            <div className='flex items-center justify-center py-12'>
              <Spinner className='h-6 w-6' />
            </div>
          ) : settingsQuery.isError ? (
            <p className='text-destructive text-sm'>
              {settingsQuery.error.message || 'Falha ao carregar configurações'}
            </p>
          ) : (
            <form.AppForm>
              <form.Form id='organization-settings-form' className='space-y-4'>
                <FormTextField
                  name='maxCompanies'
                  label='Limite de empresas'
                  description='Quantidade máxima de empresas (CNPJs) que esta organização pode cadastrar.'
                  required
                  type='number'
                  min={1}
                  step={1}
                  validators={{
                    onBlur: organizationSettingsSchema.shape.maxCompanies,
                    onChange: z.number().int().min(1),
                  }}
                />
              </form.Form>
            </form.AppForm>
          )}
        </div>

        <SheetFooter>
          <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type='submit'
            form='organization-settings-form'
            isLoading={updateMutation.isPending}
            disabled={settingsQuery.isLoading || settingsQuery.isError}
          >
            <Icons.check /> Salvar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
