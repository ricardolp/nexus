import { Navigate, Route, Routes } from 'react-router-dom';

import { adminNavGroups, userNavGroups } from '@/config/nav-items';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Providers } from '@/components/layout/providers';
import { RequireRole } from '@/components/layout/require-role';
import AdminOverviewPage from '@/pages/admin/overview';
import AdminOrganizationPage from '@/pages/admin/organizations/detail';
import AdminRequestsPage from '@/pages/admin/requests';
import AdminErrorsPage from '@/pages/admin/errors';
import AdminStatusPage from '@/pages/admin/status';
import AdminSignInPage from '@/pages/admin/sign-in';
import NfeDistributionPage from '@/pages/admin/nfe-distribution';
import AdminBillingPage from '@/pages/admin/billing';
import UsersPage from '@/pages/admin/users';
import NotFoundPage from '@/pages/not-found';
import HelpPage from '@/pages/help';
import SupportPage from '@/pages/support';
import OverviewPage from '@/pages/overview';
import ProfilePage from '@/pages/profile';
import OrganizationPage from '@/pages/organization';
import FiscalDocumentDetailPage from '@/pages/app/fiscal/fiscal-document-detail-page';
import NFePage from '@/pages/app/fiscal/nfe';
import NFeSaidaPage from '@/pages/app/fiscal/nfe-saida';
import NFSePage from '@/pages/app/fiscal/nfse';
import CompaniesPage from '@/pages/app/settings/companies';
import CompanyPage from '@/pages/app/settings/companies/company-page';
import AccessProfilesPage from '@/pages/app/settings/profiles';
import IntegrationsPage from '@/pages/app/settings/integrations';
import LegacyProcessFlowRedirect from '@/pages/app/settings/process-flows/legacy-redirect';
import ScenarioFormPage from '@/pages/app/settings/integrations/flows/scenario-form-page';
import OrganizationUsersPage from '@/pages/app/settings/users';
import SignInPage from '@/pages/sign-in';
import InvitePage from '@/pages/invite';
import ForgotPasswordPage from '@/pages/forgot-password';
import ResetPasswordPage from '@/pages/reset-password';
import MfaOnboardingPage from '@/pages/mfa-onboarding';
import { postLoginPath } from '@/lib/mfa-onboarding';
import { useAuthStore } from '@/store/auth-store';

function RootRedirect() {
  const user = useAuthStore((s) => s.user);
  const mfaSetupRequired = useAuthStore((s) => s.mfaSetupRequired);
  if (!user) return <Navigate to="/login" replace />;
  return (
    <Navigate
      to={postLoginPath({
        result: mfaSetupRequired ? 'mfa_setup' : 'ok',
        role: user.role,
        mfaEnabled: user.mfaEnabled,
        userId: user.id,
        mfaSetupRequired
      })}
      replace
    />
  );
}

export default function App() {
  return (
    <Providers>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<SignInPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/mfa-setup" element={<MfaOnboardingPage />} />
        <Route path="/invite" element={<InvitePage />} />
        <Route path="/admin/login" element={<AdminSignInPage />} />

        <Route element={<RequireRole role="admin" />}>
          <Route
            path="/admin"
            element={
              <DashboardLayout
                groups={adminNavGroups}
                profileUrl="/admin/profile"
                helpUrl="/admin/help"
                supportUrl="/admin/support"
                homeUrl="/admin/overview"
              />
            }
          >
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<AdminOverviewPage />} />
            <Route path="organizations/:organizationId" element={<AdminOrganizationPage />} />
            <Route path="requests" element={<AdminRequestsPage />} />
            <Route path="errors" element={<AdminErrorsPage />} />
            <Route path="status" element={<AdminStatusPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="nfe-distribution" element={<NfeDistributionPage />} />
            <Route path="billing" element={<AdminBillingPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="help" element={<HelpPage />} />
            <Route path="support" element={<SupportPage initialTab="contact" />} />
          </Route>
        </Route>

        <Route element={<RequireRole role="user" />}>
          <Route
            path="/app"
            element={
              <DashboardLayout
                groups={userNavGroups}
                profileUrl="/app/profile"
                helpUrl="/app/help"
                supportUrl="/app/support"
                homeUrl="/app/overview"
                showOrganization
              />
            }
          >
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<OverviewPage />} />
            <Route path="billing" element={<Navigate to="/app/organization?tab=consumo" replace />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="organization" element={<OrganizationPage />} />
            <Route path="help" element={<HelpPage />} />
            <Route path="support" element={<SupportPage initialTab="contact" />} />
            <Route path="nfe" element={<NFePage />} />
            <Route path="nfe/saida" element={<NFeSaidaPage />} />
            <Route path="nfe/:documentId" element={<FiscalDocumentDetailPage />} />
            <Route path="nfse" element={<NFSePage />} />
            <Route path="nfse/:documentId" element={<FiscalDocumentDetailPage />} />
            <Route path="settings/companies" element={<CompaniesPage />} />
            <Route path="settings/companies/:companyId" element={<CompanyPage />} />
            <Route path="settings/companies/:companyId/process-flows/:scenarioId" element={<ScenarioFormPage />} />
            <Route path="settings/users" element={<OrganizationUsersPage />} />
            <Route path="settings/profiles" element={<AccessProfilesPage />} />
            <Route path="settings/integrations" element={<IntegrationsPage />} />
            <Route path="settings/integrations/flows/:scenarioId" element={<LegacyProcessFlowRedirect />} />
            <Route path="settings/process-flows" element={<Navigate to="/app/settings/companies" replace />} />
            <Route path="settings/process-flows/:scenarioId" element={<LegacyProcessFlowRedirect />} />
            <Route path="settings/security" element={<Navigate to="/app/organization?tab=security" replace />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Providers>
  );
}
