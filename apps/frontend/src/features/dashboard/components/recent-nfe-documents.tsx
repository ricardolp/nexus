'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSuspenseQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { nfeDocumentsListQueryOptions } from '@/features/nfe-documents/api/queries';
import { STATUS_INTERNO_LABELS } from '@/features/nfe-documents/constants/nfe-status-options';
import { formatCurrency, formatDate } from '@/features/nfe-documents/lib/format';
import { nfeDocumentDetailPath } from '@/features/nfe-documents/lib/paths';

interface RecentNfeDocumentsProps {
  organizationId: string;
}

export function RecentNfeDocuments({ organizationId }: RecentNfeDocumentsProps) {
  const { data } = useSuspenseQuery(
    nfeDocumentsListQueryOptions(organizationId, { page: 1, perPage: 5, direction: 'all' }),
  );

  return (
    <Card>
      <CardHeader className='flex flex-row items-start justify-between gap-4'>
        <div className='space-y-1'>
          <CardTitle>Notas recentes</CardTitle>
          <CardDescription>Últimas NF-e registradas na organização.</CardDescription>
        </div>
        <Button variant='outline' size='sm' asChild>
          <Link href='/dashboard/documents/nfe'>Ver todas</Link>
        </Button>
      </CardHeader>
      <CardContent className='space-y-3'>
        {data.items.length === 0 ? (
          <p className='text-muted-foreground text-sm'>Nenhuma nota fiscal encontrada.</p>
        ) : (
          data.items.map((document) => (
            <Link
              key={document.id}
              href={nfeDocumentDetailPath(document.id)}
              className='hover:bg-muted/50 flex items-center justify-between gap-4 rounded-lg border p-3 transition-colors'
            >
              <div className='min-w-0 space-y-1'>
                <div className='flex flex-wrap items-center gap-2'>
                  <span className='truncate font-medium'>
                    NF-e {document.number}
                    {document.series ? ` · Série ${document.series}` : ''}
                  </span>
                  {document.statusInterno && (
                    <Badge variant='outline' className='text-xs'>
                      {STATUS_INTERNO_LABELS[document.statusInterno]}
                    </Badge>
                  )}
                </div>
                <p className='text-muted-foreground truncate text-sm'>
                  {document.issuerName ?? document.issuerCnpj}
                </p>
              </div>
              <div className='shrink-0 text-right text-sm'>
                <div className='font-medium tabular-nums'>{formatCurrency(document.totalAmount)}</div>
                <div className='text-muted-foreground'>{formatDate(document.issuedAt ?? document.createdAt)}</div>
              </div>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export function RecentNfeDocumentsSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className='bg-muted h-6 w-40 animate-pulse rounded' />
        <div className='bg-muted mt-2 h-4 w-64 animate-pulse rounded' />
      </CardHeader>
      <CardContent className='space-y-3'>
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className='bg-muted h-16 animate-pulse rounded-lg' />
        ))}
      </CardContent>
    </Card>
  );
}
