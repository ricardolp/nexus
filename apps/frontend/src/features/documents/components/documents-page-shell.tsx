'use client';

import PageContainer from '@/components/layout/page-container';
import { useAuth } from '@/context/auth-context';
import type { ReactNode } from 'react';

interface DocumentsPageShellProps {
  pageTitle: string;
  pageDescription: string;
  children: ReactNode;
  pageHeaderAction?: ReactNode;
}

export function DocumentsPageShell({
  pageTitle,
  pageDescription,
  children,
  pageHeaderAction,
}: DocumentsPageShellProps) {
  const { activeOrganization, isLoading } = useAuth();

  return (
    <PageContainer
      pageTitle={pageTitle}
      pageDescription={pageDescription}
      pageHeaderAction={pageHeaderAction}
      isLoading={isLoading}
      access={Boolean(activeOrganization)}
      accessFallback={
        <div className='text-muted-foreground flex min-h-[300px] items-center justify-center text-sm'>
          Selecione uma organização no menu lateral para visualizar os dados.
        </div>
      }
    >
      <div className='flex min-h-0 flex-1 flex-col'>{children}</div>
    </PageContainer>
  );
}
