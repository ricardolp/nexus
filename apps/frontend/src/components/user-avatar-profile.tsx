'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import type { AuthUser } from '@/lib/auth/types';

interface UserAvatarProfileProps {
  className?: string;
  showInfo?: boolean;
  user: Pick<AuthUser, 'nome' | 'sobrenome' | 'email'> | null;
}

export function UserAvatarProfile({ className, showInfo = false, user }: UserAvatarProfileProps) {
  const fullName = user ? `${user.nome} ${user.sobrenome}`.trim() : '';
  const initials = user
    ? `${user.nome?.[0] ?? ''}${user.sobrenome?.[0] ?? ''}`.toUpperCase()
    : 'NX';

  return (
    <div className='flex items-center gap-2'>
      <Avatar className={className}>
        <AvatarFallback className='rounded-lg'>{initials}</AvatarFallback>
      </Avatar>

      {showInfo && user && (
        <div className='grid flex-1 text-left text-sm leading-tight'>
          <span className='truncate font-semibold'>{fullName}</span>
          <span className='truncate text-xs'>{user.email}</span>
        </div>
      )}
    </div>
  );
}
