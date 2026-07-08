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
import { useAuth } from '@/context/auth-context';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';
import * as z from 'zod';
import {
  updateOrganizationMutation,
  updateOrganizationSettingsMutation,
} from '../api/mutations';
import { organizationSettingsQueryOptions } from '../api/queries';
import type { Organization } from '../api/types';
import {
  editOrganizationSchema,
  organizationSchema,
  type EditOrganizationFormValues,
} from '../schemas/organization';
import { hydrateOrganizationWithCachedLogo } from '@/lib/organization/organization-logo-cache';
import { FormOrganizationLogoField } from './organization-logo-field';

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
  const { refreshSession, patchOrganizationLogo } = useAuth();
  const organizationWithLogo = hydrateOrganizationWithCachedLogo(organization);

  const settingsQuery = useQuery({
    ...organizationSettingsQueryOptions(organization.id),
    enabled: open,
  });

  const updateOrganizationMut = useMutation({
    ...updateOrganizationMutation,
  });

  const updateSettingsMut = useMutation({
    ...updateOrganizationSettingsMutation,
  });

  const form = useAppForm({
    defaultValues: {
      nome: organizationWithLogo.nome,
      slug: organizationWithLogo.slug,
      logo: organizationWithLogo.logo,
      maxCompanies: 1,
    } as EditOrganizationFormValues,
    validators: {
      onSubmit: editOrganizationSchema,
    },
    onSubmit: async ({ value }) => {
      const parsed = editOrganizationSchema.safeParse({
        nome: value.nome.trim(),
        slug: value.slug.trim(),
        logo: value.logo ?? null,
        maxCompanies: value.maxCompanies,
      });

      if (!parsed.success) {
        toast.error(parsed.error.issues[0]?.message ?? 'Dados inválidos');
        return;
      }

      try {
        const [updatedOrganization] = await Promise.all([
          updateOrganizationMut.mutateAsync({
            organizationId: organization.id,
            payload: {
              nome: parsed.data.nome,
              slug: parsed.data.slug,
              logo: parsed.data.logo ?? null,
            },
          }),
          updateSettingsMut.mutateAsync({
            organizationId: organization.id,
            payload: { maxCompanies: parsed.data.maxCompanies },
          }),
        ]);

        patchOrganizationLogo(
          organization.id,
          updatedOrganization.logo ?? parsed.data.logo ?? null,
        );
        toast.success('Organização atualizada');
        await refreshSession();
        onOpenChange(false);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Falha ao atualizar organização',
        );
      }
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        nome: organizationWithLogo.nome,
        slug: organizationWithLogo.slug,
        logo: organizationWithLogo.logo,
        maxCompanies: settingsQuery.data?.maxCompanies ?? 1,
      });
    }
  }, [open, organizationWithLogo, settingsQuery.data, form]);

  const { FormTextField } = useFormFields<EditOrganizationFormValues>();
  const isSaving = updateOrganizationMut.isPending || updateSettingsMut.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='flex flex-col'>
        <SheetHeader>
          <SheetTitle>Editar organização</SheetTitle>
          <SheetDescription>
            Atualize os dados e configurações de <strong>{organization.nome}</strong>.
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
                <FormOrganizationLogoField
                  name='logo'
                  label='Logo'
                  description='Imagem quadrada exibida no seletor de organizações (150×150 px).'
                />

                <FormTextField
                  name='nome'
                  label='Nome'
                  required
                  validators={{
                    onBlur: organizationSchema.shape.nome,
                  }}
                />

                <FormTextField
                  name='slug'
                  label='Slug'
                  required
                  validators={{
                    onBlur: organizationSchema.shape.slug,
                  }}
                />

                <FormTextField
                  name='maxCompanies'
                  label='Limite de empresas'
                  description='Quantidade máxima de empresas (CNPJs) que esta organização pode cadastrar.'
                  required
                  type='number'
                  min={1}
                  step={1}
                  validators={{
                    onBlur: editOrganizationSchema.shape.maxCompanies,
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
            isLoading={isSaving}
            disabled={settingsQuery.isLoading || settingsQuery.isError}
          >
            <Icons.check /> Salvar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
