'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '../../../lib/format';
import type { NfeDocumentAttachment } from '../../../api/types';

export function DetailAttachmentsTab({
  attachments,
}: {
  attachments: NfeDocumentAttachment[];
}) {
  if (attachments.length === 0) {
    return (
      <p className='text-muted-foreground py-8 text-center text-sm'>
        Nenhum anexo disponível.
      </p>
    );
  }

  return (
    <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
      {attachments.map((attachment) => (
        <Card key={attachment.id} className='shadow-sm'>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium'>
              {attachment.fileName ?? attachment.kind}
            </CardTitle>
            <Badge variant='secondary' className='w-fit text-xs'>
              {attachment.kind}
            </Badge>
          </CardHeader>
          <CardContent className='text-muted-foreground text-xs'>
            <p>{attachment.contentType ?? '—'}</p>
            <p className='mt-1'>{formatDateTime(attachment.createdAt)}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
