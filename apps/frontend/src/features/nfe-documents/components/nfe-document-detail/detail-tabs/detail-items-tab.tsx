'use client';

import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency } from '../../../lib/format';
import type { NfeDocumentItem } from '../../../api/types';

export function DetailItemsTab({ items }: { items: NfeDocumentItem[] }) {
  if (items.length === 0) {
    return (
      <p className='text-muted-foreground py-8 text-center text-sm'>
        Nenhum item encontrado.
      </p>
    );
  }

  const statusVariant = (status: NfeDocumentItem['pedidoValidationStatus']) => {
    if (status === 'matched') return 'default';
    if (status === 'alert') return 'destructive';
    return 'secondary';
  };

  return (
    <div className='rounded-lg border'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Produto</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead>Qtd</TableHead>
            <TableHead>Valor</TableHead>
            <TableHead>xPed</TableHead>
            <TableHead>nItemPed</TableHead>
            <TableHead>Pedido SAP</TableHead>
            <TableHead>Validação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{item.lineNumber}</TableCell>
              <TableCell className='font-mono text-xs'>
                {item.prodCodigo ?? '—'}
              </TableCell>
              <TableCell className='max-w-[200px] truncate'>
                {item.descricao ?? '—'}
              </TableCell>
              <TableCell>{item.qty ?? '—'}</TableCell>
              <TableCell>{formatCurrency(item.valorTotal)}</TableCell>
              <TableCell>{item.xPed ?? '—'}</TableCell>
              <TableCell>{item.nItemPed ?? '—'}</TableCell>
              <TableCell className='font-mono text-xs'>
                {item.sapOrderNumber
                  ? `${item.sapOrderNumber}/${item.sapOrderItem ?? ''}`
                  : '—'}
              </TableCell>
              <TableCell>
                <Badge variant={statusVariant(item.pedidoValidationStatus)}>
                  {item.pedidoValidationStatus}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
