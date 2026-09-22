import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronLeftIcon, PlusIcon, SearchIcon, UserRoundXIcon } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import type { ApiCustomer } from '@/lib/api-types';
import { createCustomer, listCustomers } from '@/lib/endpoints';
import { useAuthStore } from '@/store/auth-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CustomerFormDialog } from '@/pages/app/master-data/partners/customer-form-dialog';

function formatDoc(c: ApiCustomer) {
  if (c.cnpj) return c.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (c.cpf) return c.cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return c.nif ?? '—';
}

function customerKey(c: ApiCustomer) {
  return c.id ?? `hist:${c.cnpj ?? c.cpf ?? c.nif ?? c.legal_name}`;
}

export default function NFSeSaidaNovaPage() {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  const customersQuery = useQuery({
    queryKey: ['customers', organizationId, search],
    queryFn: () => listCustomers(token!, organizationId!, search),
    enabled: !!token && !!organizationId
  });

  const items = customersQuery.data?.items ?? [];

  async function goEmit(customerId: string | null, anonymous = false) {
    const params = new URLSearchParams();
    if (anonymous) params.set('anonymous', '1');
    else if (customerId) params.set('customerId', customerId);
    navigate(`/app/nfse/saida/nova/emitir?${params.toString()}`);
  }

  const selectMutation = useMutation({
    mutationFn: async (customer: ApiCustomer) => {
      if (customer.id && !customer.from_history) {
        return customer.id;
      }
      const created = await createCustomer(token!, organizationId!, {
        cpf: customer.cpf ?? undefined,
        cnpj: customer.cnpj ?? undefined,
        nif: customer.nif ?? undefined,
        legal_name: customer.legal_name,
        email: customer.email ?? undefined,
        phone: customer.phone ?? undefined,
        municipal_registration: customer.municipal_registration ?? undefined,
        street: customer.street ?? undefined,
        street_type: customer.street_type ?? undefined,
        number: customer.number ?? undefined,
        complement: customer.complement ?? undefined,
        district: customer.district ?? undefined,
        municipality_code: customer.municipality_code ?? undefined,
        uf: customer.uf ?? undefined,
        cep: customer.cep ?? undefined
      });
      return created.id!;
    },
    onSuccess: (id) => goEmit(id),
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'customer_already_exists') {
        toast.error('Cliente já cadastrado — busque pelo documento e selecione.');
        return;
      }
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível usar este cliente');
    }
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Button variant="ghost" size="sm" className="w-fit" asChild>
        <Link to="/app/nfse/saida">
          <ChevronLeftIcon />
          Notas fiscais
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Selecione o cliente</CardTitle>
          <CardDescription>
            Tomadores cadastrados na organização (compartilhados entre CNPJs), incluindo histórico de NFS-e já
            emitidas.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full flex-1">
              <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                className="pl-8"
                placeholder="Busque pelo nome, e-mail, CPF ou CNPJ"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() =>
                  toast.message('No Portal Nacional o tomador (CPF/CNPJ/NIF) é obrigatório. Cadastre ou selecione um cliente.')
                }
              >
                <UserRoundXIcon />
                Não informar cliente
              </Button>
              <Button onClick={() => setDialogOpen(true)}>
                <PlusIcon />
                Novo Cliente
              </Button>
            </div>
          </div>

          {customersQuery.isLoading ? (
            <p className="text-muted-foreground text-sm">Carregando clientes…</p>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum cliente encontrado.</p>
          ) : (
            <ul className="divide-border divide-y rounded-lg border">
              {items.map((c) => (
                <li key={customerKey(c)}>
                  <button
                    type="button"
                    className="hover:bg-muted/50 flex w-full flex-col gap-1 px-4 py-3 text-left sm:flex-row sm:items-center sm:justify-between"
                    onClick={() => selectMutation.mutate(c)}
                    disabled={selectMutation.isPending}
                  >
                    <span className="font-medium">{c.legal_name}</span>
                    <span className="text-muted-foreground text-sm sm:w-44 sm:text-center">{formatDoc(c)}</span>
                    <span className="text-muted-foreground text-sm sm:w-56 sm:truncate sm:text-right">
                      {c.email || 'e-mail não informado'}
                      {c.from_history ? ' · histórico' : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <CustomerFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        submitLabel="Salvar e continuar"
        onSaved={(customer) => goEmit(customer.id!)}
      />
    </div>
  );
}
