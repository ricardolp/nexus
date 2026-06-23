'use client';

import PageContainer from '@/components/layout/page-container';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Icons } from '@/components/icons';
import { useAuth } from '@/context/auth-context';
import { billingInfoContent } from '@/config/infoconfig';

export default function BillingPage() {
  const { activeOrganization, isLoading } = useAuth();

  return (
    <PageContainer
      isLoading={isLoading}
      access={!!activeOrganization}
      accessFallback={
        <div className='flex min-h-[400px] items-center justify-center'>
          <div className='space-y-2 text-center'>
            <h2 className='text-2xl font-semibold'>No Organization Selected</h2>
            <p className='text-muted-foreground'>
              Please select or create an organization to view billing information.
            </p>
          </div>
        </div>
      }
      infoContent={billingInfoContent}
      pageTitle='Billing & Plans'
      pageDescription={`Manage your subscription and usage limits for ${activeOrganization?.nome ?? 'your organization'}`}
    >
      <div className='space-y-6'>
        <Alert>
          <Icons.info className='h-4 w-4' />
          <AlertDescription>
            Billing is managed by the Nexus backend. This page will be connected to your
            organization subscription APIs.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle>Available Plans</CardTitle>
            <CardDescription>Choose a plan that fits your organization&apos;s needs</CardDescription>
          </CardHeader>
          <CardContent className='text-muted-foreground text-sm'>
            Plan management is not available in this environment yet.
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
