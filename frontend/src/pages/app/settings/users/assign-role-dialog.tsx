import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { ShieldPlusIcon } from 'lucide-react';
import { z } from 'zod';

import type { ApiMember, ApiRole } from '@/lib/api-types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { GradientDialogHeader } from '@/components/ui/gradient-dialog-header';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const schema = z.object({
  role_id: z.string().min(1, 'Selecione um perfil')
});

export type AssignRoleFormValues = z.infer<typeof schema>;

interface AssignRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: ApiMember | null;
  availableRoles: ApiRole[];
  onSubmit: (values: AssignRoleFormValues) => Promise<void> | void;
  submitting?: boolean;
}

export function AssignRoleDialog({
  open,
  onOpenChange,
  member,
  availableRoles,
  onSubmit,
  submitting
}: AssignRoleDialogProps) {
  const form = useForm<AssignRoleFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { role_id: '' }
  });

  useEffect(() => {
    if (open) form.reset({ role_id: '' });
  }, [open, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <GradientDialogHeader
          icon={ShieldPlusIcon}
          title="Adicionar perfil"
          description={
            member
              ? `Vincule um perfil de acesso a ${member.email}.`
              : 'Vincule um perfil de acesso a este usuário.'
          }
        />

        <Form {...form}>
          <form
            onSubmit={(event) => {
              form.handleSubmit(onSubmit)(event)?.catch(() => {});
            }}
            className="flex flex-col gap-4 px-6 py-4"
          >
            <FormField
              control={form.control}
              name="role_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Perfil de acesso</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione um perfil" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableRoles.length === 0 ? (
                        <div className="text-muted-foreground px-2 py-1.5 text-sm">
                          Nenhum perfil disponível para atribuir
                        </div>
                      ) : (
                        availableRoles.map((role) => (
                          <SelectItem key={role.id} value={role.id}>
                            {role.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="px-0 pb-0">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting || availableRoles.length === 0}>
                {submitting ? 'Adicionando...' : 'Adicionar perfil'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
