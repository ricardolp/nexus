import { mutationOptions } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/query-client';
import {
  createOrganizationCompany,
  createOrganizationMemberUser,
  createOrganizationRole,
  removeOrganizationMember,
  updateOrganizationCompany,
  updateOrganizationRolePermissions,
  uploadOrganizationCompanyCertificate,
} from './service';
import { organizationKeys } from './queries';

export const createOrganizationMemberUserMutation = mutationOptions({
  mutationFn: ({
    organizationId,
    payload,
  }: {
    organizationId: string;
    payload: Parameters<typeof createOrganizationMemberUser>[1];
  }) => createOrganizationMemberUser(organizationId, payload),
  onSuccess: () => {
    getQueryClient().invalidateQueries({ queryKey: organizationKeys.all });
  },
});

export const removeOrganizationMemberMutation = mutationOptions({
  mutationFn: ({
    organizationId,
    memberId,
  }: {
    organizationId: string;
    memberId: string;
  }) => removeOrganizationMember(organizationId, memberId),
  onSuccess: () => {
    getQueryClient().invalidateQueries({ queryKey: organizationKeys.all });
  },
});

export const createOrganizationCompanyMutation = mutationOptions({
  mutationFn: ({
    organizationId,
    payload,
  }: {
    organizationId: string;
    payload: Parameters<typeof createOrganizationCompany>[1];
  }) => createOrganizationCompany(organizationId, payload),
  onSuccess: () => {
    getQueryClient().invalidateQueries({ queryKey: organizationKeys.all });
  },
});

export const uploadOrganizationCompanyCertificateMutation = mutationOptions({
  mutationFn: ({
    organizationId,
    companyId,
    payload,
  }: {
    organizationId: string;
    companyId: string;
    payload: Parameters<typeof uploadOrganizationCompanyCertificate>[2];
  }) => uploadOrganizationCompanyCertificate(organizationId, companyId, payload),
  onSuccess: (_, variables) => {
    getQueryClient().invalidateQueries({
      queryKey: organizationKeys.certificates(variables.organizationId, variables.companyId),
    });
  },
});

export const updateOrganizationCompanyMutation = mutationOptions({
  mutationFn: ({
    organizationId,
    companyId,
    payload,
  }: {
    organizationId: string;
    companyId: string;
    payload: Parameters<typeof updateOrganizationCompany>[2];
  }) => updateOrganizationCompany(organizationId, companyId, payload),
  onSuccess: () => {
    getQueryClient().invalidateQueries({ queryKey: organizationKeys.all });
  },
});

export const createOrganizationRoleMutation = mutationOptions({
  mutationFn: ({
    organizationId,
    payload,
    permissions,
  }: {
    organizationId: string;
    payload: Parameters<typeof createOrganizationRole>[1];
    permissions: string[];
  }) =>
    createOrganizationRole(organizationId, payload).then(async (role) => {
      if (permissions.length > 0) {
        await updateOrganizationRolePermissions(organizationId, role.id, permissions);
      }
      return role;
    }),
  onSuccess: () => {
    getQueryClient().invalidateQueries({ queryKey: organizationKeys.all });
  },
});

export const updateOrganizationRoleMutation = mutationOptions({
  mutationFn: ({
    organizationId,
    roleId,
    permissions,
  }: {
    organizationId: string;
    roleId: string;
    permissions: string[];
  }) => updateOrganizationRolePermissions(organizationId, roleId, permissions),
  onSuccess: () => {
    getQueryClient().invalidateQueries({ queryKey: organizationKeys.all });
  },
});
