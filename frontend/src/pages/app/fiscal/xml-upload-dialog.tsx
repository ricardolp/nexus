import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileUpIcon, UploadIcon } from 'lucide-react';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import { listCompanies, uploadFiscalDocumentXML } from '@/lib/endpoints';
import { useAuthStore } from '@/store/auth-store';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { GradientDialogHeader } from '@/components/ui/gradient-dialog-header';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { badgeFor, statusLabels } from './status-labels';

const AUTO_COMPANY = 'auto';

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

interface XMLUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function XMLUploadDialog({ open, onOpenChange }: XMLUploadDialogProps) {
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [companyId, setCompanyId] = useState(AUTO_COMPANY);

  const companiesQuery = useQuery({
    queryKey: ['companies', organizationId],
    queryFn: () => listCompanies(token!, organizationId!),
    enabled: open && !!token && !!organizationId
  });
  const companies = companiesQuery.data?.items ?? [];

  function resetForm() {
    setFile(null);
    setCompanyId(AUTO_COMPANY);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Selecione um arquivo .xml');
      const base64 = await fileToBase64(file);
      return uploadFiscalDocumentXML(
        token!,
        organizationId!,
        base64,
        companyId === AUTO_COMPANY ? undefined : companyId
      );
    },
    onSuccess: (result) => {
      const badge = badgeFor(statusLabels, result.status);
      toast.success(result.replayed ? 'Este XML já havia sido importado' : 'XML recebido', {
        description: result.replayed
          ? `Status atual: ${badge.label}`
          : 'A extração dos dados e o matching continuam em segundo plano.'
      });
      resetForm();
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ['fiscal-documents', organizationId] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível importar o XML.');
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resetForm();
        onOpenChange(next);
      }}
    >
      <DialogContent showCloseButton className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <GradientDialogHeader
          icon={FileUpIcon}
          title="Importar XML"
          description="Envie manualmente uma NF-e já autorizada — útil para notas antigas fora da janela de distribuição do SEFAZ (~90 dias) ou recebidas por outro canal."
        />

        <div className="flex flex-col gap-4 px-6 py-4">
          <div className="flex flex-col gap-2">
            <Label>Arquivo XML (nfeProc ou NFe)</Label>
            <Input
              ref={fileInputRef}
              type="file"
              accept=".xml,text/xml,application/xml"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Empresa destinatária</Label>
            <Select value={companyId} onValueChange={setCompanyId}>
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
            O XML é processado pelo mesmo pipeline dos documentos recebidos automaticamente: os dados são
            extraídos e gravados, e o envio ao SAP (pedido, recebimento, fatura) segue as regras e
            configurações já cadastradas por cenário, conforme cada etapa esteja automática ou manual.
          </p>
        </div>

        <DialogFooter className="px-6 pb-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={!file || uploadMutation.isPending} onClick={() => uploadMutation.mutate()}>
            <UploadIcon />
            {uploadMutation.isPending ? 'Enviando...' : 'Importar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
