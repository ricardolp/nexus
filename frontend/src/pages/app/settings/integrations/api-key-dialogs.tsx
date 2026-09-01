import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { CheckIcon, CopyIcon, EyeIcon, EyeOffIcon, KeyRoundIcon, Trash2Icon } from 'lucide-react';
import { z } from 'zod';

import type { CreatedApiClient } from '@/lib/api-types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { GradientDialogHeader } from '@/components/ui/gradient-dialog-header';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { copyText } from '@/pages/profile/helpers';
import { cn } from '@/lib/utils';

const ACCESS_PRESETS = {
  inbound: ['fiscal_documents:inbound:create'],
  read: ['fiscal_documents:read'],
  full: ['fiscal_documents:create', 'fiscal_documents:read']
} as const;

type AccessPreset = keyof typeof ACCESS_PRESETS;

const schema = z.object({
  name: z.string().min(2, 'Informe um nome'),
  source_system: z.string().min(2, 'Informe o sistema de origem'),
  access: z.enum(['inbound', 'read', 'full'])
});

type FormValues = z.infer<typeof schema>;

export function scopesForAccess(access: AccessPreset): string[] {
  return [...ACCESS_PRESETS[access]];
}

interface CreateApiKeyDialogProps {
  open: boolean;
  submitting?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: { name: string; source_system: string; scopes: string[] }) => Promise<void> | void;
}

export function CreateApiKeyDialog({ open, submitting, onOpenChange, onSubmit }: CreateApiKeyDialogProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', source_system: 'sap', access: 'inbound' }
  });

  useEffect(() => {
    if (!open) return;
    form.reset({ name: '', source_system: 'sap', access: 'inbound' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <GradientDialogHeader
          icon={KeyRoundIcon}
          title="Criar token de entrada"
          description="O SAP usa este token no header X-Org-Token para postar documentos."
        />
        <Form {...form}>
          <form
            onSubmit={(event) => {
              form
                .handleSubmit((values) =>
                  onSubmit({
                    name: values.name,
                    source_system: values.source_system,
                    scopes: scopesForAccess(values.access)
                  })
                )(event)
                ?.catch(() => {});
            }}
            className="flex flex-col gap-5 px-6 py-5"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex.: Compras, Homologação, CPI Produção" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="access"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>O que este token pode fazer</FormLabel>
                  <FormControl>
                    <RadioGroup value={field.value} onValueChange={field.onChange} className="grid gap-2">
                      {(
                        [
                          {
                            value: 'inbound',
                            title: 'Entrada',
                            hint: 'Recomendado para o SAP enviar NF-e recebidas.'
                          },
                          {
                            value: 'read',
                            title: 'Somente leitura',
                            hint: 'Consulta documentos, sem criar nada.'
                          },
                          {
                            value: 'full',
                            title: 'Completo',
                            hint: 'Entrada e saída. Use só se o iFlow também emitir notas.'
                          }
                        ] as const
                      ).map((option) => (
                        <label
                          key={option.value}
                          className={cn(
                            'hover:bg-muted/40 flex cursor-pointer items-start gap-3 rounded-lg border p-3',
                            field.value === option.value && 'border-primary bg-primary/5'
                          )}
                        >
                          <RadioGroupItem value={option.value} className="mt-0.5" />
                          <span>
                            <span className="block text-sm font-medium">{option.title}</span>
                            <span className="text-muted-foreground block text-xs">{option.hint}</span>
                          </span>
                        </label>
                      ))}
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="px-0 pb-0">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Gerando...' : 'Criar token'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

interface SecretRowProps {
  label: string;
  value: string;
  hint?: string;
}

function SecretRow({ label, value, hint }: SecretRowProps) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    await copyText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{label}</p>
        {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      </div>
      <div className="flex items-center gap-2">
        <code className="bg-muted flex-1 truncate rounded-md px-3 py-2 font-mono text-xs">
          {visible ? value : '•'.repeat(Math.min(32, value.length))}
        </code>
        <Button type="button" variant="outline" size="icon" className="size-8 shrink-0" onClick={() => setVisible((v) => !v)}>
          {visible ? <EyeOffIcon /> : <EyeIcon />}
          <span className="sr-only">{visible ? 'Ocultar' : 'Mostrar'}</span>
        </Button>
        <Button type="button" variant="outline" size="icon" className="size-8 shrink-0" onClick={() => void copy()}>
          {copied ? <CheckIcon /> : <CopyIcon />}
          <span className="sr-only">Copiar</span>
        </Button>
      </div>
    </div>
  );
}

interface ApiKeyCreatedDialogProps {
  created: CreatedApiClient | null;
  rotatedToken?: string | null;
  onOpenChange: (open: boolean) => void;
}

export function ApiKeyCreatedDialog({ created, rotatedToken, onOpenChange }: ApiKeyCreatedDialogProps) {
  const orgToken = rotatedToken || created?.org_token || '';
  const open = !!created || !!rotatedToken;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onOpenChange(false);
      }}
    >
      <DialogContent showCloseButton className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <GradientDialogHeader
          icon={KeyRoundIcon}
          title={rotatedToken ? 'Novo token gerado' : 'Copie o token agora'}
          description="Este valor não volta a ser exibido. Guarde em um cofre antes de fechar."
        />
        <div className="flex flex-col gap-4 px-6 py-4">
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
            No iFlow do SAP, envie este valor no header <code>X-Org-Token</code>.
          </p>
          {orgToken ? (
            <SecretRow label="Token de entrada" value={orgToken} hint="Header X-Org-Token" />
          ) : null}
          {created ? (
            <>
              <SecretRow label="Client ID" value={created.client.client_id} hint="OAuth client credentials" />
              <SecretRow label="Client secret" value={created.client_secret} hint="POST /v1/oauth/token" />
            </>
          ) : null}
        </div>
        <DialogFooter className="px-6 pb-6">
          <Button type="button" onClick={() => onOpenChange(false)}>
            Já copiei
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface RevokeApiKeyDialogProps {
  name: string | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function RevokeApiKeyDialog({ name, pending, onOpenChange, onConfirm }: RevokeApiKeyDialogProps) {
  return (
    <Dialog open={!!name} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <GradientDialogHeader
          icon={Trash2Icon}
          title="Revogar token?"
          description={name ? name : 'O token deixa de autenticar chamadas do SAP.'}
        />
        <div className="flex flex-col gap-4 px-6 py-4">
          <p className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">
            POSTs com este token passam a ser rejeitados. Esta ação não pode ser desfeita — gere um novo token se
            precisar restabelecer a integração.
          </p>
        </div>
        <DialogFooter className="px-6 pb-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" variant="destructive" disabled={pending} onClick={onConfirm}>
            <Trash2Icon />
            {pending ? 'Revogando...' : 'Revogar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
