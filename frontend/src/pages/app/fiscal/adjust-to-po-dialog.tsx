import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2Icon, CheckIcon, PackageSearchIcon, SearchIcon, WrenchIcon } from 'lucide-react';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import {
  applyInboundOverride,
  patchInboundItem,
  reprocessInboundDocument,
  searchPurchaseOrders
} from '@/lib/endpoints';
import type { ApiInboundItem, ApiOrchestrationView, ApiPurchaseOrder, ApiPurchaseOrderItem } from '@/lib/api-types';
import { useAuthStore } from '@/store/auth-store';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { GradientDialogHeader } from '@/components/ui/gradient-dialog-header';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface AdjustToPoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  items: ApiInboundItem[];
  initialItemId?: string;
  vendorCnpj?: string;
  organizationCompanyId?: string;
  canReprocess?: boolean;
}

type DiffKey = 'po' | 'material' | 'quantity' | 'price';

interface FieldDiff {
  key: DiffKey;
  label: string;
  from: string;
  to: string;
}

function norm(v: string | null | undefined): string {
  return (v ?? '').trim();
}

function nearlyEqual(a: number, b: number, eps = 0.0001): boolean {
  return Math.abs(a - b) <= eps;
}

function money(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function computeDiffs(item: ApiInboundItem, po: ApiPurchaseOrder, line: ApiPurchaseOrderItem): FieldDiff[] {
  const diffs: FieldDiff[] = [];

  const nfPo = norm(item.purchase_order_reference_raw) || norm(item.resolved_purchase_order_number);
  const nfItem = norm(item.purchase_order_item_reference_raw) || norm(item.resolved_purchase_order_item);
  if (nfPo !== po.number || nfItem !== line.item_number) {
    diffs.push({
      key: 'po',
      label: 'Pedido e item',
      from: `${nfPo || '—'} / ${nfItem || '—'}`,
      to: `${po.number} / ${line.item_number}`
    });
  }

  const nfMaterial = norm(item.resolved_material_code);
  if (nfMaterial !== line.material_code) {
    diffs.push({
      key: 'material',
      label: 'Material SAP',
      from: nfMaterial || norm(item.supplier_material_code) || '—',
      to: line.material_code
    });
  }

  if (!nearlyEqual(item.quantity, line.quantity)) {
    diffs.push({
      key: 'quantity',
      label: 'Quantidade',
      from: `${item.quantity}${item.unit ? ` ${item.unit}` : ''}`,
      to: `${line.quantity}${line.unit ? ` ${line.unit}` : ''}`
    });
  }

  if (!nearlyEqual(item.unit_price, line.unit_price)) {
    diffs.push({
      key: 'price',
      label: 'Preço unitário',
      from: money(item.unit_price),
      to: money(line.unit_price)
    });
  }

  return diffs;
}

export function AdjustToPoDialog({
  open,
  onOpenChange,
  documentId,
  items,
  initialItemId,
  vendorCnpj,
  organizationCompanyId,
  canReprocess = true
}: AdjustToPoDialogProps) {
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const queryClient = useQueryClient();

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => a.item_number - b.item_number),
    [items]
  );

  const [itemId, setItemId] = useState(initialItemId ?? sortedItems[0]?.id ?? '');
  const item = sortedItems.find((i) => i.id === itemId) ?? sortedItems[0];

  const [poQuery, setPoQuery] = useState('');
  const [poVendorCnpj, setPoVendorCnpj] = useState(vendorCnpj ?? '');
  const [poResults, setPoResults] = useState<ApiPurchaseOrder[] | null>(null);
  const [selectedPO, setSelectedPO] = useState<ApiPurchaseOrder | null>(null);
  const [selectedLine, setSelectedLine] = useState<ApiPurchaseOrderItem | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<DiffKey>>(new Set());

  const diffs = useMemo(() => {
    if (!item || !selectedPO || !selectedLine) return [];
    return computeDiffs(item, selectedPO, selectedLine);
  }, [item, selectedPO, selectedLine]);

  useEffect(() => {
    // Only differing fields can be adjusted — auto-select all of them.
    setSelectedKeys(new Set(diffs.map((d) => d.key)));
  }, [diffs]);

  function toggleKey(key: DiffKey, on: boolean) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function selectLine(po: ApiPurchaseOrder, line: ApiPurchaseOrderItem) {
    setSelectedPO(po);
    setSelectedLine(line);
  }

  const searchMutation = useMutation({
    mutationFn: (vars: { po?: string; vendor?: string }) =>
      searchPurchaseOrders(token!, organizationId!, documentId, {
        purchaseOrder: vars.po?.trim() || undefined,
        vendorCnpj: vars.vendor?.trim() || undefined
      }),
    onSuccess: (result) => {
      setPoResults(result.items);
      setSelectedPO(null);
      setSelectedLine(null);

      // Auto-pick exact PO+item from the NF when present in results.
      if (!item) return;
      const wantPo = norm(item.purchase_order_reference_raw) || norm(item.resolved_purchase_order_number);
      const wantItem =
        norm(item.purchase_order_item_reference_raw) || norm(item.resolved_purchase_order_item);
      for (const po of result.items) {
        if (wantPo && po.number !== wantPo) continue;
        const line =
          po.items.find((l) => wantItem && l.item_number === wantItem) ??
          (result.items.length === 1 && po.items.length === 1 ? po.items[0] : undefined);
        if (line) {
          selectLine(po, line);
          return;
        }
      }
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível buscar pedidos no SAP.');
    }
  });

  useEffect(() => {
    if (!open) return;
    const start =
      sortedItems.find((i) => i.id === initialItemId) ??
      sortedItems.find((i) => i.status === 'NEEDS_CORRECTION' || i.status === 'BLOCKED') ??
      sortedItems[0];
    const startPo = start?.resolved_purchase_order_number || start?.purchase_order_reference_raw || '';
    const startCnpj = vendorCnpj ?? '';
    setItemId(start?.id ?? '');
    setPoQuery(startPo);
    setPoVendorCnpj(startCnpj);
    setPoResults(null);
    setSelectedPO(null);
    setSelectedLine(null);
    setSelectedKeys(new Set());

    // If this item's PO already resolved (matching succeeded — only some
    // other field like material is what's actually blocking), search it
    // immediately instead of making the user re-search a PO that already
    // matched. Surfaces just the real diff (e.g. only "Material SAP") right
    // away instead of a generic "search a pedido" empty state.
    if (start && startPo && startCnpj) {
      searchMutation.mutate({ po: startPo, vendor: startCnpj });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialItemId, sortedItems, vendorCnpj]);

  const applyMutation = useMutation({
    mutationFn: async (): Promise<ApiOrchestrationView | null> => {
      if (!item || !selectedPO || !selectedLine) {
        throw new Error('Selecione um pedido e uma linha do SAP.');
      }
      const apply = diffs.filter((d) => selectedKeys.has(d.key));
      if (apply.length === 0) {
        throw new Error('Nenhuma diferença selecionada para ajustar.');
      }

      const keys = new Set(apply.map((d) => d.key));
      const patch: {
        purchase_order_reference_raw?: string;
        purchase_order_item_reference_raw?: string;
        quantity?: number;
        unit_price?: number;
        unit?: string;
      } = {};

      if (keys.has('po')) {
        patch.purchase_order_reference_raw = selectedPO.number;
        patch.purchase_order_item_reference_raw = selectedLine.item_number;
      }
      if (keys.has('quantity')) {
        patch.quantity = selectedLine.quantity;
        if (selectedLine.unit) patch.unit = selectedLine.unit;
      }
      if (keys.has('price')) {
        patch.unit_price = selectedLine.unit_price;
      }

      if (Object.keys(patch).length > 0) {
        await patchInboundItem(token!, organizationId!, documentId, item.id, patch);
      }

      if (keys.has('material') && selectedLine.material_code) {
        await applyInboundOverride(token!, organizationId!, documentId, {
          item_id: item.id,
          override_type: 'MATERIAL',
          override_value: selectedLine.material_code,
          reason: `Ajuste ao pedido SAP ${selectedPO.number}/${selectedLine.item_number}`,
          save_as_mapping: true,
          organization_company_id: organizationCompanyId,
          vendor_cnpj: vendorCnpj
        });
      }

      // Also persist PO as override when patched, so rematch honors it even
      // if SAP search is briefly unavailable.
      if (keys.has('po')) {
        await applyInboundOverride(token!, organizationId!, documentId, {
          item_id: item.id,
          override_type: 'PURCHASE_ORDER',
          override_value: selectedPO.number,
          purchase_order_item: selectedLine.item_number,
          reason: `Ajuste ao pedido SAP ${selectedPO.number}/${selectedLine.item_number}`,
          organization_company_id: organizationCompanyId,
          vendor_cnpj: vendorCnpj
        });
      }

      if (!canReprocess) return null;
      return reprocessInboundDocument(token!, organizationId!, documentId);
    },
    onSuccess: (view) => {
      const steps = view?.steps ?? [];
      const planReady = !!view?.plan && steps.length > 0;
      const stillBlocked = !planReady && canReprocess;

      if (planReady) {
        toast.success('Validação aprovada', {
          description: `Plano de execução criado com ${steps.length} etapa(s). O documento pode seguir os passos.`
        });
      } else if (stillBlocked) {
        toast.warning('Ajuste aplicado, mas ainda há pendências', {
          description: 'Revalide os itens/validações — o plano ainda não foi liberado.'
        });
      } else {
        toast.success('Ajuste aplicado', {
          description: 'Dados alinhados ao pedido SAP.'
        });
      }

      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ['orchestration', organizationId, documentId] });
      queryClient.invalidateQueries({ queryKey: ['document-events', organizationId, documentId] });
      queryClient.invalidateQueries({ queryKey: ['fiscal-documents', organizationId] });
      queryClient.invalidateQueries({ queryKey: ['fiscal-document', organizationId, documentId] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Não foi possível aplicar o ajuste.');
    }
  });

  if (!item) {
    return null;
  }

  const canApply = !!selectedPO && !!selectedLine && selectedKeys.size > 0 && diffs.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <GradientDialogHeader
          icon={WrenchIcon}
          title="Ajustar ao pedido SAP"
          description="Só o que diverge da linha do pedido pode ser ajustado. Ao aplicar, a validação roda de novo e, se aprovar, o plano de execução segue."
        />

        <div className="flex flex-col gap-4 overflow-y-auto px-6 py-4">
          {sortedItems.length > 1 && (
            <div className="space-y-1">
              <Label>Item da nota</Label>
              <div className="flex flex-wrap gap-1.5">
                {sortedItems.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => {
                      setItemId(it.id);
                      setPoQuery(it.purchase_order_reference_raw ?? '');
                      setSelectedPO(null);
                      setSelectedLine(null);
                      setPoResults(null);
                    }}
                    className={cn(
                      'rounded-md border px-2.5 py-1 text-xs',
                      it.id === item.id ? 'border-primary bg-primary/10 font-medium' : 'border-border'
                    )}
                  >
                    Item {it.item_number}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <p className="font-medium">
              Item {item.item_number} · {item.description || item.supplier_material_code || 'sem descrição'}
            </p>
            <dl className="text-muted-foreground mt-2 grid gap-1 text-xs sm:grid-cols-2">
              <div>
                Pedido na NF:{' '}
                <span className="text-foreground font-mono">
                  {item.purchase_order_reference_raw ?? '—'}
                  {item.purchase_order_item_reference_raw
                    ? ` / ${item.purchase_order_item_reference_raw}`
                    : ''}
                </span>
              </div>
              <div>
                Material:{' '}
                <span className="text-foreground font-mono">
                  {item.resolved_material_code ?? item.supplier_material_code ?? '—'}
                </span>
              </div>
              <div>
                Qtd / preço:{' '}
                <span className="text-foreground">
                  {item.quantity} {item.unit ?? ''} · {money(item.unit_price)}
                </span>
              </div>
            </dl>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <Label>Nº do pedido (opcional)</Label>
                <Input
                  value={poQuery}
                  onChange={(e) => setPoQuery(e.target.value)}
                  placeholder="4504342368"
                />
              </div>
              <div className="flex-1 space-y-1">
                <Label>CNPJ do fornecedor</Label>
                <Input value={poVendorCnpj} onChange={(e) => setPoVendorCnpj(e.target.value)} />
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={searchMutation.isPending || !poVendorCnpj.trim()}
              onClick={() => searchMutation.mutate({ po: poQuery, vendor: poVendorCnpj })}
            >
              <SearchIcon />
              {searchMutation.isPending ? 'Buscando...' : 'Buscar pedidos no SAP'}
            </Button>
          </div>

          {poResults && poResults.length === 0 && (
            <div className="text-muted-foreground flex items-center gap-2 rounded-md border border-dashed p-3 text-sm">
              <PackageSearchIcon className="size-4 shrink-0" />
              Nenhum pedido encontrado para esse fornecedor.
            </div>
          )}

          {poResults && poResults.length > 0 && (
            <div className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-0.5">
              {poResults.map((po) => (
                <div key={po.number} className="rounded-md border">
                  <p className="bg-muted/30 rounded-t-md border-b px-2.5 py-1.5 text-xs font-medium">
                    Pedido <span className="font-mono">{po.number}</span>
                    <span className="text-muted-foreground font-normal"> · Fornecedor {po.vendor_code}</span>
                  </p>
                  <div className="flex flex-col gap-1 p-1.5">
                    {po.items.map((line) => {
                      const selected =
                        selectedPO?.number === po.number && selectedLine?.item_number === line.item_number;
                      return (
                        <button
                          key={`${po.number}-${line.item_number}`}
                          type="button"
                          onClick={() => selectLine(po, line)}
                          className={cn(
                            'flex items-start gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition-colors',
                            selected ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-muted/50'
                          )}
                        >
                          {selected ? (
                            <CheckCircle2Icon className="text-primary mt-0.5 size-3.5 shrink-0" />
                          ) : (
                            <span className="mt-0.5 size-3.5 shrink-0" />
                          )}
                          <span className="flex-1">
                            <span className="font-medium">Item {line.item_number}</span>
                            {' · '}
                            <span className="font-mono">{line.material_code}</span>
                            {' · '}
                            {line.description}
                            <span className="text-muted-foreground mt-0.5 block">
                              {line.quantity} {line.unit} · {money(line.unit_price)}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedPO && selectedLine && diffs.length === 0 && (
            <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
              <CheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              <div>
                <p className="font-medium text-emerald-700 dark:text-emerald-400">Já está alinhado</p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  Pedido, material, quantidade e preço da NF batem com a linha selecionada no SAP — nada a
                  ajustar.
                </p>
              </div>
            </div>
          )}

          {selectedPO && selectedLine && diffs.length > 0 && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="text-sm font-medium">Diferenças encontradas</p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Só estes campos podem ser ajustados. Desmarque o que não quiser alterar.
              </p>
              <div className="mt-3 flex flex-col gap-1.5">
                {diffs.map((diff) => (
                  <label
                    key={diff.key}
                    className={cn(
                      'flex items-start gap-2 rounded-md border px-2.5 py-2 text-sm transition-colors',
                      selectedKeys.has(diff.key) ? 'border-amber-500/40 bg-background' : 'border-transparent opacity-60'
                    )}
                  >
                    <Checkbox
                      checked={selectedKeys.has(diff.key)}
                      onCheckedChange={(v) => toggleKey(diff.key, v === true)}
                      className="mt-0.5"
                    />
                    <span>
                      {diff.label}
                      <span className="mt-0.5 flex flex-wrap items-center gap-1 text-xs">
                        <span className="text-muted-foreground line-through">{diff.from}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="text-foreground font-medium">{diff.to}</span>
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 pb-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={applyMutation.isPending || !canApply}
            onClick={() => applyMutation.mutate()}
          >
            <WrenchIcon />
            {applyMutation.isPending
              ? 'Aplicando e validando...'
              : canReprocess
                ? 'Aplicar e validar'
                : 'Aplicar ajuste'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
