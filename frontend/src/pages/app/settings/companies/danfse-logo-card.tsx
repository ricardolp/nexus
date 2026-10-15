import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, PencilIcon, Trash2Icon, UploadIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import {
  type CompanyLogoKind,
  deleteCompanyLogo,
  getCompanyLogoBlob,
  updateCompanyDetails,
  uploadCompanyLogo
} from '@/lib/endpoints';
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

type LogoCardConfig = {
  title: string;
  description: string;
  switchLabel: string;
  sizeHint: string;
  savedToast: string;
  enabled: (c: ApiCompany) => boolean;
  hasLogo: (c: ApiCompany) => boolean;
  enabledPatch: (v: boolean) => { danfse_custom_logo_enabled?: boolean; danfe_custom_logo_enabled?: boolean };
};

const LOGO_CARDS: Record<CompanyLogoKind, LogoCardConfig> = {
  danfse: {
    title: 'DANFSe',
    description:
      'O PDF nacional usa a marca padrão da NFS-e. Ative a logo personalizada para imprimir a marca desta empresa no cabeçalho.',
    switchLabel: 'Logo personalizada na DANFSe?',
    sizeHint:
      'PNG ou JPEG, até 1 MB. O arquivo original é guardado e uma cópia é gerada no tamanho do cabeçalho da DANFSe (4,00 × 1,16 cm). O PDF usa essa cópia.',
    savedToast: 'DANFSe atualizada',
    enabled: (c) => Boolean(c.danfse_custom_logo_enabled),
    hasLogo: (c) => Boolean(c.has_danfse_logo),
    enabledPatch: (v) => ({ danfse_custom_logo_enabled: v })
  },
  danfe: {
    title: 'DANFE (NF-e)',
    description:
      'A DANFE gerada pelo Nexus (retrato e paisagem) traz só os dados do emitente. Ative a logo personalizada para imprimir a marca desta empresa no quadro do emitente.',
    switchLabel: 'Logo personalizada na DANFE?',
    sizeHint:
      'PNG ou JPEG, até 1 MB. O arquivo original é guardado e uma cópia é gerada no tamanho do quadro do emitente da DANFE (3,20 × 2,20 cm). O PDF usa essa cópia.',
    savedToast: 'DANFE atualizada',
    enabled: (c) => Boolean(c.danfe_custom_logo_enabled),
    hasLogo: (c) => Boolean(c.has_danfe_logo),
    enabledPatch: (v) => ({ danfe_custom_logo_enabled: v })
  }
};

export function CompanyDanfseLogoCard({ company }: { company: ApiCompany }) {
  return <CompanyLogoCard kind="danfse" company={company} />;
}

export function CompanyDanfeLogoCard({ company }: { company: ApiCompany }) {
  return <CompanyLogoCard kind="danfe" company={company} />;
}

function CompanyLogoCard({ kind, company }: { kind: CompanyLogoKind; company: ApiCompany }) {
  const cfg = LOGO_CARDS[kind];
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasLogo = cfg.hasLogo(company);

  const [editing, setEditing] = useState(false);
  const [enabled, setEnabled] = useState(cfg.enabled(company));
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [remotePreview, setRemotePreview] = useState<string | null>(null);

  const logoQuery = useQuery({
    queryKey: ['company-logo', kind, organizationId, company.id, company.updated_at],
    queryFn: () => getCompanyLogoBlob(kind, token!, organizationId!, company.id),
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
    setEnabled(cfg.enabled(company));
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
        ...cfg.enabledPatch(enabled)
      });
      if (logoFile) {
        await uploadCompanyLogo(kind, token!, organizationId!, company.id, logoFile);
      } else if (removeLogo && hasLogo) {
        await deleteCompanyLogo(kind, token!, organizationId!, company.id);
      }
    },
    onSuccess: () => {
      toast.success(cfg.savedToast);
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
  const switchId = `${kind}-custom-logo`;

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>{cfg.title}</CardTitle>
        <CardDescription>{cfg.description}</CardDescription>
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
            <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/20 px-4 py-3">
              <div>
                <Label htmlFor={switchId}>{cfg.switchLabel}</Label>
                <p className="text-muted-foreground text-xs">
                  A marca só entra no PDF quando esta opção está ligada e existe um arquivo enviado.
                </p>
              </div>
              <Switch id={switchId} checked={enabled} onCheckedChange={setEnabled} disabled={saving} />
            </div>
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
              <LogoPreview src={preview} alt={`Logo da ${cfg.title}`} />
              <p className="text-muted-foreground text-xs">{cfg.sizeHint}</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={saving}>
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
          </div>
        ) : (
          <>
            <FieldRow label={cfg.switchLabel} value={cfg.enabled(company) ? 'Sim' : 'Não'} />
            {hasLogo || cfg.enabled(company) ? (
              <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-muted-foreground text-sm">Logo</span>
                {hasLogo ? (
                  logoQuery.isError ? (
                    <span className="text-sm font-medium">Não foi possível carregar a logo</span>
                  ) : (
                    <LogoPreview src={remotePreview} alt={`Logo da ${cfg.title}`} emptyLabel="Carregando..." />
                  )
                ) : (
                  <span className="text-sm font-medium">Nenhuma logo enviada</span>
                )}
              </div>
            ) : null}
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
