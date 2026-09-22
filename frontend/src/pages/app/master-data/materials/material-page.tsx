import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeftIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import type { ApiMaterial, ApiMaterialUOM } from '@/lib/api-types';
import {
  createMaterialUOM,
  deleteMaterialUOM,
  getMaterial,
  updateMaterial,
  updateMaterialUOM,
  type UpsertMaterialUOMInput
} from '@/lib/endpoints';
import { useAuthStore } from '@/store/auth-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function MasterDataMaterialPage() {
  const { materialId } = useParams<{ materialId: string }>();
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const queryClient = useQueryClient();
  const enabled = !!token && !!organizationId && !!materialId;
  const queryKey = ['material', organizationId, materialId];

  const [editingHeader, setEditingHeader] = useState(false);
  const [uomDialog, setUomDialog] = useState<ApiMaterialUOM | 'new' | null>(null);

  const materialQuery = useQuery({
    queryKey,
    queryFn: () => getMaterial(token!, organizationId!, materialId!),
    enabled
  });

  const material = materialQuery.data;
  const uoms = material?.uoms ?? [];

  const updateMutation = useMutation({
    mutationFn: (input: { description?: string; base_unit?: string; ncm?: string; supplier_material_code?: string }) =>
      updateMaterial(token!, organizationId!, materialId!, input),
    onSuccess: () => {
      toast.success('Material atualizado');
      setEditingHeader(false);
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ['materials', organizationId] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível salvar o material.');
    }
  });

  const createUomMutation = useMutation({
    mutationFn: (input: UpsertMaterialUOMInput) => createMaterialUOM(token!, organizationId!, materialId!, input),
    onSuccess: () => {
      toast.success('Unidade alternativa cadastrada');
      setUomDialog(null);
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível cadastrar a unidade.');
    }
  });

  const updateUomMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpsertMaterialUOMInput }) =>
      updateMaterialUOM(token!, organizationId!, materialId!, id, input),
    onSuccess: () => {
      toast.success('Unidade atualizada');
      setUomDialog(null);
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível atualizar a unidade.');
    }
  });

  const deleteUomMutation = useMutation({
    mutationFn: (uomId: string) => deleteMaterialUOM(token!, organizationId!, materialId!, uomId),
    onSuccess: () => {
      toast.success('Unidade removida');
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível remover a unidade.');
    }
  });

  if (!enabled) {
    return <p className="text-muted-foreground text-sm">Nenhuma organização associada à sua conta no momento.</p>;
  }

  if (materialQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (materialQuery.isError || !material) {
    return (
      <p className="text-destructive text-sm">
        {materialQuery.error instanceof ApiError ? materialQuery.error.message : 'Material não encontrado.'}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" className="w-fit" asChild>
        <Link to="/app/master-data/materials">
          <ChevronLeftIcon />
          Materiais
        </Link>
      </Button>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="font-mono">{material.material_code}</CardTitle>
            <CardDescription>{material.description || 'Sem descrição'}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setEditingHeader(true)}>
            <PencilIcon />
            Editar
          </Button>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {material.base_unit && (
            <Badge variant="outline" className="font-mono">
              UMB {material.base_unit}
            </Badge>
          )}
          {material.ncm && (
            <Badge variant="outline" className="font-mono">
              NCM {material.ncm}
            </Badge>
          )}
          {material.supplier_material_code && (
            <Badge variant="secondary" className="font-mono font-normal">
              Forn. {material.supplier_material_code}
            </Badge>
          )}
          <Badge variant="outline">{material.source === 'manual' ? 'Manual' : 'XML / nota'}</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Unidades de medida</CardTitle>
            <CardDescription>
              De-para no padrão SAP: X unidade alternativa &lt;=&gt; Y unidade base. Use isso quando a UM do XML
              não existir no material no SAP.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setUomDialog('new')}>
            <PlusIcon />
            Adicionar UM
          </Button>
        </CardHeader>
        <CardContent>
          {uoms.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma unidade cadastrada para este material.</p>
          ) : (
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">X</TableHead>
                    <TableHead>UMA</TableHead>
                    <TableHead className="w-16 text-center">&lt;=&gt;</TableHead>
                    <TableHead className="w-24">Y</TableHead>
                    <TableHead>UMB</TableHead>
                    <TableHead className="w-28" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {uoms.map((uom) => (
                    <TableRow key={uom.id}>
                      <TableCell className="tabular-nums">{formatFactor(uom.numerator)}</TableCell>
                      <TableCell className="font-mono">{uom.alternative_unit}</TableCell>
                      <TableCell className="text-muted-foreground text-center">&lt;=&gt;</TableCell>
                      <TableCell className="tabular-nums">{formatFactor(uom.denominator)}</TableCell>
                      <TableCell className="font-mono">{uom.base_unit}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setUomDialog(uom)} aria-label="Editar">
                            <PencilIcon />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteUomMutation.mutate(uom.id)}
                            aria-label="Excluir"
                          >
                            <Trash2Icon />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <EditMaterialDialog
        open={editingHeader}
        onOpenChange={setEditingHeader}
        material={material}
        submitting={updateMutation.isPending}
        onSubmit={async (values) => {
          await updateMutation.mutateAsync(values);
        }}
      />

      <UomDialog
        open={uomDialog !== null}
        uom={uomDialog === 'new' || uomDialog === null ? null : uomDialog}
        baseUnit={material.base_unit ?? ''}
        submitting={createUomMutation.isPending || updateUomMutation.isPending}
        onOpenChange={(open) => {
          if (!open) setUomDialog(null);
        }}
        onSubmit={async (input) => {
          if (uomDialog && uomDialog !== 'new') {
            await updateUomMutation.mutateAsync({ id: uomDialog.id, input });
            return;
          }
          await createUomMutation.mutateAsync(input);
        }}
      />
    </div>
  );
}

function formatFactor(value: number) {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 6 });
}

function EditMaterialDialog({
  open,
  onOpenChange,
  material,
  submitting,
  onSubmit
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  material: ApiMaterial;
  submitting: boolean;
  onSubmit: (values: { description?: string; base_unit?: string; ncm?: string; supplier_material_code?: string }) => Promise<void>;
}) {
  const [description, setDescription] = useState(material.description ?? '');
  const [baseUnit, setBaseUnit] = useState(material.base_unit ?? '');
  const [ncm, setNcm] = useState(material.ncm ?? '');
  const [supplier, setSupplier] = useState(material.supplier_material_code ?? '');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar material {material.material_code}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
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
              />
            </div>
            <div>
              <Label>NCM</Label>
              <Input className="font-mono" value={ncm} onChange={(e) => setNcm(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Código do fornecedor</Label>
            <Input className="font-mono" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={submitting}
            onClick={() =>
              onSubmit({
                description,
                base_unit: baseUnit,
                ncm,
                supplier_material_code: supplier
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

function UomDialog({
  open,
  uom,
  baseUnit,
  submitting,
  onOpenChange,
  onSubmit
}: {
  open: boolean;
  uom: ApiMaterialUOM | null;
  baseUnit: string;
  submitting: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: UpsertMaterialUOMInput) => Promise<void>;
}) {
  const [alternativeUnit, setAlternativeUnit] = useState('');
  const [umb, setUmb] = useState(baseUnit);
  const [numerator, setNumerator] = useState('1');
  const [denominator, setDenominator] = useState('1');

  useEffect(() => {
    if (!open) return;
    setAlternativeUnit(uom?.alternative_unit ?? '');
    setUmb(uom?.base_unit || baseUnit);
    setNumerator(String(uom?.numerator ?? 1));
    setDenominator(String(uom?.denominator ?? 1));
  }, [open, uom, baseUnit]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{uom ? 'Editar unidade de medida' : 'Nova unidade de medida'}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
          <div className="grid gap-2">
            <Label>X / UMA</Label>
            <div className="flex gap-2">
              <Input
                className="tabular-nums"
                value={numerator}
                onChange={(e) => setNumerator(e.target.value)}
              />
              <Input
                className="font-mono uppercase"
                value={alternativeUnit}
                onChange={(e) => setAlternativeUnit(e.target.value.toUpperCase())}
                placeholder="PC"
              />
            </div>
          </div>
          <p className="text-muted-foreground pb-2 text-sm">&lt;=&gt;</p>
          <div className="grid gap-2">
            <Label>Y / UMB</Label>
            <div className="flex gap-2">
              <Input
                className="tabular-nums"
                value={denominator}
                onChange={(e) => setDenominator(e.target.value)}
              />
              <Input
                className="font-mono uppercase"
                value={umb}
                onChange={(e) => setUmb(e.target.value.toUpperCase())}
                placeholder="EA"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!alternativeUnit.trim() || submitting}
            onClick={() =>
              onSubmit({
                alternative_unit: alternativeUnit,
                base_unit: umb,
                numerator: Number(numerator.replace(',', '.')) || 0,
                denominator: Number(denominator.replace(',', '.')) || 0
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
