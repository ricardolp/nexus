'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { IconUpload } from '@tabler/icons-react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { importNfeDocumentMutation } from '../api/mutations';
import { nfeDocumentsKeys } from '../api/queries';
import { organizationCompaniesQueryOptions } from '@/features/organization/api/queries';
import { nfeDocumentDetailPath } from '../lib/paths';

type ImportNfeXmlDialogProps = {
  organizationId: string;
};

export function ImportNfeXmlDialog({ organizationId }: ImportNfeXmlDialogProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [companyId, setCompanyId] = useState<string>('auto');
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: companies } = useSuspenseQuery(
    organizationCompaniesQueryOptions(organizationId, { page: 1, limit: 100 }),
  );

  const importMutation = useMutation({
    ...importNfeDocumentMutation(),
    onSuccess: (result) => {
      toast.success('XML importado com sucesso');
      void queryClient.invalidateQueries({ queryKey: nfeDocumentsKeys.all });
      setOpen(false);
      setFile(null);
      router.push(nfeDocumentDetailPath(result.documentId));
    },
    onError: (error) => toast.error(error.message),
  });

  const handleSubmit = () => {
    if (!file) {
      toast.error('Selecione um arquivo XML');
      return;
    }
    importMutation.mutate({
      organizationId,
      payload: {
        file,
        companyId: companyId === 'auto' ? undefined : companyId,
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <IconUpload className='mr-2 size-4' />
          Importar XML
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar NF-e por XML</DialogTitle>
          <DialogDescription>
            Envie o XML da nota fiscal de entrada. O CNPJ do destinatário será
            usado para identificar a empresa quando não informada.
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4 py-2'>
          <div className='grid gap-2'>
            <Label htmlFor='nfe-xml-file'>Arquivo XML</Label>
            <input
              id='nfe-xml-file'
              type='file'
              accept='.xml,text/xml,application/xml'
              className='text-sm'
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className='grid gap-2'>
            <Label>Empresa</Label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger>
                <SelectValue placeholder='Detectar pelo CNPJ do XML' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='auto'>Detectar pelo CNPJ do XML</SelectItem>
                {companies.items.map((company) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.razaoSocial}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={importMutation.isPending}>
            {importMutation.isPending ? 'Importando...' : 'Importar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
