import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm } from 'react-hook-form';
import { PlugZapIcon, PlusIcon, TrashIcon } from 'lucide-react';
import { z } from 'zod';

import type { ApiIntegration } from '@/lib/api-types';
import type { CreateIntegrationInput, UpdateIntegrationInput } from '@/lib/endpoints';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { GradientDialogHeader } from '@/components/ui/gradient-dialog-header';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const schema = z.object({
  name: z.string().min(2, 'Informe um nome'),
  environment: z.enum(['production', 'homologation']),
  base_url: z.string().min(1, 'Informe a URL base'),
  client_id: z.string().optional(),
  client_secret: z.string().optional(),
  token_url: z.string().optional(),
  sap_client: z.string().optional(),
  sap_language: z.string().optional(),
  query_params: z.array(z.object({ key: z.string(), value: z.string() }))
});

export type IntegrationFormValues = z.infer<typeof schema>;

interface IntegrationFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integration?: ApiIntegration | null;
  systemName: string;
  onSubmit: (values: CreateIntegrationInput | UpdateIntegrationInput) => Promise<void> | void;
  submitting?: boolean;
}

export function IntegrationFormDialog({
  open,
  onOpenChange,
  integration,
  systemName,
  onSubmit,
  submitting
}: IntegrationFormDialogProps) {
  const form = useForm<IntegrationFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      environment: 'homologation',
      base_url: '',
      client_id: '',
      client_secret: '',
      token_url: '',
      sap_client: '',
      sap_language: '',
      query_params: []
    }
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'query_params' });

  useEffect(() => {
    if (!open) return;
    if (integration) {
      const config = integration.configuration_json ?? {};
      form.reset({
        name: integration.name,
        environment: integration.environment === 'production' ? 'production' : 'homologation',
        base_url: integration.base_url ?? '',
        client_id: config.client_id ?? '',
        client_secret: '',
        token_url: config.token_url ?? '',
        sap_client: config.sap_client ?? '',
        sap_language: config.sap_language ?? '',
        query_params: Object.entries(config.query_params ?? {}).map(([key, value]) => ({ key, value }))
      });
    } else {
      form.reset({
        name: `${systemName} - Homologação`,
        environment: 'homologation',
        base_url: '',
        client_id: '',
        client_secret: '',
        token_url: '',
        sap_client: '',
        sap_language: '',
        query_params: []
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, integration]);

  function handleSubmit(values: IntegrationFormValues) {
    const queryParams = Object.fromEntries(
      values.query_params.filter((p) => p.key.trim() !== '').map((p) => [p.key.trim(), p.value])
    );

    const configuration = {
      client_id: values.client_id || undefined,
      token_url: values.token_url || undefined,
      sap_client: values.sap_client || undefined,
      sap_language: values.sap_language || undefined,
      query_params: Object.keys(queryParams).length > 0 ? queryParams : undefined
    };

    if (integration) {
      const payload: UpdateIntegrationInput = {
        name: values.name,
        base_url: values.base_url,
        status: integration.status,
        configuration,
        ...(values.client_secret ? { client_secret: values.client_secret } : {})
      };
      return onSubmit(payload);
    }

    const payload: CreateIntegrationInput = {
      name: values.name,
      integration_type: 'sap_cpi',
      environment: values.environment,
      base_url: values.base_url,
      configuration,
      ...(values.client_secret ? { client_secret: values.client_secret } : {})
    };
    return onSubmit(payload);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="flex max-h-[85vh] w-[70vw] max-w-[70vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[70vw]"
      >
        <GradientDialogHeader
          icon={PlugZapIcon}
          title={integration ? `Editar integração — ${systemName}` : `Adicionar integração — ${systemName}`}
          description="Configure a URL, as credenciais e os parâmetros de consulta usados nas chamadas."
        />

        <Form {...form}>
          <form
            onSubmit={(event) => {
              form.handleSubmit(handleSubmit)(event)?.catch(() => {});
            }}
            className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-4"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex.: SAP CPI - Produção" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="environment"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ambiente</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={!!integration}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="homologation">Homologação</SelectItem>
                        <SelectItem value="production">Produção</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="base_url"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>URL base</FormLabel>
                    <FormControl>
                      <Input placeholder="https://sap-cpi.empresa.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="client_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client ID</FormLabel>
                    <FormControl>
                      <Input placeholder="Client ID do OAuth2" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="client_secret"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client Secret</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder={
                          integration?.has_secret ? 'Deixe em branco para manter o atual' : 'Client Secret'
                        }
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="token_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Token URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://sap-cpi.empresa.com/oauth/token" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sap_client"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SAP Client (mandante)</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex.: 100" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sap_language"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SAP Language</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex.: PT" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <FormLabel>Query params</FormLabel>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ key: '', value: '' })}
                >
                  <PlusIcon />
                  Adicionar parâmetro
                </Button>
              </div>
              <div className="rounded-md border p-3">
                <ScrollArea className={fields.length > 0 ? 'h-[160px]' : 'h-auto'}>
                  <div className="flex flex-col gap-2 pr-2">
                    {fields.length === 0 && (
                      <p className="text-muted-foreground text-sm">Nenhum parâmetro adicionado.</p>
                    )}
                    {fields.map((field, index) => (
                      <div key={field.id} className="flex items-center gap-2">
                        <Input
                          placeholder="chave"
                          {...form.register(`query_params.${index}.key` as const)}
                        />
                        <Input
                          placeholder="valor"
                          {...form.register(`query_params.${index}.value` as const)}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0"
                          onClick={() => remove(index)}
                        >
                          <TrashIcon className="text-destructive size-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>

            <DialogFooter className="px-0 pb-0">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Salvando...' : integration ? 'Salvar alterações' : 'Adicionar integração'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
