import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import type { PlatformRole } from '@/lib/api-types';
import { Button } from '@/components/ui/button';
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

const staffRoles: PlatformRole[] = ['admin', 'system', 'support'];
const roleLabels: Record<PlatformRole, string> = {
  admin: 'Administrador',
  system: 'Sistema',
  support: 'Suporte',
  member: 'Membro'
};

const inviteSchema = z.object({
  email: z.string().email('E-mail inválido'),
  platform_role: z.enum(staffRoles as [PlatformRole, ...PlatformRole[]])
});

export type InviteFormValues = z.infer<typeof inviteSchema>;

interface UserFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: InviteFormValues) => Promise<void> | void;
  submitting?: boolean;
}

export function UserFormSheet({ open, onOpenChange, onSubmit, submitting }: UserFormSheetProps) {
  const form = useForm<InviteFormValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '', platform_role: 'support' }
  });

  useEffect(() => {
    if (open) {
      form.reset({ email: '', platform_role: 'support' });
    }
  }, [open, form]);

  async function handleSubmit(values: InviteFormValues) {
    await onSubmit(values);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Convidar membro da equipe</SheetTitle>
          <SheetDescription>
            Cria um usuário com acesso à plataforma administrativa (equipe interna, não um membro de
            organização).
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form
            onSubmit={(event) => {
              form.handleSubmit(handleSubmit)(event)?.catch(() => {});
            }}
            className="flex flex-1 flex-col gap-4 overflow-y-auto px-4"
          >
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-mail</FormLabel>
                  <FormControl>
                    <Input placeholder="pessoa@empresa.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="platform_role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Função na plataforma</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {staffRoles.map((role) => (
                        <SelectItem key={role} value={role}>
                          {roleLabels[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <SheetFooter className="px-0">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Enviando convite...' : 'Enviar convite'}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
