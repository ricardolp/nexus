'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/context/auth-context';

export default function ProfileViewPage() {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  return (
    <div className='flex w-full flex-col gap-6 p-4'>
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your account information from the Nexus backend.</CardDescription>
        </CardHeader>
        <CardContent className='space-y-3 text-sm'>
          <div>
            <p className='text-muted-foreground'>Name</p>
            <p className='font-medium'>
              {user.nome} {user.sobrenome}
            </p>
          </div>
          <div>
            <p className='text-muted-foreground'>Email</p>
            <p className='font-medium'>{user.email}</p>
          </div>
          <div>
            <p className='text-muted-foreground'>Role</p>
            <p className='font-medium capitalize'>{user.role}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
