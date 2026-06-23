'use client';

import PageContainer from '@/components/layout/page-container';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icons } from '@/components/icons';
import { useAuth } from '@/context/auth-context';

export default function ExclusivePage() {
  const { activeOrganization, isLoading } = useAuth();

  return (
    <PageContainer isLoading={isLoading}>
      {!activeOrganization ? (
        <div className='flex h-full items-center justify-center'>
          <Card className='max-w-lg'>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <Icons.lock className='h-5 w-5 text-yellow-600' />
                Organization Required
              </CardTitle>
              <CardDescription>
                Select an organization to access this exclusive workspace area.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      ) : (
        <div className='space-y-6'>
          <div>
            <h1 className='flex items-center gap-2 text-3xl font-bold tracking-tight'>
              <Icons.badgeCheck className='h-7 w-7 text-green-600' />
              Exclusive Area
            </h1>
            <p className='text-muted-foreground'>
              Welcome, <span className='font-semibold'>{activeOrganization.nome}</span>! This page
              is available for your active organization.
            </p>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Organization Workspace</CardTitle>
              <CardDescription>
                Access is controlled by the Nexus backend organization permissions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className='text-lg'>Have a wonderful day!</div>
            </CardContent>
          </Card>
        </div>
      )}
    </PageContainer>
  );
}
