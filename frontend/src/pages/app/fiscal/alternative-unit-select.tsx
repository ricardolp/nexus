import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import type { ApiInboundItem } from '@/lib/api-types';
import { listMaterials, setInboundItemAlternativeUnit } from '@/lib/endpoints';
import { useAuthStore } from '@/store/auth-store';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { materialPath } from '@/pages/app/master-data/materials/columns';
import { formatQuantity } from './format';

export function AlternativeUnitSelect({
  item,
  documentId
}: {
  item: ApiInboundItem;
  documentId: string;
}) {
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const queryClient = useQueryClient();
  const code = item.resolved_material_code || item.supplier_material_code || '';
  const xmlUnit = (item.unit ?? '').trim().toUpperCase();

  const materialQuery = useQuery({
    queryKey: ['materials', organizationId, 'code', code],
    queryFn: () => listMaterials(token!, organizationId!, undefined, code),
    enabled: !!token && !!organizationId && !!code
  });

  const material = materialQuery.data?.items[0];
  const units = Array.from(
    new Set(
      [
        xmlUnit,
        material?.base_unit?.toUpperCase(),
        ...(material?.uoms ?? []).map((u) => u.alternative_unit.toUpperCase())
      ].filter((u): u is string => Boolean(u))
    )
  );

  const selected = (item.alternative_unit || item.unit || '').toUpperCase();

  const mutation = useMutation({
    mutationFn: (unit: string) =>
      setInboundItemAlternativeUnit(token!, organizationId!, documentId, item.id, unit === xmlUnit ? '' : unit),
    onSuccess: () => {
      toast.success('Unidade alternativa atualizada');
      void queryClient.invalidateQueries({ queryKey: ['orchestration', organizationId, documentId] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível aplicar a unidade alternativa.');
    }
  });

  if (!code) return null;

  return (
    <div className="bg-muted/40 mt-3 rounded-md border p-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-[12rem] flex-1">
          <Label className="text-xs">Unidade de medida alternativa</Label>
          <Select
            value={selected || undefined}
            onValueChange={(value) => mutation.mutate(value)}
            disabled={mutation.isPending || units.length === 0}
          >
            <SelectTrigger className="mt-1">
              <SelectValue placeholder={xmlUnit || 'Selecione a UM'} />
            </SelectTrigger>
            <SelectContent>
              {units.map((unit) => (
                <SelectItem key={unit} value={unit}>
                  {unit}
                  {unit === xmlUnit ? ' (XML)' : ''}
                  {material?.base_unit && unit === material.base_unit.toUpperCase() ? ' (UMB)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to={material ? materialPath(material.id) : '/app/master-data/materials'}>
            {material ? 'Cadastrar UM' : 'Abrir materiais'}
          </Link>
        </Button>
      </div>
      {item.alternative_unit && item.alternative_quantity != null && (
        <p className="text-muted-foreground mt-2 text-xs tabular-nums">
          Envio ao SAP: {formatQuantity(item.alternative_quantity)} {item.alternative_unit}
          {xmlUnit ? ` · XML ${formatQuantity(item.quantity)} ${xmlUnit}` : ''}
        </p>
      )}
      {materialQuery.isSuccess && units.length <= 1 && (
        <p className="text-muted-foreground mt-2 text-xs">
          Cadastre o de-para deste material (ex.: 1 PC &lt;=&gt; 1 EA) para converter a unidade do XML.
        </p>
      )}
    </div>
  );
}
