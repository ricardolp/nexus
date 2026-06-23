/** Default org-scoped role created with every organization (seed). */
export const DEFAULT_MEMBER_ROLE_NAME = "Member";

/** Scopes granted to the seed Member role so org users can operate without extra setup. */
export const DEFAULT_MEMBER_SCOPES = [
  "organization:read",
  "user:read",
  "user:create",
  "member:create",
  "member:update",
  "organization_role:read",
  "organization_role:create",
  "organization_role:update",
  "organization_role:delete",
  "company:read",
  "company:create",
  "company:update",
  "company:delete",
  "company_certificate:read",
  "company_certificate:create",
  "company_certificate:update",
  "company_certificate:delete",
  "organization_integration:read",
  "organization_integration:update",
  "nfe:read",
  "nfe:import",
  "nfe:update",
] as const;
