'use client';

import { useRef, useState } from 'react';
import { useStore } from '@tanstack/react-form';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { FieldDescription, FieldLabel } from '@/components/ui/field';
import {
  createFormField,
  FormField,
  FormFieldError,
  FormFieldSet,
  useFieldContext,
} from '@/components/ui/form-context';
import { resizeImageToSquare } from '@/lib/image/resize-image';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

interface OrganizationLogoFieldProps {
  label: string;
  description?: string;
}

function OrganizationLogoField({ label, description }: OrganizationLogoFieldProps) {
  const field = useFieldContext();
  const value = useStore(field.store, (state) => state.value) as string | null | undefined;
  const inputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error('Use uma imagem JPG, PNG ou WebP');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast.error('A imagem deve ter no máximo 5 MB');
      return;
    }

    setIsProcessing(true);

    try {
      const resized = await resizeImageToSquare(file);
      field.handleChange(resized);
    } catch {
      toast.error('Não foi possível processar a imagem');
    } finally {
      setIsProcessing(false);
    }
  }

  function handleRemove() {
    field.handleChange(null);
  }

  return (
    <FormFieldSet>
      <FormField>
        <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
        <div className='flex items-start gap-4'>
          <div
            className={cn(
              'bg-muted flex size-[72px] shrink-0 items-center justify-center overflow-hidden rounded-lg border',
              value && 'border-transparent',
            )}
          >
            {value ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={value} alt='Pré-visualização do logo' className='size-full object-cover' />
            ) : (
              <Icons.galleryVerticalEnd className='text-muted-foreground size-6' />
            )}
          </div>

          <div className='flex flex-col gap-2'>
            <input
              ref={inputRef}
              id={field.name}
              type='file'
              accept={ACCEPTED_TYPES.join(',')}
              className='hidden'
              onChange={handleFileChange}
              onBlur={field.handleBlur}
            />
            <div className='flex flex-wrap gap-2'>
              <Button
                type='button'
                variant='outline'
                size='sm'
                disabled={isProcessing}
                onClick={() => inputRef.current?.click()}
              >
                <Icons.upload className='size-4' />
                {isProcessing ? 'Processando...' : value ? 'Trocar imagem' : 'Enviar imagem'}
              </Button>
              {value ? (
                <Button type='button' variant='ghost' size='sm' onClick={handleRemove}>
                  Remover
                </Button>
              ) : null}
            </div>
            {description ? <FieldDescription>{description}</FieldDescription> : null}
          </div>
        </div>
      </FormField>
      <FormFieldError />
    </FormFieldSet>
  );
}

export const FormOrganizationLogoField = createFormField(OrganizationLogoField);
