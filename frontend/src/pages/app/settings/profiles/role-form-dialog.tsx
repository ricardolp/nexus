import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { ShieldCheckIcon } from 'lucide-react';
import { z } from 'zod';

import type { ApiRole } from '@/lib/api-types';
import type { RoleInput } from '@/lib/endpoints';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { GradientDialogHeader } from '@/components/ui/gradient-dialog-header';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { groupPermissions, permissionLabel } from './permission-catalog';

const roleSchema = z.object({
  name: z.string().min(2, 'Informe um nome'),
  description: z.string().max(500, 'Máximo de 500 caracteres').optional(),
  permissions: z.array(z.string()).min(1, 'Selecione ao menos uma permissão')
});

export type RoleFormValues = z.infer<typeof roleSchema>;

interface RoleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role?: ApiRole | null;
  permissionCatalog: string[];
  onSubmit: (values: RoleInput) => Promise<void> | void;
  submitting?: boolean;
}

export function RoleFormDialog({
  open,
  onOpenChange,
  role,
  permissionCatalog,
  onSubmit,
  submitting
}: RoleFormDialogProps) {
  const form = useForm<RoleFormValues>({
    resolver: zodResolver(roleSchema),
    defaultValues: { name: '', description: '', permissions: [] }
  });
  const [openSections, setOpenSections] = useState<string[]>([]);

  const groups = groupPermissions(permissionCatalog);

  useEffect(() => {
    if (open) {
      form.reset(
        role
          ? { name: role.name, description: role.description ?? '', permissions: role.permissions }
          : { name: '', description: '', permissions: [] }
      );
      setOpenSections(
        role ? groups.filter((g) => g.permissions.some((p) => role.permissions.includes(p))).map((g) => g.resource) : []
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, role]);

  async function handleSubmit(values: RoleFormValues) {
    await onSubmit({
      name: values.name,
      description: values.description,
      permissions: values.permissions
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="flex max-h-[85vh] w-[70vw] max-w-[70vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[70vw]"
      >
        <GradientDialogHeader
          icon={ShieldCheckIcon}
          title={role ? 'Editar perfil de acesso' : 'Novo perfil de acesso'}
          description="Perfis de acesso definem quais ações os membros da organização podem executar."
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
                      <Input placeholder="Ex.: Operador Fiscal" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Para que serve este perfil de acesso"
                        className="min-h-9"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="permissions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Permissões</FormLabel>
                  <div className="rounded-md border">
                    <ScrollArea className="h-[320px]">
                      <Accordion
                        type="multiple"
                        value={openSections}
                        onValueChange={setOpenSections}
                        className="px-4"
                      >
                        {groups.map((group) => {
                          const selectedCount = group.permissions.filter((p) =>
                            field.value.includes(p)
                          ).length;
                          return (
                            <AccordionItem key={group.resource} value={group.resource}>
                              <AccordionTrigger>
                                <span className="flex items-center gap-2">
                                  {group.label}
                                  {selectedCount > 0 && (
                                    <Badge variant="secondary" className="pointer-events-none">
                                      {selectedCount}/{group.permissions.length}
                                    </Badge>
                                  )}
                                </span>
                              </AccordionTrigger>
                              <AccordionContent>
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                  {group.permissions.map((permission) => {
                                    const checked = field.value.includes(permission);
                                    return (
                                      <Label
                                        key={permission}
                                        className="flex items-center gap-2 text-sm font-normal"
                                      >
                                        <Checkbox
                                          checked={checked}
                                          onCheckedChange={(value) => {
                                            if (value) {
                                              field.onChange([...field.value, permission]);
                                            } else {
                                              field.onChange(field.value.filter((p) => p !== permission));
                                            }
                                          }}
                                        />
                                        {permissionLabel(permission)}
                                      </Label>
                                    );
                                  })}
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          );
                        })}
                      </Accordion>
                    </ScrollArea>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="px-0 pb-0">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Salvando...' : role ? 'Salvar alterações' : 'Criar perfil'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
