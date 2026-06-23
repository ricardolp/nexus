'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Icons } from '@/components/icons';
import type { Organization } from '../../api/types';
import { AddOrganizationUserSheet } from '../add-organization-user-sheet';
import { EditOrganizationSettingsSheet } from '../edit-organization-settings-sheet';
import { useState } from 'react';

interface CellActionProps {
  data: Organization;
}

export function CellAction({ data }: CellActionProps) {
  const [userSheetOpen, setUserSheetOpen] = useState(false);
  const [settingsSheetOpen, setSettingsSheetOpen] = useState(false);

  return (
    <>
      <AddOrganizationUserSheet
        organization={data}
        open={userSheetOpen}
        onOpenChange={setUserSheetOpen}
      />
      <EditOrganizationSettingsSheet
        organization={data}
        open={settingsSheetOpen}
        onOpenChange={setSettingsSheetOpen}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant='outline' size='sm'>
            <Icons.ellipsis className='mr-2 h-4 w-4' />
            Ações
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuItem onClick={() => setUserSheetOpen(true)}>
            <Icons.add className='mr-2 h-4 w-4' />
            Adicionar usuário
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setSettingsSheetOpen(true)}>
            <Icons.settings className='mr-2 h-4 w-4' />
            Configurações
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
