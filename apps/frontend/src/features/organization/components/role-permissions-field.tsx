'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ORGANIZATION_ROLE_PERMISSION_OPTIONS } from '../constants/permissions';

interface RolePermissionsFieldProps {
  value: string[];
  onChange: (permissions: string[]) => void;
}

export function RolePermissionsField({ value, onChange }: RolePermissionsFieldProps) {
  const togglePermission = (permission: string, checked: boolean) => {
    if (checked) {
      onChange([...value, permission]);
      return;
    }

    onChange(value.filter((item) => item !== permission));
  };

  return (
    <div className='space-y-2'>
      <Label>Permissões</Label>
      <ScrollArea className='h-56 rounded-md border p-3'>
        <div className='space-y-3'>
          {ORGANIZATION_ROLE_PERMISSION_OPTIONS.map((option) => {
            const checked = value.includes(option.value);
            return (
              <label
                key={option.value}
                className='flex cursor-pointer items-start gap-3 text-sm'
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(next) => togglePermission(option.value, Boolean(next))}
                />
                <span className='leading-snug'>{option.label}</span>
              </label>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
