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
import { toast } from 'sonner';
import { createIntegrationTokenMutation } from '../api/mutations';
import { INTEGRATION_SCOPE_OPTIONS } from '../constants/integration-options';
import {
  integrationTokenSchema,
  type IntegrationTokenFormValues,
} from '../schemas/integration-forms';
import { CheckboxOptionsField } from './checkbox-options-field';
import { IntegrationSecretDialog } from './integration-secret-dialog';

interface TokenFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TokenFormSheet({ open, onOpenChange }: TokenFormSheetProps) {
  const { activeOrganizationId } = useAuth();
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [secretDialogOpen, setSecretDialogOpen] = useState(false);

  const createMutation = useMutation({
    ...createIntegrationTokenMutation,
    onSuccess: (data) => {
      toast.success('Token criado com sucesso');
      onOpenChange(false);
      form.reset();
      setCreatedSecret(data.secret);
      setSecretDialogOpen(true);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Falha ao criar token');
    },
  });

  const form = useAppForm({
    defaultValues: {
      name: '',
      scopes: [],
      expiresAt: '',
    } as IntegrationTokenFormValues,
    validators: {
      onSubmit: integrationTokenSchema,
    },
    onSubmit: async ({ value }) => {
      if (!activeOrganizationId) return;

      await createMutation.mutateAsync({
        organizationId: activeOrganizationId,
        payload: {
          name: value.name,
          scopes: value.scopes,
          expiresAt: value.expiresAt?.trim() ? value.expiresAt : null,
        },
      });
    },
  });

  const { FormTextField } = useFormFields<IntegrationTokenFormValues>();

  useEffect(() => {
    if (open) {
      form.reset({ name: '', scopes: [], expiresAt: '' });
    }
  }, [open, form]);

  return (
    <>
      <IntegrationSecretDialog
        title='Token de integração criado'
        description='Copie o token abaixo. Ele será necessário para autenticar chamadas à API de integração.'
        secret={createdSecret}
        open={secretDialogOpen}
        onOpenChange={setSecretDialogOpen}
      />
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className='overflow-y-auto sm:max-w-lg'>
          <SheetHeader>
            <SheetTitle>Novo token de integração</SheetTitle>
            <SheetDescription>
              Crie um token para sistemas externos acessarem a API de integração.
            </SheetDescription>
          </SheetHeader>
          <div className='mt-6 flex flex-1 flex-col'>
            <form.AppForm>
              <form.Form id='integration-token-form' className='space-y-6 !p-0'>
                <FormTextField name='name' label='Nome' placeholder='Ex.: SAP CPI Produção' />
                <FormTextField
                  name='expiresAt'
                  label='Expira em (opcional)'
                  type='datetime-local'
                />
                <form.Field name='scopes'>
                  {(field) => (
                    <CheckboxOptionsField
                      label='Escopos da API'
                      options={INTEGRATION_SCOPE_OPTIONS}
                      value={field.state.value}
                      onChange={field.handleChange}
                    />
                  )}
                </form.Field>
              </form.Form>
            </form.AppForm>
            <SheetFooter className='mt-6'>
              <Button
                type='submit'
                form='integration-token-form'
                disabled={createMutation.isPending}
              >
                {createMutation.isPending && (
                  <Icons.spinner className='mr-2 h-4 w-4 animate-spin' />
                )}
                Criar token
              </Button>
            </SheetFooter>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
