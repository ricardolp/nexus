import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { BuildingIcon, Loader2Icon, SearchIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { ApiError } from '@/lib/api';
import type { ApiCompany } from '@/lib/api-types';
import { BRAZILIAN_STATES } from '@/lib/brazilian-states';
import { lookupCNPJ } from '@/lib/endpoints';
import { useAuthStore } from '@/store/auth-store';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { GradientDialogHeader } from '@/components/ui/gradient-dialog-header';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const schema = z.object({
  legal_name: z.string().trim().min(2, 'Informe a razão social'),
  trade_name: z.string().trim().optional(),
  cnpj: z
    .string()
    .trim()
    .refine((v) => v.replace(/\D/g, '').length === 14, 'CNPJ deve conter 14 dígitos'),
  uf: z.string().length(2, 'Selecione a UF de registro da empresa'),
  environment: z.enum(['production', 'homologation'])
});

export type CompanyFormValues = z.infer<typeof schema>;

const emptyValues: CompanyFormValues = {
  legal_name: '',
  trade_name: '',
  cnpj: '',
  uf: '',
  environment: 'homologation'
};

function valuesFromCompany(company: ApiCompany): CompanyFormValues {
  return {
    legal_name: company.legal_name,
    trade_name: company.trade_name ?? '',
    cnpj: company.cnpj,
    uf: company.uf ?? '',
    environment: company.environment === 'production' ? 'production' : 'homologation'
  };
}

interface CompanyFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // undefined/null = criar; uma ApiCompany = editar os dados cadastrais
  // dela (CNPJ fica travado — ver UpdateCompanyDetailsInput no backend
  // sobre por que não é editável).
  company?: ApiCompany | null;
  onSubmit: (values: CompanyFormValues) => Promise<void> | void;
  submitting?: boolean;
}

export function CompanyFormDialog({ open, onOpenChange, company, onSubmit, submitting }: CompanyFormDialogProps) {
  const isEditing = !!company;
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const [lookupStatus, setLookupStatus] = useState<string | null>(null);

  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyValues
  });

  const cnpjValue = form.watch('cnpj');
  const canLookup =
    !isEditing && !!token && !!organizationId && cnpjValue.replace(/\D/g, '').length === 14;

  const lookupMutation = useMutation({
    mutationFn: () => lookupCNPJ(token!, organizationId!, form.getValues('cnpj')),
    onSuccess: (data) => {
      const legalName = (data.legal_name || '').trim();
      const tradeName = (data.trade_name || '').trim() || legalName;
      if (legalName) form.setValue('legal_name', legalName, { shouldDirty: true, shouldValidate: true });
      if (tradeName) form.setValue('trade_name', tradeName, { shouldDirty: true, shouldValidate: true });
      if (data.uf) form.setValue('uf', data.uf.toUpperCase(), { shouldDirty: true, shouldValidate: true });
      setLookupStatus(data.status?.trim() || 'OK');
      toast.success('Dados do CNPJ preenchidos — confirme ou ajuste antes de salvar.');
    },
    onError: (err) => {
      setLookupStatus(null);
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível consultar o CNPJ');
    }
  });

  useEffect(() => {
    if (open) {
      form.reset(company ? valuesFromCompany(company) : emptyValues);
      setLookupStatus(null);
    }
  }, [open, company, form]);

  function handleSubmit(values: CompanyFormValues) {
    return onSubmit({
      ...values,
      trade_name: values.trade_name || undefined,
      cnpj: values.cnpj.replace(/\D/g, '')
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <GradientDialogHeader
          icon={BuildingIcon}
          title={isEditing ? 'Editar empresa' : 'Adicionar empresa'}
          description={
            isEditing
              ? 'Atualize os dados cadastrais desta empresa — o CNPJ não pode ser alterado.'
              : 'Cadastre uma empresa (CNPJ) desta organização para emissão de documentos fiscais.'
          }
        />

        <Form {...form}>
          <form
            onSubmit={(event) => {
              form.handleSubmit(handleSubmit)(event)?.catch(() => {});
            }}
            className="flex flex-col gap-4 px-6 py-4"
          >
            <FormField
              control={form.control}
              name="cnpj"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CNPJ</FormLabel>
                  <div className="flex gap-2">
                    <FormControl>
                      <Input
                        placeholder="00.000.000/0000-00"
                        disabled={isEditing}
                        {...field}
                        onChange={(e) => {
                          setLookupStatus(null);
                          field.onChange(e);
                        }}
                      />
                    </FormControl>
                    {!isEditing ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        disabled={!canLookup || lookupMutation.isPending}
                        onClick={() => lookupMutation.mutate()}
                        aria-label="Buscar CNPJ na Receita Federal"
                        title="Buscar CNPJ"
                      >
                        {lookupMutation.isPending ? (
                          <Loader2Icon className="size-4 animate-spin" />
                        ) : (
                          <SearchIcon className="size-4" />
                        )}
                      </Button>
                    ) : null}
                  </div>
                  {lookupStatus ? (
                    <p className="text-muted-foreground text-xs">
                      Dados sugeridos pela Receita Federal. Situação: {lookupStatus}. Revise antes de
                      salvar.
                    </p>
                  ) : null}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="legal_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Razão social</FormLabel>
                  <FormControl>
                    <Input placeholder="Empresa LTDA" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="trade_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome fantasia</FormLabel>
                  <FormControl>
                    <Input placeholder="Opcional" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="uf"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>UF</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {BRAZILIAN_STATES.map((state) => (
                          <SelectItem key={state.uf} value={state.uf}>
                            {state.uf} — {state.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                    <Select value={field.value} onValueChange={field.onChange}>
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
            </div>

            <DialogFooter className="px-0 pb-0">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Adicionar empresa'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
