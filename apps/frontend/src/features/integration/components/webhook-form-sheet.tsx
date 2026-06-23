'use client';

import { useAppForm, useFormFields } from '@/components/ui/tanstack-form';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
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
import { createWebhookMutation, updateWebhookMutation } from '../api/mutations';
import type { WebhookEndpoint } from '../api/types';
import { WEBHOOK_EVENT_TYPE_OPTIONS } from '../constants/integration-options';
import {
  webhookEndpointSchema,
  type WebhookEndpointFormValues,
} from '../schemas/integration-forms';
import { CheckboxOptionsField } from './checkbox-options-field';
import { IntegrationSecretDialog } from './integration-secret-dialog';

interface WebhookFormSheetProps {
  webhook?: WebhookEndpoint;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WebhookFormSheet({ webhook, open, onOpenChange }: WebhookFormSheetProps) {
  const { activeOrganizationId } = useAuth();
  const isEdit = Boolean(webhook);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [secretDialogOpen, setSecretDialogOpen] = useState(false);

  const createMutation = useMutation({
    ...createWebhookMutation,
    onSuccess: (data) => {
      toast.success('Webhook criado com sucesso');
      onOpenChange(false);
      form.reset();
      setCreatedSecret(data.secret);
      setSecretDialogOpen(true);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Falha ao criar webhook');
    },
  });

  const updateMutation = useMutation({
    ...updateWebhookMutation,
    onSuccess: () => {
      toast.success('Webhook atualizado');
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Falha ao atualizar webhook');
    },
  });

  const form = useAppForm({
    defaultValues: {
      url: '',
      description: '',
      eventTypes: [],
      active: true,
    } as WebhookEndpointFormValues,
    validators: {
      onSubmit: webhookEndpointSchema,
    },
    onSubmit: async ({ value }) => {
      if (!activeOrganizationId) return;

      if (isEdit && webhook) {
        await updateMutation.mutateAsync({
          organizationId: activeOrganizationId,
          endpointId: webhook.id,
          payload: {
            url: value.url,
            description: value.description?.trim() || null,
            eventTypes: value.eventTypes,
            active: value.active,
          },
        });
        return;
      }

      await createMutation.mutateAsync({
        organizationId: activeOrganizationId,
        payload: {
          url: value.url,
          description: value.description?.trim() || null,
          eventTypes: value.eventTypes,
        },
      });
    },
  });

  const { FormTextField } = useFormFields<WebhookEndpointFormValues>();

  useEffect(() => {
    if (open) {
      form.reset({
        url: webhook?.url ?? '',
        description: webhook?.description ?? '',
        eventTypes: webhook?.eventTypes ?? [],
        active: webhook?.active ?? true,
      });
    }
  }, [open, webhook, form]);

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <IntegrationSecretDialog
        title='Webhook criado'
        description='Copie o segredo de assinatura abaixo. Ele será usado para validar os payloads enviados ao seu endpoint.'
        secret={createdSecret}
        open={secretDialogOpen}
        onOpenChange={setSecretDialogOpen}
      />
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className='overflow-y-auto sm:max-w-lg'>
          <SheetHeader>
            <SheetTitle>{isEdit ? 'Editar webhook' : 'Novo webhook'}</SheetTitle>
            <SheetDescription>
              Configure um endpoint HTTPS para receber eventos da plataforma.
            </SheetDescription>
          </SheetHeader>
          <div className='mt-6 flex flex-1 flex-col'>
            <form.AppForm>
              <form.Form id='webhook-form' className='space-y-6 !p-0'>
                <FormTextField
                  name='url'
                  label='URL do endpoint'
                  placeholder='https://seu-sistema.com/webhooks/nexus'
                />
                <FormTextField
                  name='description'
                  label='Descrição (opcional)'
                  placeholder='Ex.: SAP callback produção'
                />
                <form.Field name='eventTypes'>
                  {(field) => (
                    <CheckboxOptionsField
                      label='Eventos inscritos'
                      options={WEBHOOK_EVENT_TYPE_OPTIONS}
                      value={field.state.value}
                      onChange={field.handleChange}
                    />
                  )}
                </form.Field>
                {isEdit && (
                  <form.Field name='active'>
                    {(field) => (
                      <div className='flex items-center gap-3'>
                        <Checkbox
                          checked={Boolean(field.state.value)}
                          onCheckedChange={(checked) => field.handleChange(Boolean(checked))}
                        />
                        <Label>Webhook ativo</Label>
                      </div>
                    )}
                  </form.Field>
                )}
              </form.Form>
            </form.AppForm>
            <SheetFooter className='mt-6'>
              <Button type='submit' form='webhook-form' disabled={isPending}>
                {isPending && <Icons.spinner className='mr-2 h-4 w-4 animate-spin' />}
                {isEdit ? 'Salvar alterações' : 'Criar webhook'}
              </Button>
            </SheetFooter>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
