import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { PlusIcon, SearchIcon } from 'lucide-react';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import { createOrganization, listOrganizations } from '@/lib/endpoints';
import { formatCNPJ } from '@/pages/app/settings/companies/columns';
import { useAuthStore } from '@/store/auth-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';

const statusLabels: Record<string, string> = {
  active: 'Ativa',
  suspended: 'Suspensa',
  inactive: 'Inativa'
};

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

const createSchema = z.object({
  legal_name: z.string().trim().min(2, 'Informe a razão social'),
  trade_name: z.string().trim().optional(),
  slug: z
    .string()
    .trim()
    .min(2, 'Informe o slug')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use apenas letras minúsculas, números e hífens'),
  tax_identifier: z.string().trim().optional()
});

type CreateFormValues = z.infer<typeof createSchema>;

export default function AdminOrganizationsPage() {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);

  const form = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { legal_name: '', trade_name: '', slug: '', tax_identifier: '' }
  });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-organizations'],
    queryFn: () => listOrganizations(token!),
    enabled: !!token
  });

  const createMutation = useMutation({
    mutationFn: (values: CreateFormValues) =>
      createOrganization(token!, {
        legal_name: values.legal_name,
        trade_name: values.trade_name || undefined,
        slug: values.slug,
        tax_identifier: values.tax_identifier || undefined
      }),
    onSuccess: (org) => {
      toast.success('Organização criada', { description: org.legal_name });
      setSheetOpen(false);
      form.reset({ legal_name: '', trade_name: '', slug: '', tax_identifier: '' });
      queryClient.invalidateQueries({ queryKey: ['admin-organizations'] });
      queryClient.invalidateQueries({ queryKey: ['organizations-usage'] });
      queryClient.invalidateQueries({ queryKey: ['my-organizations'] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível criar a organização.');
    }
  });

  const items = data?.items ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (org) =>
        org.legal_name.toLowerCase().includes(q) ||
        (org.trade_name ?? '').toLowerCase().includes(q) ||
        org.slug.toLowerCase().includes(q) ||
        (org.tax_identifier ?? '').includes(q.replace(/\D/g, ''))
    );
  }, [items, search]);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <CardTitle>Organizações</CardTitle>
            <CardDescription>
              Gerencie tenants da plataforma, crie novos e vincule a equipe de suporte.
            </CardDescription>
          </div>
          <Button
            onClick={() => {
              form.reset({ legal_name: '', trade_name: '', slug: '', tax_identifier: '' });
              setSheetOpen(true);
            }}
          >
            <PlusIcon />
            Nova organização
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="relative max-w-sm">
            <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              className="pl-9"
              placeholder="Buscar por nome, slug ou CNPJ"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : isError ? (
            <p className="text-destructive text-sm">
              {error instanceof ApiError ? error.message : 'Não foi possível carregar as organizações.'}
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma organização encontrada.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organização</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((org) => (
                  <TableRow key={org.id} className="hover:bg-muted/50">
                    <TableCell className="font-medium">
                      <Link
                        to={`/admin/organizations/${org.id}`}
                        className="text-primary hover:underline"
                      >
                        {org.trade_name || org.legal_name}
                      </Link>
                      {org.trade_name ? (
                        <div className="text-muted-foreground text-xs">{org.legal_name}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{org.slug}</TableCell>
                    <TableCell className="tabular-nums">
                      {org.tax_identifier ? formatCNPJ(org.tax_identifier) : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{statusLabels[org.status] ?? org.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" asChild>
                        <Link to={`/admin/organizations/${org.id}`}>Abrir</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Nova organização</SheetTitle>
            <SheetDescription>
              Você será vinculado como administrador do tenant e poderá entrar para o setup inicial.
            </SheetDescription>
          </SheetHeader>
          <Form {...form}>
            <form
              onSubmit={(event) => {
                form.handleSubmit((values) => createMutation.mutateAsync(values))(event)?.catch(
                  () => {}
                );
              }}
              className="flex flex-1 flex-col gap-4 overflow-y-auto px-4"
            >
              <FormField
                control={form.control}
                name="legal_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Razão social</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Empresa Exemplo Ltda"
                        {...field}
                        onChange={(e) => {
                          field.onChange(e);
                          const currentSlug = form.getValues('slug');
                          const auto = slugify(e.target.value);
                          if (!currentSlug || currentSlug === slugify(field.value)) {
                            form.setValue('slug', auto, { shouldValidate: true });
                          }
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="trade_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome fantasia</FormLabel>
                    <FormControl>
                      <Input placeholder="Exemplo" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Slug</FormLabel>
                    <FormControl>
                      <Input placeholder="exemplo" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tax_identifier"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CNPJ (opcional)</FormLabel>
                    <FormControl>
                      <Input placeholder="00.000.000/0000-00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <SheetFooter>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Criando...' : 'Criar organização'}
                </Button>
              </SheetFooter>
            </form>
          </Form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
