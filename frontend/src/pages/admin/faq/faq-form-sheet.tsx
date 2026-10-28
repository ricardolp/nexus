import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';

import type { ApiFaqMessage, FaqRecommendedAction, FaqSeverity, FaqSource } from '@/lib/api-types';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';

const sources: FaqSource[] = ['SEFAZ', 'SAP', 'API', 'NEXUS'];
const severities: FaqSeverity[] = ['DENIED', 'REJECTED', 'TECHNICAL', 'UNKNOWN'];
const actions: FaqRecommendedAction[] = [
  'REVERSE_SOURCE',
  'RESET_AND_RESEND',
  'WAIT_RETRY',
  'CONTACT_SUPPORT',
  'NONE'
];

const schema = z.object({
  source: z.enum(sources as [FaqSource, ...FaqSource[]]),
  code: z.string().min(1, 'Código obrigatório'),
  docsta: z.string().optional(),
  lang: z.string().min(1),
  severity: z.enum(severities as [FaqSeverity, ...FaqSeverity[]]),
  title: z.string().min(1, 'Título obrigatório'),
  summary: z.string().min(1, 'Resumo obrigatório'),
  steps: z.array(z.object({ value: z.string() })),
  forbidden_actions: z.array(z.object({ value: z.string() })),
  recommended_action: z.enum(actions as [FaqRecommendedAction, ...FaqRecommendedAction[]]),
  faq_slug: z.string().optional(),
  active: z.boolean()
});

export type FaqFormValues = z.infer<typeof schema>;

function toLines(items: string[] | undefined) {
  return (items ?? []).map((value) => ({ value }));
}

function fromLines(items: { value: string }[]) {
  return items.map((i) => i.value.trim()).filter(Boolean);
}

const emptyValues: FaqFormValues = {
  source: 'SEFAZ',
  code: '',
  docsta: '',
  lang: 'PT',
  severity: 'UNKNOWN',
  title: '',
  summary: '',
  steps: [{ value: '' }],
  forbidden_actions: [],
  recommended_action: 'NONE',
  faq_slug: '',
  active: true
};

export type FaqFormDefaults = Partial<{
  source: string;
  code: string;
  docsta: string;
}>;

interface FaqFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message?: ApiFaqMessage | null;
  defaults?: FaqFormDefaults | null;
  onSubmit: (values: {
    source: string;
    code: string;
    docsta: string;
    lang: string;
    severity: string;
    title: string;
    summary: string;
    steps: string[];
    forbidden_actions: string[];
    recommended_action: string;
    faq_slug: string | null;
    active: boolean;
  }) => Promise<void> | void;
  submitting?: boolean;
}

export function FaqFormSheet({
  open,
  onOpenChange,
  message,
  defaults,
  onSubmit,
  submitting
}: FaqFormSheetProps) {
  const [stepDraft, setStepDraft] = useState('');
  const form = useForm<FaqFormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyValues
  });

  const stepsArray = useFieldArray({ control: form.control, name: 'steps' });
  const forbiddenArray = useFieldArray({ control: form.control, name: 'forbidden_actions' });

  useEffect(() => {
    if (!open) return;
    if (message) {
      form.reset({
        source: (message.source as FaqSource) || 'SEFAZ',
        code: message.code,
        docsta: message.docsta || '',
        lang: message.lang || 'PT',
        severity: (message.severity as FaqSeverity) || 'UNKNOWN',
        title: message.title,
        summary: message.summary,
        steps: toLines(message.steps).length ? toLines(message.steps) : [{ value: '' }],
        forbidden_actions: toLines(message.forbidden_actions),
        recommended_action: (message.recommended_action as FaqRecommendedAction) || 'NONE',
        faq_slug: message.faq_slug || '',
        active: message.active
      });
      return;
    }
    form.reset({
      ...emptyValues,
      source: (defaults?.source as FaqSource) || 'SEFAZ',
      code: defaults?.code || '',
      docsta: defaults?.docsta || ''
    });
  }, [open, message, defaults, form]);

  async function handleSubmit(values: FaqFormValues) {
    await onSubmit({
      source: values.source,
      code: values.code.trim(),
      docsta: (values.docsta || '').trim(),
      lang: values.lang.trim() || 'PT',
      severity: values.severity,
      title: values.title.trim(),
      summary: values.summary.trim(),
      steps: fromLines(values.steps),
      forbidden_actions: fromLines(values.forbidden_actions),
      recommended_action: values.recommended_action,
      faq_slug: values.faq_slug?.trim() ? values.faq_slug.trim() : null,
      active: values.active
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{message ? 'Editar mensagem FAQ' : 'Nova mensagem FAQ'}</SheetTitle>
          <SheetDescription>
            Orientação operacional por código de erro para o monitor SAP e demais clientes.
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form
            onSubmit={(event) => {
              form.handleSubmit(handleSubmit)(event)?.catch(() => {});
            }}
            className="flex flex-1 flex-col gap-4 overflow-y-auto px-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="source"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Source</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {sources.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
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
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Código</FormLabel>
                    <FormControl>
                      <Input placeholder="205 ou HTTP_502" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="docsta"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Docsta</FormLabel>
                    <FormControl>
                      <Input placeholder="vazio = genérico" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lang"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Idioma</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="severity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Severidade</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {severities.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
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
                name="recommended_action"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ação recomendada</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {actions.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Título</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="summary"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Resumo</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <FormLabel>Passos</FormLabel>
              {stepsArray.fields.map((field, index) => (
                <div key={field.id} className="flex gap-2">
                  <Input
                    {...form.register(`steps.${index}.value`)}
                    placeholder={`Passo ${index + 1}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => stepsArray.remove(index)}
                    disabled={stepsArray.fields.length <= 1}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => stepsArray.append({ value: '' })}>
                <PlusIcon className="size-4" />
                Adicionar passo
              </Button>
            </div>

            <div className="space-y-2">
              <FormLabel>Ações proibidas</FormLabel>
              {forbiddenArray.fields.map((field, index) => (
                <div key={field.id} className="flex gap-2">
                  <Input {...form.register(`forbidden_actions.${index}.value`)} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => forbiddenArray.remove(index)}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Input
                  value={stepDraft}
                  onChange={(e) => setStepDraft(e.target.value)}
                  placeholder="Nova ação proibida"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    if (!stepDraft.trim()) return;
                    forbiddenArray.append({ value: stepDraft.trim() });
                    setStepDraft('');
                  }}
                >
                  <PlusIcon className="size-4" />
                </Button>
              </div>
            </div>

            <FormField
              control={form.control}
              name="faq_slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slug FAQ</FormLabel>
                  <FormControl>
                    <Input placeholder="sefaz-205" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-2 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(Boolean(v))} />
                  </FormControl>
                  <FormLabel className="font-normal">Ativo (visível no lookup)</FormLabel>
                </FormItem>
              )}
            />

            <SheetFooter className="px-0">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {message ? 'Salvar' : 'Criar'}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
