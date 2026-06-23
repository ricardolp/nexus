'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCnpj } from '../../lib/format';
import type { NfeDocumentListItem } from '../../api/types';

type DetailPartiesProps = {
  document: NfeDocumentListItem;
};

export function DetailParties({ document }: DetailPartiesProps) {
  return (
    <div className='grid gap-4 md:grid-cols-2'>
      <Card className='shadow-sm'>
        <CardHeader className='pb-2'>
          <CardTitle className='text-sm font-medium'>Emitente</CardTitle>
        </CardHeader>
        <CardContent className='text-sm'>
          <p className='font-medium'>{document.issuerName ?? '—'}</p>
          <p className='text-muted-foreground font-mono'>
            {formatCnpj(document.issuerCnpj)}
          </p>
        </CardContent>
      </Card>
      <Card className='shadow-sm'>
        <CardHeader className='pb-2'>
          <CardTitle className='text-sm font-medium'>Destinatário</CardTitle>
        </CardHeader>
        <CardContent className='text-sm'>
          <p className='font-medium'>{document.recipientName ?? '—'}</p>
          <p className='text-muted-foreground font-mono'>
            {formatCnpj(document.recipientDocument)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
