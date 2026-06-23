'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';

interface CheckboxOptionsFieldProps {
  label: string;
  options: { value: string; label: string }[];
  value: string[];
  onChange: (value: string[]) => void;
}

export function CheckboxOptionsField({
  label,
  options,
  value,
  onChange,
}: CheckboxOptionsFieldProps) {
  const toggle = (optionValue: string, checked: boolean) => {
    if (checked) {
      onChange([...value, optionValue]);
      return;
    }
    onChange(value.filter((item) => item !== optionValue));
  };

  return (
    <div className='space-y-2'>
      <Label>{label}</Label>
      <ScrollArea className='h-56 rounded-md border p-3'>
        <div className='space-y-3'>
          {options.map((option) => {
            const checked = value.includes(option.value);
            return (
              <label
                key={option.value}
                className='flex cursor-pointer items-start gap-3 text-sm'
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(next) => toggle(option.value, Boolean(next))}
                />
                <span className='leading-snug break-all'>{option.label}</span>
              </label>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
