'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Icons } from '@/components/icons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { organizationCompanyCertificatesQueryOptions } from '../api/queries';
import type {
  OrganizationCompany,
  OrganizationCompanyCertificateStatus,
} from '../api/types';
import { CompanyCertificateUploadSheet } from './company-certificate-upload-sheet';

const statusLabels: Record<OrganizationCompanyCertificateStatus, string> = {
  active: 'Ativo',
  inactive: 'Inativo',
  expired: 'Expirado',
  revoked: 'Revogado',
};

const statusVariants: Record<
  OrganizationCompanyCertificateStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  active: 'default',
  inactive: 'secondary',
  expired: 'destructive',
  revoked: 'outline',
};

function formatDate(value: string | null) {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleDateString('pt-BR');
}

interface CompanyCertificatesModalProps {
  company: OrganizationCompany;
  organizationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CompanyCertificatesModal({
  company,
  organizationId,
  open,
  onOpenChange,
}: CompanyCertificatesModalProps) {
  const [uploadOpen, setUploadOpen] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    ...organizationCompanyCertificatesQueryOptions(organizationId, company.id),
    enabled: open && Boolean(organizationId),
  });

  return (
    <>
      <CompanyCertificateUploadSheet
        company={company}
        organizationId={organizationId}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onSuccess={() => {
          void refetch();
        }}
      />
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className='sm:max-w-4xl'>
          <DialogHeader>
            <div className='flex items-start justify-between gap-4 pr-8'>
              <div className='space-y-2'>
                <DialogTitle>Certificados digitais</DialogTitle>
                <DialogDescription>
                  Certificados vinculados à empresa {company.razaoSocial} ({company.cnpj}).
                </DialogDescription>
              </div>
              <Button type='button' size='sm' onClick={() => setUploadOpen(true)}>
                <Icons.upload className='mr-2 h-4 w-4' />
                Novo certificado
              </Button>
            </div>
          </DialogHeader>

        {isLoading && (
          <div className='text-muted-foreground flex items-center justify-center gap-2 py-10'>
            <Icons.spinner className='h-4 w-4 animate-spin' />
            Carregando certificados...
          </div>
        )}

        {isError && (
          <div className='text-destructive py-6 text-center text-sm'>
            {error instanceof Error ? error.message : 'Falha ao carregar certificados'}
          </div>
        )}

        {!isLoading && !isError && data?.items.length === 0 && (
          <div className='flex flex-col items-center gap-4 py-10 text-center'>
            <p className='text-muted-foreground text-sm'>
              Nenhum certificado digital cadastrado para esta empresa.
            </p>
            <Button type='button' variant='outline' onClick={() => setUploadOpen(true)}>
              <Icons.upload className='mr-2 h-4 w-4' />
              Enviar primeiro certificado
            </Button>
          </div>
        )}

        {!isLoading && !isError && data && data.items.length > 0 && (
          <div className='max-h-[28rem] overflow-auto rounded-md border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Validade</TableHead>
                  <TableHead>Assunto</TableHead>
                  <TableHead>Emissor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((certificate) => (
                  <TableRow key={certificate.id}>
                    <TableCell className='font-medium'>
                      {certificate.name ?? certificate.keyVaultCertName}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariants[certificate.status]}>
                        {statusLabels[certificate.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(certificate.expiresAt)}</TableCell>
                    <TableCell className='max-w-[14rem] truncate' title={certificate.subject ?? undefined}>
                      {certificate.subject ?? '—'}
                    </TableCell>
                    <TableCell className='max-w-[12rem] truncate' title={certificate.issuer ?? undefined}>
                      {certificate.issuer ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
