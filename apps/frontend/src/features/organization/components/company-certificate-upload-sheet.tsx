'use client';

import { useAppForm, useFormFields } from '@/components/ui/tanstack-form';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Icons } from '@/components/icons';
import { useMutation } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { uploadOrganizationCompanyCertificateMutation } from '../api/mutations';
import type { OrganizationCompany } from '../api/types';
import {
  organizationCompanyCertificateUploadSchema,
  type OrganizationCompanyCertificateUploadFormValues,
} from '../schemas/organization-forms';

const PFX_ACCEPT = {
  'application/x-pkcs12': ['.pfx'],
  'application/pkcs12': ['.pfx'],
};

const defaultValues: OrganizationCompanyCertificateUploadFormValues = {
  certificate: [],
  password: '',
  name: '',
  description: '',
  activate: false,
};

interface CompanyCertificateUploadSheetProps {
  company: OrganizationCompany;
  organizationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CompanyCertificateUploadSheet({
  company,
  organizationId,
  open,
  onOpenChange,
  onSuccess,
}: CompanyCertificateUploadSheetProps) {
  const uploadMutation = useMutation({
    ...uploadOrganizationCompanyCertificateMutation,
    onSuccess: () => {
      toast.success('Certificado enviado com sucesso');
      onOpenChange(false);
      form.reset(defaultValues);
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Falha ao enviar certificado');
    },
  });

  const form = useAppForm({
    defaultValues,
    validators: {
      onSubmit: organizationCompanyCertificateUploadSchema,
    },
    onSubmit: async ({ value }) => {
      const certificateFile = value.certificate[0];

      if (!certificateFile) {
        return;
      }

      await uploadMutation.mutateAsync({
        organizationId,
        companyId: company.id,
        payload: {
          certificate: certificateFile,
          password: value.password,
          name: value.name.trim() || undefined,
          description: value.description.trim() || undefined,
          status: value.activate ? 'active' : 'inactive',
        },
      });
    },
  });

  const { FormFileUploadField, FormTextField, FormTextareaField, FormSwitchField } =
    useFormFields<OrganizationCompanyCertificateUploadFormValues>();

  useEffect(() => {
    if (open) {
      form.reset(defaultValues);
    }
  }, [open, form]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='flex flex-col sm:max-w-lg'>
        <SheetHeader>
          <SheetTitle>Enviar certificado digital</SheetTitle>
          <SheetDescription>
            Faça upload do arquivo .pfx da empresa {company.razaoSocial}. O certificado será
            armazenado com segurança no Azure Key Vault.
          </SheetDescription>
        </SheetHeader>

        <div className='flex-1 overflow-auto'>
          <form.AppForm>
            <form.Form id='company-certificate-upload-form' className='space-y-4'>
              <FormFileUploadField
                name='certificate'
                label='Arquivo do certificado'
                description='Arraste ou selecione um arquivo .pfx (máx. 10 MB)'
                required
                maxFiles={1}
                maxSize={10 * 1024 * 1024}
                accept={PFX_ACCEPT}
              />

              <FormTextField
                name='password'
                label='Senha do certificado'
                type='password'
                required
                placeholder='Senha do arquivo .pfx'
              />

              <FormTextField
                name='name'
                label='Nome'
                placeholder='Ex.: Certificado principal'
              />

              <FormTextareaField
                name='description'
                label='Descrição'
                placeholder='Observações sobre o certificado (opcional)'
              />

              <FormSwitchField
                name='activate'
                label='Ativar após o envio'
                description='Se ativado, este certificado passa a ser o certificado ativo da empresa.'
              />
            </form.Form>
          </form.AppForm>
        </div>

        <SheetFooter>
          <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type='submit' form='company-certificate-upload-form' isLoading={uploadMutation.isPending}>
            <Icons.upload className='mr-2 h-4 w-4' />
            Enviar certificado
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
