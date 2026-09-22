import { useCallback, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckIcon,
  CircleAlertIcon,
  FileUpIcon,
  LoaderCircleIcon,
  UploadIcon,
  XIcon
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import { listCompanies, uploadFiscalDocumentXML } from '@/lib/endpoints';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth-store';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { GradientDialogHeader } from '@/components/ui/gradient-dialog-header';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

const AUTO_COMPANY = 'auto';
const MAX_XML_FILES = 50;

type ItemStatus = 'pending' | 'uploading' | 'success' | 'exists' | 'invalid' | 'skipped' | 'error';

interface UploadItem {
  id: string;
  file: File;
  accessKey: string | null;
  status: ItemStatus;
  message?: string;
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

function sameFile(a: File, b: File) {
  return a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
}

export function extractNFeAccessKey(xml: string): string | null {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) return null;
  const inf = doc.getElementsByTagName('infNFe')[0];
  const id = inf?.getAttribute('Id')?.trim() ?? '';
  const key = id.replace(/^NFe/, '').trim();
  return key || null;
}

function formatAccessKey(key: string) {
  if (key.length <= 16) return key;
  return `${key.slice(0, 8)}…${key.slice(-8)}`;
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.max(0.1, n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function reconcileItems(items: UploadItem[]): UploadItem[] {
  const seen = new Set<string>();
  return items.map((item) => {
    if (
      item.status === 'uploading' ||
      item.status === 'success' ||
      item.status === 'exists' ||
      item.status === 'error'
    ) {
      if (item.accessKey) seen.add(item.accessKey);
      return item;
    }
    if (!item.accessKey) {
      return { ...item, status: 'invalid', message: 'XML inválido ou sem chave de acesso (infNFe).' };
    }
    if (seen.has(item.accessKey)) {
      return { ...item, status: 'skipped', message: 'Chave duplicada na seleção.' };
    }
    seen.add(item.accessKey);
    return { ...item, status: 'pending', message: undefined };
  });
}

function uploadErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Não foi possível importar o XML.';
  switch (err.code) {
    case 'duplicate_access_key':
      return 'Já existe um documento com esta chave de acesso.';
    case 'invalid_xml':
      return 'O arquivo não é um XML de NF-e válido.';
    case 'document_service_disabled':
      return 'O serviço de NF-e de entrada não está habilitado para esta empresa.';
    default:
      return err.message || 'Não foi possível importar o XML.';
  }
}

function statusIcon(status: ItemStatus) {
  switch (status) {
    case 'uploading':
      return <LoaderCircleIcon className="text-muted-foreground size-4 shrink-0 animate-spin" />;
    case 'success':
      return <CheckIcon className="size-4 shrink-0 text-emerald-600" />;
    case 'exists':
    case 'skipped':
      return <CircleAlertIcon className="size-4 shrink-0 text-amber-600" />;
    case 'invalid':
    case 'error':
      return <CircleAlertIcon className="text-destructive size-4 shrink-0" />;
    default:
      return <FileUpIcon className="text-muted-foreground size-4 shrink-0" />;
  }
}

interface XMLUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function XMLUploadDialog({ open, onOpenChange }: XMLUploadDialogProps) {
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const queryClient = useQueryClient();
  const itemsRef = useRef<UploadItem[]>([]);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [companyId, setCompanyId] = useState(AUTO_COMPANY);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const companiesQuery = useQuery({
    queryKey: ['companies', organizationId],
    queryFn: () => listCompanies(token!, organizationId!),
    enabled: open && !!token && !!organizationId
  });
  const companies = companiesQuery.data?.items ?? [];

  function resetForm() {
    itemsRef.current = [];
    setItems([]);
    setCompanyId(AUTO_COMPANY);
    setUploading(false);
    setProgress({ current: 0, total: 0 });
  }

  const updateItems = useCallback((next: UploadItem[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const addFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      const current = itemsRef.current;
      const unique = files.filter((file) => !current.some((item) => sameFile(item.file, file)));
      if (!unique.length) return;
      const remaining = MAX_XML_FILES - current.length;
      if (remaining <= 0) {
        toast.error(`Selecione no máximo ${MAX_XML_FILES} XMLs por vez.`);
        return;
      }
      const incoming = unique.slice(0, remaining);
      if (incoming.length < unique.length) {
        toast.warning(`Apenas os primeiros ${MAX_XML_FILES} arquivos foram adicionados.`);
      }
      const built: UploadItem[] = [];
      for (const file of incoming) {
        const text = await file.text();
        built.push({
          id: crypto.randomUUID(),
          file,
          accessKey: extractNFeAccessKey(text),
          status: 'pending'
        });
      }
      updateItems(reconcileItems([...current, ...built]));
    },
    [updateItems]
  );

  const { getRootProps, getInputProps, isDragActive, open: openFilePicker } = useDropzone({
    onDrop: (accepted, rejected) => {
      if (rejected.length) {
        toast.error('Apenas arquivos .xml são aceitos.');
      }
      void addFiles(accepted);
    },
    accept: {
      'text/xml': ['.xml'],
      'application/xml': ['.xml']
    },
    multiple: true,
    disabled: uploading,
    noClick: true,
    noKeyboard: true
  });

  function removeItem(id: string) {
    if (uploading) return;
    updateItems(reconcileItems(itemsRef.current.filter((item) => item.id !== id)));
  }

  const sendable = items.filter((item) => item.status === 'pending' || item.status === 'error');

  async function handleUpload() {
    if (!token || !organizationId || !sendable.length || uploading) return;
    setUploading(true);
    setProgress({ current: 0, total: sendable.length });
    let imported = 0;
    let existed = 0;
    let failed = 0;
    const company = companyId === AUTO_COMPANY ? undefined : companyId;

    for (const [index, item] of sendable.entries()) {
      setProgress({ current: index + 1, total: sendable.length });
      updateItems(
        itemsRef.current.map((current) =>
          current.id === item.id ? { ...current, status: 'uploading', message: undefined } : current
        )
      );
      try {
        const base64 = await fileToBase64(item.file);
        const result = await uploadFiscalDocumentXML(token, organizationId, base64, company);
        if (result.replayed) {
          existed += 1;
          updateItems(
            itemsRef.current.map((current) =>
              current.id === item.id
                ? { ...current, status: 'exists', message: 'Este XML já havia sido importado.' }
                : current
            )
          );
        } else {
          imported += 1;
          updateItems(
            itemsRef.current.map((current) =>
              current.id === item.id ? { ...current, status: 'success', message: undefined } : current
            )
          );
        }
      } catch (err: unknown) {
        const duplicate = err instanceof ApiError && err.code === 'duplicate_access_key';
        if (duplicate) existed += 1;
        else failed += 1;
        updateItems(
          itemsRef.current.map((current) =>
            current.id === item.id
              ? {
                  ...current,
                  status: duplicate ? 'exists' : 'error',
                  message: uploadErrorMessage(err)
                }
              : current
          )
        );
      }
    }

    setUploading(false);
    queryClient.invalidateQueries({ queryKey: ['fiscal-documents', organizationId] });

    const skipped = itemsRef.current.filter((item) => item.status === 'skipped' || item.status === 'invalid').length;
    if (imported && !existed && !failed && !skipped) {
      toast.success(imported === 1 ? 'XML recebido' : `${imported} XMLs recebidos`, {
        description: 'A extração dos dados e o matching continuam em segundo plano.'
      });
      resetForm();
      onOpenChange(false);
      return;
    }

    const parts: string[] = [];
    if (imported) parts.push(`${imported} importado${imported === 1 ? '' : 's'}`);
    if (existed) parts.push(`${existed} já existia${existed === 1 ? '' : 'm'}`);
    if (failed) parts.push(`${failed} com erro`);
    if (skipped) parts.push(`${skipped} ignorado${skipped === 1 ? '' : 's'}`);
    toast[failed ? 'error' : imported ? 'success' : 'warning'](parts.join(' · ') || 'Nenhum XML importado');
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resetForm();
        onOpenChange(next);
      }}
    >
      <DialogContent showCloseButton className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <GradientDialogHeader
          icon={FileUpIcon}
          title="Importar XML"
          description="Envie uma ou mais NF-e já autorizadas — útil para notas antigas fora da janela de distribuição do SEFAZ (~90 dias) ou recebidas por outro canal. Notas cuja chave já existe não são importadas de novo."
        />

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
          <div className="flex flex-col gap-2">
            <Label>Arquivos XML (nfeProc ou NFe)</Label>
            <div
              {...getRootProps()}
              className={cn(
                'flex flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-6 text-center',
                isDragActive && 'border-primary bg-primary/5',
                uploading && 'pointer-events-none opacity-60'
              )}
            >
              <input {...getInputProps()} />
              <p className="text-sm">Arraste os XMLs aqui ou selecione vários arquivos de uma vez.</p>
              <Button type="button" variant="outline" size="sm" onClick={openFilePicker} disabled={uploading}>
                <UploadIcon />
                Selecionar arquivos
              </Button>
            </div>
          </div>

          {items.length > 0 && (
            <ScrollArea className="max-h-56 rounded-md border">
              <ul className="divide-y">
                {items.map((item) => (
                  <li key={item.id} className="flex items-start gap-2 px-3 py-2">
                    <span className="mt-0.5">{statusIcon(item.status)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium" title={item.file.name}>
                        {item.file.name}
                      </p>
                      <p className="text-muted-foreground truncate font-mono text-xs">
                        {item.accessKey ? (
                          <span title={item.accessKey}>{formatAccessKey(item.accessKey)}</span>
                        ) : (
                          'sem chave'
                        )}
                        <span> · {formatBytes(item.file.size)}</span>
                      </p>
                      {item.message && (
                        <p
                          className={cn(
                            'text-xs',
                            item.status === 'error' || item.status === 'invalid'
                              ? 'text-destructive'
                              : 'text-amber-700 dark:text-amber-500'
                          )}
                        >
                          {item.message}
                        </p>
                      )}
                    </div>
                    {!uploading && item.status !== 'success' && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0"
                        onClick={() => removeItem(item.id)}
                        aria-label={`Remover ${item.file.name}`}
                      >
                        <XIcon />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}

          <div className="flex flex-col gap-2">
            <Label>Empresa destinatária</Label>
            <Select value={companyId} onValueChange={setCompanyId} disabled={uploading}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AUTO_COMPANY}>Detectar pelo CNPJ do destinatário no XML</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.legal_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="text-muted-foreground rounded-md border border-dashed p-3 text-xs">
            Cada XML é processado pelo mesmo pipeline dos documentos recebidos automaticamente. A chave de acesso
            da nota é conferida antes do envio: se ela já existir na organização, aquele arquivo é recusado.
          </p>
        </div>

        <DialogFooter className="px-6 pb-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>
            {items.some((item) => item.status === 'success') ? 'Fechar' : 'Cancelar'}
          </Button>
          <Button type="button" disabled={!sendable.length || uploading} onClick={() => void handleUpload()}>
            {uploading ? <LoaderCircleIcon className="animate-spin" /> : <UploadIcon />}
            {uploading
              ? `Enviando ${progress.current}/${progress.total}...`
              : sendable.some((item) => item.status === 'error') && sendable.every((item) => item.status === 'error')
                ? 'Tentar novamente'
                : sendable.length > 1
                  ? `Importar ${sendable.length} XMLs`
                  : 'Importar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
