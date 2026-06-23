'use client';

import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';

interface ConfirmActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

export function ConfirmActionModal({
  isOpen,
  onClose,
  onConfirm,
  loading,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
}: ConfirmActionModalProps) {
  return (
    <Modal title={title} description={description} isOpen={isOpen} onClose={onClose}>
      <div className='flex w-full items-center justify-end space-x-2 pt-6'>
        <Button disabled={loading} variant='outline' onClick={onClose}>
          {cancelLabel}
        </Button>
        <Button disabled={loading} variant='destructive' onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
