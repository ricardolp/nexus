import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { SearchIcon } from 'lucide-react';
import { toast } from 'sonner';

import { CatalogSearchField } from '@/components/catalog/catalog-search-field';
import { ApiError } from '@/lib/api';
import type { ApiCustomer } from '@/lib/api-types';
import { BRAZILIAN_STATES } from '@/lib/brazilian-states';
import { createCustomer, lookupCEP, lookupCNPJ, searchCatalogMunicipalities, updateCustomer } from '@/lib/endpoints';
import { useAuthStore } from '@/store/auth-store';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

function digits(value: string) {
  return value.replace(/\D/g, '');
}

export function CustomerFormDialog({
  open,
  onOpenChange,
  customer,
  submitLabel = 'Salvar',
  onSaved
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer?: ApiCustomer | null;
  submitLabel?: string;
  onSaved: (customer: ApiCustomer) => void;
}) {
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const editing = Boolean(customer?.id && !customer.from_history);

  const [docType, setDocType] = useState<'cnpj' | 'cpf'>('cnpj');
  const [doc, setDoc] = useState('');
  const [legalName, setLegalName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [district, setDistrict] = useState('');
  const [municipalityCode, setMunicipalityCode] = useState('');
  const [municipalityLabel, setMunicipalityLabel] = useState('');
  const [uf, setUf] = useState('');
  const [cep, setCep] = useState('');
  const [lookupStatus, setLookupStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const nextType = customer?.cpf ? 'cpf' : 'cnpj';
    setDocType(nextType);
    setDoc(customer?.cnpj ?? customer?.cpf ?? '');
    setLegalName(customer?.legal_name ?? '');
    setEmail(customer?.email ?? '');
    setPhone(customer?.phone ?? '');
    setStreet(customer?.street ?? '');
    setNumber(customer?.number ?? '');
    setDistrict(customer?.district ?? '');
    setMunicipalityCode(customer?.municipality_code ?? '');
    setMunicipalityLabel(customer?.municipality_code ?? '');
    setUf(customer?.uf ?? '');
    setCep(customer?.cep ?? '');
    setLookupStatus(null);
  }, [open, customer]);

  const lookupMutation = useMutation({
    mutationFn: () => lookupCNPJ(token!, organizationId!, doc),
    onSuccess: (data) => {
      setLegalName(data.legal_name || '');
      setEmail(data.email || '');
      setPhone(data.phone || '');
      setStreet(data.street || '');
      setNumber(data.number || '');
      setDistrict(data.district || '');
      setMunicipalityCode(data.municipality_code || '');
      setMunicipalityLabel(
        data.municipality_code
          ? `${data.municipality_code}${data.city ? ` — ${data.city}` : ''}${data.uf ? `/${data.uf}` : ''}`
          : ''
      );
      setUf(data.uf || '');
      setCep(data.cep || '');
      setLookupStatus(data.status || null);
      if (data.status && data.status.toLowerCase() !== 'ativa') {
        toast.message(`Situação cadastral: ${data.status}. Confira os dados antes de salvar.`);
      } else {
        toast.success('Dados do CNPJ preenchidos — confirme ou ajuste antes de salvar.');
      }
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Não foi possível consultar o CNPJ')
  });

  const cepMutation = useMutation({
    mutationFn: () => lookupCEP(token!, organizationId!, cep),
    onSuccess: (data) => {
      if (data.street) setStreet(data.street);
      if (data.district) setDistrict(data.district);
      if (data.uf) setUf(data.uf);
      if (data.municipality_code) {
        setMunicipalityCode(data.municipality_code);
        setMunicipalityLabel(`${data.municipality_code} — ${data.city}/${data.uf}`);
      }
      toast.success('Endereço preenchido pelo CEP — confirme ou ajuste.');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Não foi possível consultar o CEP')
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        ...(docType === 'cnpj' ? { cnpj: doc } : { cpf: doc }),
        legal_name: legalName,
        email: email || undefined,
        phone: phone || undefined,
        street: street || undefined,
        number: number || undefined,
        district: district || undefined,
        municipality_code: municipalityCode || undefined,
        uf: uf || undefined,
        cep: cep || undefined
      };
      if (editing && customer?.id) {
        return updateCustomer(token!, organizationId!, customer.id, payload);
      }
      return createCustomer(token!, organizationId!, payload);
    },
    onSuccess: (saved) => {
      toast.success(editing ? 'Parceiro atualizado' : 'Parceiro cadastrado');
      onOpenChange(false);
      onSaved(saved);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'customer_already_exists') {
        toast.error('Parceiro já cadastrado com este documento.');
        return;
      }
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível salvar');
    }
  });

  const canSave = useMemo(() => legalName.trim() && digits(doc).length >= 11, [legalName, doc]);
  const canLookup = docType === 'cnpj' && digits(doc).length === 14;
  const canLookupCEP = digits(cep).length === 8;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setLookupStatus(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar parceiro' : 'Novo parceiro'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Tipo</Label>
            <Select
              value={docType}
              disabled={editing}
              onValueChange={(v) => {
                setDocType(v as 'cnpj' | 'cpf');
                setLookupStatus(null);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cnpj">CNPJ</SelectItem>
                <SelectItem value="cpf">CPF</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{docType === 'cnpj' ? 'CNPJ' : 'CPF'}</Label>
            <div className="flex gap-2">
              <Input value={doc} disabled={editing} onChange={(e) => setDoc(e.target.value)} />
              {docType === 'cnpj' && !editing ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canLookup || lookupMutation.isPending}
                  onClick={() => lookupMutation.mutate()}
                >
                  {lookupMutation.isPending ? '…' : 'Buscar'}
                </Button>
              ) : null}
            </div>
          </div>
          {lookupStatus ? (
            <p className="text-muted-foreground sm:col-span-2 text-xs">
              Dados sugeridos pela Receita Federal. Situação: {lookupStatus}. Revise antes de salvar.
            </p>
          ) : null}
          <div className="sm:col-span-2">
            <Label>Razão social / Nome</Label>
            <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} />
          </div>
          <div>
            <Label>E-mail</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label>Telefone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <Label>CEP</Label>
            <div className="flex gap-2">
              <Input value={cep} onChange={(e) => setCep(e.target.value)} />
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={!canLookupCEP || cepMutation.isPending}
                onClick={() => cepMutation.mutate()}
                aria-label="Buscar CEP"
              >
                <SearchIcon />
              </Button>
            </div>
          </div>
          <div>
            <Label>UF</Label>
            <Select value={uf} onValueChange={setUf}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="UF" />
              </SelectTrigger>
              <SelectContent>
                {BRAZILIAN_STATES.map((s) => (
                  <SelectItem key={s.uf} value={s.uf}>
                    {s.uf}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Logradouro</Label>
            <Input value={street} onChange={(e) => setStreet(e.target.value)} />
          </div>
          <div>
            <Label>Número</Label>
            <Input value={number} onChange={(e) => setNumber(e.target.value)} />
          </div>
          <div>
            <Label>Bairro</Label>
            <Input value={district} onChange={(e) => setDistrict(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <CatalogSearchField
              label="Município (IBGE)"
              value={municipalityCode}
              displayValue={municipalityLabel || municipalityCode}
              placeholder="Busque por nome ou código IBGE"
              enabled={!!token && !!organizationId}
              queryKey={['catalog-muni', organizationId, uf]}
              queryFn={async (q) => {
                const res = await searchCatalogMunicipalities(token!, organizationId!, {
                  q,
                  uf: uf || undefined,
                  limit: 40
                });
                return res.items.map((m) => ({
                  value: m.code,
                  label: `${m.name} / ${m.uf}`,
                  hint: m.code
                }));
              }}
              onSelect={(opt) => {
                setMunicipalityCode(opt.value);
                setMunicipalityLabel(`${opt.value} — ${opt.label}`);
              }}
              onClear={() => {
                setMunicipalityCode('');
                setMunicipalityLabel('');
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={!canSave || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
