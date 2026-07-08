'use client';

import PageContainer from '@/components/layout/page-container';
import { useAuth } from '@/context/auth-context';
import { Suspense } from 'react';
import {
  KpiSummaryCards,
  KpiSummaryCardsSkeleton,
} from '@/features/nfe-documents/components/kpi-summary-cards';
import { QuickLinks } from './quick-links';
import { RecentNfeDocuments, RecentNfeDocumentsSkeleton } from './recent-nfe-documents';

export function HomeDashboard() {
  const { activeOrganization, activeOrganizationId, isLoading } = useAuth();

  return (
    <PageContainer
      pageTitle='Início'
      pageDescription='Visão geral dos documentos fiscais e atalhos para as principais áreas da plataforma.'
      isLoading={isLoading}
      access={Boolean(activeOrganization)}
      accessFallback={
        <div className='text-muted-foreground flex min-h-[300px] items-center justify-center text-sm'>
          Selecione uma organização no menu lateral para visualizar o painel.
        </div>
      }
    >
      <div className='flex flex-col gap-8'>
        <section className='space-y-4'>
          <div>
            <h3 className='text-lg font-semibold'>Resumo do período</h3>
            <p className='text-muted-foreground text-sm'>
              Indicadores consolidados das notas fiscais da organização.
            </p>
          </div>
          {activeOrganizationId ? (
            <Suspense fallback={<KpiSummaryCardsSkeleton />}>
              <KpiSummaryCards organizationId={activeOrganizationId} />
            </Suspense>
          ) : (
            <KpiSummaryCardsSkeleton />
          )}
        </section>

        <section className='space-y-4'>
          <div>
            <h3 className='text-lg font-semibold'>Acesso rápido</h3>
            <p className='text-muted-foreground text-sm'>
              Navegue para as áreas mais utilizadas do sistema.
            </p>
          </div>
          <QuickLinks />
        </section>

        <section className='space-y-4'>
          {activeOrganizationId ? (
            <Suspense fallback={<RecentNfeDocumentsSkeleton />}>
              <RecentNfeDocuments organizationId={activeOrganizationId} />
            </Suspense>
          ) : (
            <RecentNfeDocumentsSkeleton />
          )}
        </section>
      </div>
    </PageContainer>
  );
}
