import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileBadgeIcon, PencilIcon, PlusIcon, ShieldAlertIcon, UploadIcon } from 'lucide-react';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import { getActiveCertificate, listCertificates, revokeCertificate, uploadCertificate } from '@/lib/endpoints';
import type { ApiCertificate, ApiCompany } from '@/lib/api-types';
import { useAuthStore } from '@/store/auth-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { GradientDialogHeader } from '@/components/ui/gradient-dialog-header';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString('pt-BR') : '—';
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',').pop() ?? '');
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const certificateStatusLabels: Record<string, { label: string; className: string }> = {
  active: { label: 'Ativo', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  replaced: { label: 'Substituído', className: 'bg-slate-500/10 text-slate-600 dark:text-slate-400' },
  revoked: { label: 'Revogado', className: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  expired: { label: 'Expirado', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' }
};

function CertificateMeta({ certificate }: { certificate: ApiCertificate }) {
  return (
    <div className="text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
      <span>Emissor</span>
      <span className="text-right">{certificate.issuer_cn ?? '—'}</span>
      <span>Thumbprint</span>
      <span className="truncate text-right">{certificate.thumbprint}</span>
      <span>Validade</span>
      <span className="text-right">
        {formatDate(certificate.not_before)} — {formatDate(certificate.not_after)}
      </span>
    </div>
  );
}

export function CompanyCertificateTab({ company }: { company: ApiCompany }) {
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');

  const enabled = !!token && !!organizationId;
  const activeQueryKey = ['active-certificate', organizationId, company.id];
  const historyQueryKey = ['certificates', organizationId, company.id];

  const certificateQuery = useQuery({
    queryKey: activeQueryKey,
    queryFn: () => getActiveCertificate(token!, organizationId!, company.id),
    enabled,
    retry: false
  });

  const historyQuery = useQuery({
    queryKey: historyQueryKey,
    queryFn: () => listCertificates(token!, organizationId!, company.id),
    enabled
  });

  const activeCertificate =
    certificateQuery.error instanceof ApiError && certificateQuery.error.status === 404
      ? null
      : certificateQuery.data;

  const history = (historyQuery.data?.items ?? []).filter((item) => item.id !== activeCertificate?.id);

  function resetForm() {
    setFile(null);
    setPassword('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Selecione um arquivo .pfx/.p12');
      const base64 = await fileToBase64(file);
      return uploadCertificate(token!, organizationId!, company.id, base64, password);
    },
    onSuccess: () => {
      toast.success('Certificado enviado', { description: company.legal_name });
      resetForm();
      setDialogOpen(false);
      void queryClient.invalidateQueries({ queryKey: activeQueryKey });
      void queryClient.invalidateQueries({ queryKey: historyQueryKey });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível enviar o certificado.');
    }
  });

  const revokeMutation = useMutation({
    mutationFn: () => revokeCertificate(token!, organizationId!, company.id, activeCertificate!.id),
    onSuccess: () => {
      toast.success('Certificado revogado', { description: company.legal_name });
      void queryClient.invalidateQueries({ queryKey: activeQueryKey });
      void queryClient.invalidateQueries({ queryKey: historyQueryKey });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível revogar o certificado.');
    }
  });

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <FileBadgeIcon className="size-4" />
            Certificado ativo
          </CardTitle>
          <CardDescription>
            A1 (PKCS#12) usado para assinar NF-e e NFS-e desta empresa em produção e homologação.
          </CardDescription>
          {!certificateQuery.isLoading && (
            <CardAction>
              <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
                {activeCertificate ? <PencilIcon /> : <PlusIcon />}
                {activeCertificate ? 'Modificar' : 'Criar'}
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          {certificateQuery.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : certificateQuery.isError && !activeCertificate && certificateQuery.error instanceof ApiError && certificateQuery.error.status !== 404 ? (
            <p className="text-destructive text-sm">
              {certificateQuery.error.message}
            </p>
          ) : activeCertificate ? (
            <div className="flex flex-col gap-3 py-1">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{activeCertificate.subject_cn ?? 'Certificado ativo'}</span>
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  Ativo
                </Badge>
              </div>
              <CertificateMeta certificate={activeCertificate} />
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive mt-1 self-start"
                disabled={revokeMutation.isPending}
                onClick={() => revokeMutation.mutate()}
              >
                <ShieldAlertIcon />
                {revokeMutation.isPending ? 'Revogando...' : 'Revogar certificado'}
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground py-2 text-sm">Nenhum certificado ativo para esta empresa.</p>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) resetForm();
          setDialogOpen(open);
        }}
      >
        <DialogContent showCloseButton className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
          <GradientDialogHeader
            icon={FileBadgeIcon}
            title={activeCertificate ? 'Modificar certificado' : 'Criar certificado'}
            description="Arquivo .pfx ou .p12 e a senha. O CNPJ e a UF do certificado precisam bater com os desta empresa."
          />
          <div className="flex flex-col gap-4 px-6 py-4">
            <div className="grid gap-2">
              <Label htmlFor="certificate-file">Arquivo (.pfx/.p12)</Label>
              <Input
                id="certificate-file"
                ref={fileInputRef}
                type="file"
                accept=".pfx,.p12"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="certificate-password">Senha</Label>
              <Input
                id="certificate-password"
                type="password"
                placeholder="Senha do certificado"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="px-6 pb-6">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!file || !password || uploadMutation.isPending}
              onClick={() => uploadMutation.mutate()}
            >
              <UploadIcon />
              {uploadMutation.isPending ? 'Enviando...' : 'Enviar certificado'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {(historyQuery.isLoading || history.length > 0) && (
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Histórico</CardTitle>
            <CardDescription>Certificados anteriores desta empresa.</CardDescription>
          </CardHeader>
          <CardContent>
            {historyQuery.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <div className="flex flex-col divide-y">
                {history.map((item) => {
                  const status = certificateStatusLabels[item.status] ?? { label: item.status, className: '' };
                  return (
                    <div key={item.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium">{item.subject_cn ?? item.thumbprint}</span>
                        <Badge variant="outline" className={status.className}>
                          {status.label}
                        </Badge>
                      </div>
                      <CertificateMeta certificate={item} />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
