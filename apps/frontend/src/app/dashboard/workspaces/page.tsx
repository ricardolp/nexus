'use client';

import Link from 'next/link';
import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/context/auth-context';
import { workspacesInfoContent } from '@/config/infoconfig';

export default function WorkspacesPage() {
  const { organizations, activeOrganizationId, setActiveOrganizationId } = useAuth();

  return (
    <PageContainer
      pageTitle='Workspaces'
      pageDescription='Manage your workspaces and switch between them'
      infoContent={workspacesInfoContent}
    >
      <div className='grid gap-4 md:grid-cols-2'>
        {organizations.map((organization) => (
          <Card key={organization.id}>
            <CardHeader>
              <CardTitle>{organization.nome}</CardTitle>
              <CardDescription>{organization.slug}</CardDescription>
            </CardHeader>
            <CardContent className='flex items-center justify-between gap-3'>
              <p className='text-muted-foreground text-sm'>
                {organization.role?.nome ?? 'No role assigned'}
              </p>
              <div className='flex gap-2'>
                <Button
                  variant={activeOrganizationId === organization.id ? 'default' : 'outline'}
                  onClick={() => setActiveOrganizationId(organization.id)}
                >
                  {activeOrganizationId === organization.id ? 'Active' : 'Switch'}
                </Button>
                <Button variant='outline' asChild>
                  <Link href='/dashboard/organization/members'>Equipe</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageContainer>
  );
}
