import { useState } from 'react';
import { KeyRoundIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { GradientDialogHeader } from '@/components/ui/gradient-dialog-header';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';

export function SetPasswordDialog({
  open,
  email,
  pending,
  minLength = 12,
  onOpenChange,
  onSubmit
}: {
  open: boolean;
  email: string | null;
  pending: boolean;
  minLength?: number;
  onOpenChange: (open: boolean) => void;
  onSubmit: (password: string) => void;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setPassword('');
    setConfirm('');
    setError(null);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < minLength) {
      setError(`A senha deve ter pelo menos ${minLength} caracteres.`);
      return;
    }
    if (password !== confirm) {
      setError('As senhas não coincidem.');
      return;
    }
    onSubmit(password);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent showCloseButton className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <GradientDialogHeader
          icon={KeyRoundIcon}
          title="Definir senha"
          description={email ?? 'Defina uma senha temporária para este usuário.'}
        />
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4 px-6 py-4">
            <p className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">
              O 2FA já configurado continua valendo. Todas as sessões ativas serão encerradas. Se a
              conta ainda estiver com convite pendente, ela passa a ativa com esta senha.
            </p>
            <div className="grid gap-2">
              <Label htmlFor="admin-set-password">Nova senha</Label>
              <PasswordInput
                id="admin-set-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={minLength}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="admin-set-password-confirm">Confirmar senha</Label>
              <PasswordInput
                id="admin-set-password-confirm"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                minLength={minLength}
                required
              />
            </div>
            {error && (
              <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">{error}</p>
            )}
          </div>
          <DialogFooter className="px-6 pb-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              <KeyRoundIcon />
              {pending ? 'Salvando...' : 'Definir senha'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
