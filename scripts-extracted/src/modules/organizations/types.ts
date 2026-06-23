export type OrganizationRequestContext = {
  membershipId: string;
  organizationId: string;
  organizationRoleId: string;
  roleName: string;
  scopes: string[];
  /** Platform admin acessando a org sem membership; escopos da org não se aplicam. */
  platformAdminAccess?: boolean;
};
