import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, PencilIcon, Trash2Icon, UploadIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import { deleteOrganizationLogo, getOrganizationLogoBlob, uploadOrganizationLogo } from '@/lib/endpoints';
import type { ApiOrganization } from '@/lib/api-types';
import { useAuthStore } from '@/store/auth-store';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const MAX_LOGO_BYTES = 1024 * 1024;

function isLogoFile(file: File) {
  return file.type === 'image/png' || file.type === 'image/jpeg' || file.type === 'image/jpg';
}

export function OrganizationLogoCard({
  organization,
  canEdit
}: {
  organization: ApiOrganization;
  canEdit: boolean;
}) {
  const token = useAuthStore((s) => s.token);
  const setOrganization = useAuthStore((s) => s.setOrganization);
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasLogo = Boolean(organization.has_logo);

  const [editing, setEditing] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [remotePreview, setRemotePreview] = useState<string | null>(null);

  const logoQuery = useQuery({
    queryKey: ['organization-logo', organization.id, organization.updated_at],
    queryFn: () => getOrganizationLogoBlob(token!, organization.id),
    enabled: Boolean(token && hasLogo)
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
    setLogoFile(null);
    setRemoveLogo(false);
  }

  function startEdit() {
    resetDraft();
    setEditing(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (logoFile) {
        return uploadOrganizationLogo(token!, organization.id, logoFile);
      }
      if (removeLogo && hasLogo) {
        return deleteOrganizationLogo(token!, organization.id);
      }
      return organization;
    },
    onSuccess: (updated) => {
      setOrganization(updated);
      toast.success('Logo da organização atualizada');
      setEditing(false);
      resetDraft();
      void queryClient.invalidateQueries({ queryKey: ['organization', organization.id] });
      void queryClient.invalidateQueries({ queryKey: ['organization-logo', organization.id] });
      void queryClient.invalidateQueries({ queryKey: ['my-organizations'] });
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
  const dirty = Boolean(logoFile) || (removeLogo && hasLogo);

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Logo</CardTitle>
        <CardDescription>
          Marca exibida no seletor de organização e no cabeçalho desta página. Não substitui a logo da empresa
          usada na DANFE/DANFSe.
        </CardDescription>
        <CardAction>
          {canEdit ? (
            editing ? (
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
                <Button
                  type="button"
                  size="sm"
                  onClick={() => saveMutation.mutate()}
                  disabled={saving || !dirty}
                >
                  <CheckIcon />
                  {saving ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={startEdit}>
                <PencilIcon />
                Editar
              </Button>
            )
          ) : null}
        </CardAction>
      </CardHeader>
      <CardContent>
        {editing ? (
          <div className="grid gap-3 py-2">
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
            <LogoPreview src={preview} alt="Logo da organização" />
            <p className="text-muted-foreground text-xs">PNG ou JPEG, até 1 MB. Quadrado funciona melhor no seletor.</p>
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
        ) : (
          <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-muted-foreground text-sm">Logo</span>
            {hasLogo ? (
              logoQuery.isError ? (
                <span className="text-sm font-medium">Não foi possível carregar a logo</span>
              ) : (
                <LogoPreview src={remotePreview} alt="Logo da organização" emptyLabel="Carregando..." />
              )
            ) : (
              <span className="text-sm font-medium">Nenhuma logo enviada</span>
            )}
          </div>
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
