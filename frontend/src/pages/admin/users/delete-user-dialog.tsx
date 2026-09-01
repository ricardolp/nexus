import { Trash2Icon } from 'lucide-react';

import type { ApiUser } from '@/lib/api-types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { GradientDialogHeader } from '@/components/ui/gradient-dialog-header';

interface DeleteUserDialogProps {
  user: ApiUser | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function DeleteUserDialog({ user, pending, onOpenChange, onConfirm }: DeleteUserDialogProps) {
  return (
    <Dialog open={!!user} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <GradientDialogHeader
          icon={Trash2Icon}
          title="Eliminar usuário?"
          description={user ? user.email : 'O usuário sairá da lista, mas o registro permanece no sistema.'}
        />

        <div className="flex flex-col gap-4 px-6 py-4">
          <p className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">
            O usuário deixa de aparecer na lista e não consegue mais entrar. A conta não é apagada do banco —
            o histórico e as referências são preservados. O mesmo e-mail pode ser convidado de novo depois.
          </p>
        </div>

        <DialogFooter className="px-6 pb-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" variant="destructive" disabled={pending} onClick={onConfirm}>
            <Trash2Icon />
            {pending ? 'Eliminando...' : 'Eliminar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
