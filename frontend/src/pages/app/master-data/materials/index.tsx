import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PackageIcon, PlusIcon, SearchIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import { createMaterial, listMaterials, type UpsertMaterialInput } from '@/lib/endpoints';
import { useAuthStore } from '@/store/auth-store';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableSkeleton } from '@/components/data-table/data-table-skeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getMaterialColumns, materialPath } from './columns';

export default function MasterDataMaterialsPage() {
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  const enabled = !!token && !!organizationId;
  const queryKey = ['materials', organizationId, search];

  const materialsQuery = useQuery({
    queryKey,
    queryFn: () => listMaterials(token!, organizationId!, search),
    enabled
  });

  const createMutation = useMutation({
    mutationFn: (input: UpsertMaterialInput) => createMaterial(token!, organizationId!, input),
    onSuccess: (material) => {
      toast.success('Material cadastrado', { description: material.material_code });
      setCreating(false);
      void queryClient.invalidateQueries({ queryKey: ['materials', organizationId] });
      navigate(materialPath(material.id));
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível cadastrar o material.');
    }
  });

  const items = materialsQuery.data?.items ?? [];
  const columns = getMaterialColumns();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <PackageIcon className="size-5" />
            Materiais
          </CardTitle>
          <CardDescription>
            Cadastro preenchido automaticamente quando um XML ou nota de entrada é importado. Configure aqui o
            de-para de unidades de medida por material.
          </CardDescription>
        </div>
        <Button disabled={!enabled} onClick={() => setCreating(true)}>
          <PlusIcon />
          Novo material
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="relative max-w-sm">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            className="pl-8"
            placeholder="Busque por código, descrição ou NCM"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {!organizationId ? (
          <p className="text-muted-foreground text-sm">Nenhuma organização associada à sua conta no momento.</p>
        ) : materialsQuery.isLoading ? (
          <DataTableSkeleton columnCount={7} />
        ) : materialsQuery.isError ? (
          <p className="text-destructive text-sm">
            {materialsQuery.error instanceof ApiError
              ? materialsQuery.error.message
              : 'Não foi possível carregar os materiais.'}
          </p>
        ) : (
          <DataTable
            columns={columns}
            data={items}
            showSelectionCount={false}
            onRowClick={(material) => navigate(materialPath(material.id))}
          />
        )}
      </CardContent>

      <CreateMaterialDialog
        open={creating}
        onOpenChange={setCreating}
        submitting={createMutation.isPending}
        onSubmit={async (values) => {
          await createMutation.mutateAsync(values);
        }}
      />
    </Card>
  );
}

function CreateMaterialDialog({
  open,
  onOpenChange,
  submitting,
  onSubmit
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submitting: boolean;
  onSubmit: (values: UpsertMaterialInput) => Promise<void>;
}) {
  const [materialCode, setMaterialCode] = useState('');
  const [description, setDescription] = useState('');
  const [baseUnit, setBaseUnit] = useState('');
  const [ncm, setNcm] = useState('');

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setMaterialCode('');
          setDescription('');
          setBaseUnit('');
          setNcm('');
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo material</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Código do material</Label>
            <Input
              className="font-mono"
              value={materialCode}
              onChange={(e) => setMaterialCode(e.target.value)}
              placeholder="40349805"
            />
          </div>
          <div>
            <Label>Descrição</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Unidade base (UMB)</Label>
              <Input
                className="font-mono uppercase"
                value={baseUnit}
                onChange={(e) => setBaseUnit(e.target.value.toUpperCase())}
                placeholder="EA"
              />
            </div>
            <div>
              <Label>NCM</Label>
              <Input className="font-mono" value={ncm} onChange={(e) => setNcm(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!materialCode.trim() || submitting}
            onClick={() =>
              onSubmit({
                material_code: materialCode,
                description: description || undefined,
                base_unit: baseUnit || undefined,
                ncm: ncm || undefined
              })
            }
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
