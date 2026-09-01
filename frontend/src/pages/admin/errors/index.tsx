import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangleIcon } from 'lucide-react';

import { ApiError } from '@/lib/api';
import { listOrganizations, listPlatformErrors } from '@/lib/endpoints';
import { useAuthStore } from '@/store/auth-store';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';

const sourceLabels: Record<string, string> = {
  document_attempt: 'Tentativa fiscal',
  inbound_step: 'Orquestrador inbound',
  nfe_distribution_poll: 'Distribuição NF-e'
};

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
}

export default function AdminErrorsPage() {
  const token = useAuthStore((s) => s.token);
  const [organizationId, setOrganizationId] = useState<string>('all');
  const [source, setSource] = useState<string>('all');

  const orgsQuery = useQuery({
    queryKey: ['admin-organizations'],
    queryFn: () => listOrganizations(token!),
    enabled: !!token
  });

  const errorsQuery = useQuery({
    queryKey: ['admin-platform-errors', organizationId, source],
    queryFn: () =>
      listPlatformErrors(token!, {
        organization_id: organizationId === 'all' ? undefined : organizationId,
        source: source === 'all' ? undefined : source,
        limit: 50
      }),
    enabled: !!token
  });

  const items = errorsQuery.data?.items ?? [];
  const orgNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const org of orgsQuery.data?.items ?? []) {
      map.set(org.id, org.legal_name);
    }
    return map;
  }, [orgsQuery.data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangleIcon className="text-muted-foreground size-5" />
          Erros
        </CardTitle>
        <CardDescription>
          Visão unificada de erros em tentativas fiscais, steps do orquestrador inbound e polls de
          distribuição NF-e.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-3">
          <div className="w-full max-w-xs">
            <Select value={organizationId} onValueChange={setOrganizationId}>
              <SelectTrigger>
                <SelectValue placeholder="Organização" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as organizações</SelectItem>
                {(orgsQuery.data?.items ?? []).map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.legal_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full max-w-xs">
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger>
                <SelectValue placeholder="Origem" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as origens</SelectItem>
                <SelectItem value="document_attempt">Tentativa fiscal</SelectItem>
                <SelectItem value="inbound_step">Orquestrador inbound</SelectItem>
                <SelectItem value="nfe_distribution_poll">Distribuição NF-e</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {errorsQuery.isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : errorsQuery.isError ? (
          <p className="text-destructive text-sm">
            {errorsQuery.error instanceof ApiError
              ? errorsQuery.error.message
              : 'Não foi possível carregar os erros.'}
          </p>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhum erro encontrado com esses filtros.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Organização</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Mensagem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((err) => (
                <TableRow key={`${err.source}-${err.id}`}>
                  <TableCell className="whitespace-nowrap">{formatDateTime(err.occurred_at)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{sourceLabels[err.source] ?? err.source}</Badge>
                  </TableCell>
                  <TableCell>
                    <Link
                      to={`/admin/organizations/${err.organization_id}`}
                      className="text-primary hover:underline"
                    >
                      {orgNameById.get(err.organization_id) ?? err.organization_id.slice(0, 8)}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{err.error_code}</TableCell>
                  <TableCell
                    className="text-muted-foreground max-w-md truncate text-sm"
                    title={err.error_message}
                  >
                    {err.error_message || '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
