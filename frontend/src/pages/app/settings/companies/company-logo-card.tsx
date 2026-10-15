import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, PencilIcon, Trash2Icon, UploadIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import { deleteCompanyLogo, getCompanyLogoBlob, updateCompanyDetails, uploadCompanyLogo } from '@/lib/endpoints';
import type { ApiCompany } from '@/lib/api-types';
import { useAuthStore } from '@/store/auth-store';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { FieldRow } from '@/pages/organization/field-row';

const MAX_LOGO_BYTES = 1024 * 1024;

function isLogoFile(file: File) {
  return file.type === 'image/png' || file.type === 'image/jpeg' || file.type === 'image/jpg';
}

type LogoFlag = 'danfe_custom_logo_enabled' | 'danfse_custom_logo_enabled';

const LOGO_FLAGS: { key: LogoFlag; label: string; hint: string }[] = [
  {
    key: 'danfe_custom_logo_enabled',
    label: 'Usar na DANFE (NF-e)',
    hint: 'Quadro do emitente da DANFE gerada pelo Nexus, retrato e paisagem (até 3,20 × 2,20 cm).'
  },
  {
    key: 'danfse_custom_logo_enabled',
    label: 'Usar na DANFSe (NFS-e)',
    hint: 'Cabeçalho da DANFSe no lugar da marca nacional da NFS-e (até 4,00 × 1,16 cm).'
  }
];

export function CompanyLogoCard({ company }: { company: ApiCompany }) {
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasLogo = Boolean(company.has_logo);

  const storedFlags = (): Record<LogoFlag, boolean> => ({
    danfe_custom_logo_enabled: Boolean(company.danfe_custom_logo_enabled),
    danfse_custom_logo_enabled: Boolean(company.danfse_custom_logo_enabled)
  });

  const [editing, setEditing] = useState(false);
  const [flags, setFlags] = useState(storedFlags);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [remotePreview, setRemotePreview] = useState<string | null>(null);

  const logoQuery = useQuery({
    queryKey: ['company-logo', organizationId, company.id, company.updated_at],
    queryFn: () => getCompanyLogoBlob(token!, organizationId!, company.id),
    enabled: Boolean(token && organizationId && hasLogo)
  });

  useEffect(() => {
    if (!logoQuery.data) {
      setRemotePreview(null);
      return;
    }
    const url = URL.createObjectURL(logoQuery.data.blob);
    setRemotePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logoQuery.data]);

  useEffect(() => {
    if (!logoFile) {
      setLocalPreview(null);
      return;
    }
    const url = URL.createObjectURL(logoFile);
    setLocalPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  function resetDraft() {
    setFlags(storedFlags());
    setLogoFile(null);
    setRemoveLogo(false);
  }

  function startEdit() {
    resetDraft();
    setEditing(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      await updateCompanyDetails(token!, organizationId!, company.id, {
        legal_name: company.legal_name,
        trade_name: company.trade_name ?? '',
        uf: company.uf ?? '',
        environment: company.environment === 'production' ? 'production' : 'homologation',
        municipal_registration: company.municipal_registration ?? '',
        ibge_municipality_code: company.ibge_municipality_code ?? '',
        tax_regime: company.tax_regime ?? '',
        special_tax_regime: company.special_tax_regime ?? '',
        ...flags
      });
      if (logoFile) {
        await uploadCompanyLogo(token!, organizationId!, company.id, logoFile);
      } else if (removeLogo && hasLogo) {
        await deleteCompanyLogo(token!, organizationId!, company.id);
      }
    },
    onSuccess: () => {
      toast.success('Logo da empresa atualizada');
      setEditing(false);
      setLogoFile(null);
      setRemoveLogo(false);
      void queryClient.invalidateQueries({ queryKey: ['companies', organizationId] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Não foi possível salvar a logo')
  });

  function onPickFile(file: File | undefined) {
    if (!file) return;
    if (!isLogoFile(file)) {
      toast.error('Envie um arquivo PNG ou JPEG');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error('A logo deve ter no máximo 1 MB');
      return;
    }
    setLogoFile(file);
    setRemoveLogo(false);
  }

  const saving = saveMutation.isPending;
  const storedVisible = hasLogo && !removeLogo && !logoFile;
  const preview = localPreview ?? (storedVisible ? remotePreview : null);

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Logo da empresa</CardTitle>
        <CardDescription>
          Uma única imagem, impressa na DANFE e na DANFSe conforme as opções abaixo. Sem logo ou com a opção
          desligada, o PDF segue o padrão oficial.
        </CardDescription>
        <CardAction>
          {editing ? (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  resetDraft();
                  setEditing(false);
                }}
                disabled={saving}
              >
                <XIcon />
                Cancelar
              </Button>
              <Button type="button" size="sm" onClick={() => saveMutation.mutate()} disabled={saving}>
                <CheckIcon />
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={startEdit}>
              <PencilIcon />
              Editar
            </Button>
          )}
        </CardAction>
      </CardHeader>
      <CardContent>
        {editing ? (
          <div className="grid gap-4 py-2">
            <div className="grid gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={(e) => {
                  onPickFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <LogoPreview src={preview} alt="Logo da empresa" />
              <p className="text-muted-foreground text-xs">
                PNG ou JPEG, até 1 MB. O arquivo original é guardado e o sistema gera uma cópia no tamanho de cada
                documento; os PDFs usam essas cópias.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={saving}
                >
                  <UploadIcon />
                  {preview ? 'Trocar logo' : 'Enviar logo'}
                </Button>
                {(hasLogo || logoFile) && !removeLogo ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={saving}
                    onClick={() => {
                      setLogoFile(null);
                      setRemoveLogo(true);
                    }}
                  >
                    <Trash2Icon />
                    Remover
                  </Button>
                ) : null}
              </div>
            </div>
            {LOGO_FLAGS.map((flag) => (
              <div
                key={flag.key}
                className="flex items-center justify-between gap-4 rounded-lg border bg-muted/20 px-4 py-3"
              >
                <div>
                  <Label htmlFor={flag.key}>{flag.label}</Label>
                  <p className="text-muted-foreground text-xs">{flag.hint}</p>
                </div>
                <Switch
                  id={flag.key}
                  checked={flags[flag.key]}
                  onCheckedChange={(v) => setFlags((prev) => ({ ...prev, [flag.key]: v }))}
                  disabled={saving}
                />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-muted-foreground text-sm">Logo</span>
              {hasLogo ? (
                logoQuery.isError ? (
                  <span className="text-sm font-medium">Não foi possível carregar a logo</span>
                ) : (
                  <LogoPreview src={remotePreview} alt="Logo da empresa" emptyLabel="Carregando..." />
                )
              ) : (
                <span className="text-sm font-medium">Nenhuma logo enviada</span>
              )}
            </div>
            {LOGO_FLAGS.map((flag) => (
              <FieldRow key={flag.key} label={flag.label} value={company[flag.key] ? 'Sim' : 'Não'} />
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function LogoPreview({ src, alt, emptyLabel }: { src: string | null; alt: string; emptyLabel?: string }) {
  if (!src) {
    return emptyLabel ? <span className="text-sm font-medium">{emptyLabel}</span> : null;
  }
  return <img src={src} alt={alt} className="bg-muted h-14 max-w-56 rounded-md border object-contain p-1" />;
}
