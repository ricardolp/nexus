'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { toast } from 'sonner';

interface IntegrationSecretDialogProps {
  title: string;
  description: string;
  secret: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function IntegrationSecretDialog({
  title,
  description,
  secret,
  open,
  onOpenChange,
}: IntegrationSecretDialogProps) {
  const handleCopy = async () => {
    if (!secret) return;
    await navigator.clipboard.writeText(secret);
    toast.success('Copiado para a área de transferência');
  };

  return (
    <Modal
      title={title}
      description={description}
      isOpen={open}
      onClose={() => onOpenChange(false)}
    >
      <div className='space-y-4 pt-2'>
        <div className='flex gap-2'>
          <Input readOnly value={secret ?? ''} className='font-mono text-sm' />
          <Button type='button' variant='outline' onClick={handleCopy}>
            Copiar
          </Button>
        </div>
        <p className='text-muted-foreground text-xs'>
          Guarde este valor em local seguro. Ele não será exibido novamente.
        </p>
        <div className='flex justify-end'>
          <Button onClick={() => onOpenChange(false)}>Entendi</Button>
        </div>
      </div>
    </Modal>
  );
}
