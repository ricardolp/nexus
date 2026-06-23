'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import type { TestFlowResult } from '../api/types';

interface TestFlowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTest: (input: {
    accessKey?: string;
    purchaseOrder?: string;
  }) => Promise<TestFlowResult>;
  isLoading?: boolean;
}

export function TestFlowDialog({
  open,
  onOpenChange,
  onTest,
  isLoading,
}: TestFlowDialogProps) {
  const [accessKey, setAccessKey] = useState('');
  const [purchaseOrder, setPurchaseOrder] = useState('');
  const [result, setResult] = useState<TestFlowResult | null>(null);

  const handleTest = async () => {
    const res = await onTest({ accessKey, purchaseOrder });
    setResult(res);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-lg'>
        <DialogHeader>
          <DialogTitle>Testar fluxo</DialogTitle>
        </DialogHeader>
        <div className='space-y-4'>
          <div className='space-y-2'>
            <Label>Chave de acesso</Label>
            <Input
              value={accessKey}
              onChange={(e) => setAccessKey(e.target.value)}
              placeholder='352406...'
            />
          </div>
          <div className='space-y-2'>
            <Label>Pedido de compra</Label>
            <Input
              value={purchaseOrder}
              onChange={(e) => setPurchaseOrder(e.target.value)}
              placeholder='4500001234'
            />
          </div>
          {result && (
            <div className='space-y-2 rounded-lg border p-3'>
              <div className='text-sm font-medium'>
                Resultado:{' '}
                <Badge variant={result.success ? 'default' : 'destructive'}>
                  {result.success ? 'Sucesso' : 'Falha'}
                </Badge>
              </div>
              <ul className='space-y-1 text-xs'>
                {result.steps.map((step) => (
                  <li key={step.step} className='flex justify-between gap-2'>
                    <span>{step.step}</span>
                    <span className='text-muted-foreground'>{step.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            type='button'
            onClick={handleTest}
            disabled={isLoading}
          >
            Executar teste
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
