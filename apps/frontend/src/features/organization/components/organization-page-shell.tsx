'use client';

import PageContainer from '@/components/layout/page-container';
import { useAuth } from '@/context/auth-context';
import type { ReactNode } from 'react';

interface OrganizationPageShellProps {
  pageTitle: string;
  pageDescription: string;
  children: ReactNode;
  pageHeaderAction?: ReactNode;
}

export function OrganizationPageShell({
  pageTitle,
  pageDescription,
  children,
  pageHeaderAction,
}: OrganizationPageShellProps) {
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
      {children}
    </PageContainer>
  );
}
