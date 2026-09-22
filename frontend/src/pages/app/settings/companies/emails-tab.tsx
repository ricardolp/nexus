import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDownIcon, MailIcon } from 'lucide-react';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import {
  listCompanyEmailTemplates,
  listEmailTokens,
  updateCompanyEmailTemplate
} from '@/lib/endpoints';
import type { ApiCompany, ApiEmailTemplate } from '@/lib/api-types';
import { useAuthStore } from '@/store/auth-store';
import { EmailChipsInput } from '@/pages/app/settings/integrations/flows/email-chips-input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { EmailTemplateEditor } from './email-template-editor';

const SAMPLE_HTML = `
<p>Prezado(a) {{destinatarioNome}},</p>
<p>Informamos sobre a NF-e <strong>{{numero}}</strong> série {{serie}}.</p>
<p>Chave: {{chave}}</p>
<p>Valor: {{valor}}</p>
`.trim();

export function CompanyEmailsTab({ company }: { company: ApiCompany }) {
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Partial<ApiEmailTemplate>>>({});

  const templatesQuery = useQuery({
    queryKey: ['email-templates', organizationId, company.id],
    queryFn: () => listCompanyEmailTemplates(token!, organizationId!, company.id),
    enabled: Boolean(token && organizationId)
  });

  const tokensQuery = useQuery({
    queryKey: ['email-tokens', organizationId],
    queryFn: () => listEmailTokens(token!, organizationId!),
    enabled: Boolean(token && organizationId)
  });

  const templates = templatesQuery.data?.items ?? [];
  const tokens = tokensQuery.data?.items ?? [];

  const saveMutation = useMutation({
    mutationFn: (tpl: ApiEmailTemplate) => {
      const draft = drafts[tpl.process_code] ?? {};
      return updateCompanyEmailTemplate(token!, organizationId!, company.id, tpl.process_code, {
        enabled: draft.enabled ?? tpl.enabled,
        subject: draft.subject ?? tpl.subject,
        to_addresses: draft.to_addresses ?? tpl.to_addresses,
        cc_addresses: draft.cc_addresses ?? tpl.cc_addresses,
        body_html: draft.body_html ?? tpl.body_html,
        from_name: draft.from_name ?? tpl.from_name ?? undefined,
        from_address: draft.from_address ?? tpl.from_address ?? undefined,
        attach_xml: draft.attach_xml ?? tpl.attach_xml,
        attach_danfe_sefaz: draft.attach_danfe_sefaz ?? tpl.attach_danfe_sefaz,
        attach_danfe_custom: draft.attach_danfe_custom ?? tpl.attach_danfe_custom,
        use_partner_email: draft.use_partner_email ?? tpl.use_partner_email,
        use_recipient_email: draft.use_recipient_email ?? tpl.use_recipient_email
      });
    },
    onSuccess: (_, tpl) => {
      toast.success('Template salvo', { description: tpl.process_label });
      setDrafts((d) => {
        const next = { ...d };
        delete next[tpl.process_code];
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: ['email-templates', organizationId, company.id] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Não foi possível salvar')
  });

  const toggleMutation = useMutation({
    mutationFn: ({ tpl, enabled }: { tpl: ApiEmailTemplate; enabled: boolean }) =>
      updateCompanyEmailTemplate(token!, organizationId!, company.id, tpl.process_code, { enabled }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['email-templates', organizationId, company.id] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Não foi possível atualizar')
  });

  function patch(processCode: string, patch: Partial<ApiEmailTemplate>) {
    setDrafts((d) => ({ ...d, [processCode]: { ...d[processCode], ...patch } }));
  }

  function valueOf(tpl: ApiEmailTemplate, field: keyof ApiEmailTemplate) {
    const draft = drafts[tpl.process_code];
    if (draft && field in draft) return draft[field] as never;
    return tpl[field];
  }

  const previewHtml = useMemo(() => {
    if (!expanded) return SAMPLE_HTML;
    const tpl = templates.find((t) => t.process_code === expanded);
    if (!tpl) return SAMPLE_HTML;
    const body = (valueOf(tpl, 'body_html') as string) || SAMPLE_HTML;
    return body.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const samples: Record<string, string> = {
        clientName: 'Cliente Exemplo Ltda',
        destinatarioNome: 'Cliente Exemplo Ltda',
        destinatarioCnpj: '12.345.678/0001-90',
        emitenteNome: company.trade_name || company.legal_name,
        emitenteCnpj: company.cnpj,
        numero: '123456',
        serie: '1',
        chave: '35260112345678000190550010001234561123456789',
        valor: '1.250,00',
        dataEmissao: '01/09/2026',
        destinatarioEmail: 'contato@cliente.com',
        empresaNome: company.trade_name || company.legal_name,
        naturezaOperacao: 'Venda de mercadoria'
      };
      return samples[key] ?? `{{${key}}}}`;
    });
  }, [expanded, templates, drafts, company]);

  if (templatesQuery.isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <MailIcon className="size-4" />
            E-mails por processo
          </CardTitle>
          <CardDescription>
            Ative um processo para configurar assunto, destinatários e corpo. Mensagens aparecem na caixa de e-mails mesmo sem SMTP.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pt-4">
          {templates.map((tpl) => {
            const enabled = (valueOf(tpl, 'enabled') as boolean) ?? tpl.enabled;
            const isOpen = expanded === tpl.process_code;
            return (
              <div
                key={tpl.process_code}
                className={cn(
                  'rounded-xl border transition-colors',
                  enabled ? 'border-primary/30 bg-primary/5' : 'bg-card',
                  isOpen && 'ring-1 ring-primary/20'
                )}
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <Switch
                    checked={enabled}
                    onCheckedChange={(checked) => toggleMutation.mutate({ tpl, enabled: checked })}
                    disabled={toggleMutation.isPending}
                  />
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
                    onClick={() => setExpanded(isOpen ? null : tpl.process_code)}
                  >
                    <div>
                      <p className="font-medium text-sm">{tpl.process_label}</p>
                      <p className="text-muted-foreground text-xs">{tpl.process_code}</p>
                    </div>
                    <ChevronDownIcon className={cn('size-4 shrink-0 transition-transform', isOpen && 'rotate-180')} />
                  </button>
                  {enabled ? (
                    <Badge variant="outline" className="shrink-0 border-primary/40 text-primary">Ativo</Badge>
                  ) : (
                    <Badge variant="secondary" className="shrink-0">Inativo</Badge>
                  )}
                </div>
                {isOpen ? (
                  <div className="border-t px-4 pb-4 pt-3 space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="grid gap-2">
                        <Label>Assunto</Label>
                        <Input
                          value={(valueOf(tpl, 'subject') as string) ?? ''}
                          onChange={(e) => patch(tpl.process_code, { subject: e.target.value })}
                          placeholder="NF-e {{numero}} — {{empresaNome}}"
                        />
                      </div>
                      <div className="grid gap-2 md:col-span-1">
                        <Label>Remetente (opcional)</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            placeholder="Nome"
                            value={(valueOf(tpl, 'from_name') as string) ?? ''}
                            onChange={(e) => patch(tpl.process_code, { from_name: e.target.value })}
                          />
                          <Input
                            type="email"
                            placeholder="e-mail@empresa.com"
                            value={(valueOf(tpl, 'from_address') as string) ?? ''}
                            onChange={(e) => patch(tpl.process_code, { from_address: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-3">
                      <Label>Destinatários</Label>
                      <p className="text-muted-foreground text-xs">
                        Use e-mails fixos, do parceiro ou do destinatário no XML. Pelo menos uma opção é necessária com o template ativo.
                      </p>
                      <label className="flex items-start gap-2 text-sm">
                        <Checkbox
                          className="mt-0.5"
                          checked={(valueOf(tpl, 'use_partner_email') as boolean) ?? false}
                          onCheckedChange={(v) => patch(tpl.process_code, { use_partner_email: Boolean(v) })}
                        />
                        <span>
                          Usar e-mail do parceiro
                          <span className="text-muted-foreground block text-xs">
                            {tpl.process_code.includes('inbound')
                              ? 'E-mail do emitente (fornecedor) informado no XML'
                              : 'E-mail do destinatário (cliente) informado no XML'}
                          </span>
                        </span>
                      </label>
                      <label className="flex items-start gap-2 text-sm">
                        <Checkbox
                          className="mt-0.5"
                          checked={(valueOf(tpl, 'use_recipient_email') as boolean) ?? false}
                          onCheckedChange={(v) => patch(tpl.process_code, { use_recipient_email: Boolean(v) })}
                        />
                        <span>
                          Usar e-mail do destinatário da nota
                          <span className="text-muted-foreground block text-xs">
                            Quando o campo &lt;email&gt; estiver presente no XML da NF-e
                          </span>
                        </span>
                      </label>
                      <div className="grid gap-2">
                        <Label className="text-muted-foreground text-xs font-normal">E-mails fixos (opcional)</Label>
                        <EmailChipsInput
                          value={(valueOf(tpl, 'to_addresses') as string[]) ?? []}
                          onChange={(emails) => patch(tpl.process_code, { to_addresses: emails })}
                        />
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label>CC (opcional)</Label>
                      <EmailChipsInput
                        value={(valueOf(tpl, 'cc_addresses') as string[]) ?? []}
                        onChange={(emails) => patch(tpl.process_code, { cc_addresses: emails })}
                        placeholder="cc@empresa.com"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Corpo do e-mail</Label>
                      <EmailTemplateEditor
                        tokens={tokens}
                        html={(valueOf(tpl, 'body_html') as string) ?? ''}
                        onChange={(html) => patch(tpl.process_code, { body_html: html })}
                      />
                    </div>
                    <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4">
                      <p className="font-medium text-sm">Anexos</p>
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={(valueOf(tpl, 'attach_xml') as boolean) ?? false}
                          onCheckedChange={(v) => patch(tpl.process_code, { attach_xml: Boolean(v) })}
                        />
                        XML da NF-e
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={(valueOf(tpl, 'attach_danfe_sefaz') as boolean) ?? false}
                          onCheckedChange={(v) => patch(tpl.process_code, { attach_danfe_sefaz: Boolean(v) })}
                        />
                        DANFE SEFAZ
                        <span className="text-muted-foreground text-xs">(disponível quando a geração estiver pronta)</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={(valueOf(tpl, 'attach_danfe_custom') as boolean) ?? false}
                          onCheckedChange={(v) => patch(tpl.process_code, { attach_danfe_custom: Boolean(v) })}
                        />
                        DANFE personalizada
                        <span className="text-muted-foreground text-xs">(SAP / layout custom — em breve)</span>
                      </label>
                    </div>
                    <div className="rounded-lg border bg-background p-4">
                      <p className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">Pré-visualização</p>
                      <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                    </div>
                    <Button onClick={() => saveMutation.mutate(tpl)} disabled={saveMutation.isPending}>
                      Salvar template
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
