import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { MailPlusIcon } from 'lucide-react';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { GradientDialogHeader } from '@/components/ui/gradient-dialog-header';
import { Input } from '@/components/ui/input';

const schema = z.object({
  email: z.string().email('E-mail inválido')
});

export type InviteMemberFormValues = z.infer<typeof schema>;

interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: InviteMemberFormValues) => Promise<void> | void;
  submitting?: boolean;
}

export function InviteMemberDialog({
  open,
  onOpenChange,
  onSubmit,
  submitting
}: InviteMemberDialogProps) {
  const form = useForm<InviteMemberFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' }
  });

  useEffect(() => {
    if (open) form.reset({ email: '' });
  }, [open, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <GradientDialogHeader
          icon={MailPlusIcon}
          title="Convidar usuário"
          description="Envia um convite por e-mail para uma pessoa que ainda não tem conta na plataforma."
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

            <DialogFooter className="px-0 pb-0">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Enviando...' : 'Enviar convite'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
