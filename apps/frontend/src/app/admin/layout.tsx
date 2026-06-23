import KBar from '@/components/kbar';
import AdminSidebar from '@/components/layout/admin-sidebar';
import Header from '@/components/layout/header';
import { InfoSidebar } from '@/components/layout/info-sidebar';
import { InfobarProvider } from '@/components/ui/infobar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { backendFetch } from '@/lib/server-backend';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Nexus Admin',
  description: 'Painel administrativo Nexus',
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const meResponse = await backendFetch('/auth/me');

  if (!meResponse.ok) {
    redirect('/auth/sign-in?redirect=/admin/organizations');
  }

  const user = (await meResponse.json()) as { role: string };

  if (user.role !== 'admin') {
    redirect('/dashboard/overview');
  }

  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get('sidebar_state')?.value === 'true';

  return (
    <KBar>
      <SidebarProvider defaultOpen={defaultOpen}>
        <AdminSidebar />
        <SidebarInset>
          <Header />
          <InfobarProvider defaultOpen={false}>
            {children}
            <InfoSidebar side='right' />
          </InfobarProvider>
        </SidebarInset>
      </SidebarProvider>
    </KBar>
  );
}
