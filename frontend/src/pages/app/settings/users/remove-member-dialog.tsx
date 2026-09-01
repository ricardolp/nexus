import { Trash2Icon } from 'lucide-react';

import type { ApiMember } from '@/lib/api-types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { GradientDialogHeader } from '@/components/ui/gradient-dialog-header';

interface RemoveMemberDialogProps {
  member: ApiMember | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function RemoveMemberDialog({ member, pending, onOpenChange, onConfirm }: RemoveMemberDialogProps) {
  return (
    <Dialog open={!!member} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <GradientDialogHeader
          icon={Trash2Icon}
          title="Eliminar usuário?"
          description={member ? member.email : 'O usuário sairá da lista, mas a conta permanece no sistema.'}
        />

        <div className="flex flex-col gap-4 px-6 py-4">
          <p className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">
            O usuário deixa de aparecer nesta organização e perde o acesso a ela. A conta não é apagada —
            o registro continua no sistema para auditoria. Você pode adicioná-lo de novo depois pelo mesmo
            e-mail.
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
