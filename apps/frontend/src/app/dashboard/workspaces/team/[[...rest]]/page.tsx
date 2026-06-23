'use client';

import PageContainer from '@/components/layout/page-container';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/context/auth-context';
import { teamInfoContent } from '@/config/infoconfig';

export default function TeamPage() {
  const { activeOrganization } = useAuth();

  return (
    <PageContainer
      pageTitle='Team Management'
      pageDescription='Manage your workspace team, members, roles, security and more.'
      infoContent={teamInfoContent}
      access={!!activeOrganization}
      accessFallback={
        <div className='text-muted-foreground flex min-h-[300px] items-center justify-center text-sm'>
          Select an organization to manage its team.
        </div>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>{activeOrganization?.nome}</CardTitle>
          <CardDescription>
            Team management is handled by the Nexus backend organization module.
          </CardDescription>
        </CardHeader>
        <CardContent className='text-muted-foreground text-sm'>
          Use the organization APIs to invite members, assign roles and manage access.
        </CardContent>
      </Card>
    </PageContainer>
  );
}
