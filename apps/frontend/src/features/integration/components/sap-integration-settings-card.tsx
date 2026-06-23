'use client';

import { useAppForm, useFormFields } from '@/components/ui/tanstack-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Icons } from '@/components/icons';
import { useAuth } from '@/context/auth-context';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { updateSapIntegrationMutation } from '../api/mutations';
import { organizationIntegrationSettingsQueryOptions } from '../api/queries';
import {
  sapIntegrationSchema,
  type SapIntegrationFormValues,
} from '../schemas/integration-forms';

export function SapIntegrationSettingsCard() {
  const { activeOrganizationId } = useAuth();

  const settingsQuery = useQuery({
    ...organizationIntegrationSettingsQueryOptions(activeOrganizationId ?? ''),
    enabled: Boolean(activeOrganizationId),
  });

  const updateMutation = useMutation({
    ...updateSapIntegrationMutation,
    onSuccess: () => {
      toast.success('Integração SAP salva com sucesso');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Falha ao salvar integração SAP');
    },
  });

  const form = useAppForm({
    defaultValues: {
      integrationBaseUrl: '',
      integrationClientId: '',
      clientSecret: '',
      sapClient: '',
      sapLanguage: '',
    } as SapIntegrationFormValues,
    validators: {
      onSubmit: sapIntegrationSchema,
    },
    onSubmit: async ({ value }) => {
      if (!activeOrganizationId) return;

      await updateMutation.mutateAsync({
        organizationId: activeOrganizationId,
        payload: {
          integrationBaseUrl: value.integrationBaseUrl?.trim() || null,
          integrationClientId: value.integrationClientId?.trim() || null,
          clientSecret: value.clientSecret?.trim() || undefined,
          sapClient: value.sapClient?.trim() || null,
          sapLanguage: value.sapLanguage?.trim() || null,
        },
      });
    },
  });

  const { FormTextField } = useFormFields<SapIntegrationFormValues>();

  useEffect(() => {
    if (settingsQuery.data) {
      form.reset({
        integrationBaseUrl: settingsQuery.data.baseUrl ?? '',
        integrationClientId: settingsQuery.data.clientId ?? '',
        clientSecret: '',
        sapClient: settingsQuery.data.sapClient ?? '',
        sapLanguage: settingsQuery.data.sapLanguage ?? '',
      });
    }
  }, [settingsQuery.data, form]);

  const integration = settingsQuery.data;
  const isConfigured = Boolean(
    integration?.baseUrl && integration?.clientId && integration?.secretConfigured,
  );

  return (
    <Card>
      <CardHeader>
        <div className='flex items-start justify-between gap-4'>
          <div>
            <CardTitle>Integração SAP CPI</CardTitle>
            <CardDescription>
              Cadastre a URL completa do endpoint CPI (ex.: /http/Nexus/NFE). A busca de
              pedidos usa essa URL com os parâmetros sap-client, document (CNPJ do
              emissor), branchCnpj, cutoffDate, type e name=PurchaseOrders.
            </CardDescription>
          </div>
          <Badge variant={isConfigured ? 'default' : 'secondary'}>
            {isConfigured ? 'Configurada' : 'Pendente'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {settingsQuery.isLoading ? (
          <div className='text-muted-foreground flex min-h-[200px] items-center justify-center text-sm'>
            Carregando configurações...
          </div>
        ) : settingsQuery.isError ? (
          <div className='text-destructive flex min-h-[200px] items-center justify-center text-sm'>
            {settingsQuery.error instanceof Error
              ? settingsQuery.error.message
              : 'Falha ao carregar integração SAP'}
          </div>
        ) : (
          <form.AppForm>
            <form.Form
              id='sap-integration-form'
              className='grid gap-4 md:grid-cols-2 !p-0'
            >
            <FormTextField
              name='integrationBaseUrl'
              label='URL base do CPI'
              placeholder='https://tenant.it-cpi.cfapps.../http/Nexus/NFE'
            />
              <FormTextField
                name='integrationClientId'
                label='Client ID OAuth'
                placeholder='sb-xxxxxxxx'
              />
              <FormTextField
                name='clientSecret'
                label='Client Secret'
                type='password'
                placeholder={
                  integration?.secretConfigured
                    ? 'Deixe em branco para manter o atual'
                    : 'Informe o client secret'
                }
              />
              <FormTextField name='sapClient' label='SAP Client' placeholder='310' />
              <FormTextField name='sapLanguage' label='Idioma SAP' placeholder='PT' />
              <div className='flex items-end md:col-span-2'>
                <Button type='submit' disabled={updateMutation.isPending}>
                  {updateMutation.isPending && (
                    <Icons.spinner className='mr-2 h-4 w-4 animate-spin' />
                  )}
                  Salvar integração SAP
                </Button>
              </div>
            </form.Form>
          </form.AppForm>
        )}
      </CardContent>
    </Card>
  );
}
