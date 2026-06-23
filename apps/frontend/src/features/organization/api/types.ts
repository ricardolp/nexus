export interface OrganizationListFilters {
  page: number;
  limit: number;
  search?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  perPage: number;
  total: number;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  roleId: string;
  user: {
    nome: string;
    sobrenome: string;
    email: string;
  };
  role: {
    id: string;
    nome: string;
    slug: string;
  };
}

export interface OrganizationCompany {
  id: string;
  organizationId: string;
  cnpj: string;
  razaoSocial: string;
  status: 'active' | 'inactive';
}

export interface OrganizationRole {
  id: string;
  organizationId: string;
  nome: string;
  slug: string;
  permissions: string[];
}

export type OrganizationCompanyCertificateStatus =
  | 'active'
  | 'inactive'
  | 'expired'
  | 'revoked';

export interface OrganizationCompanyCertificate {
  id: string;
  organizationId: string;
  companyId: string;
  name: string | null;
  description: string | null;
  status: OrganizationCompanyCertificateStatus;
  keyVaultCertName: string;
  thumbprint: string | null;
  subject: string | null;
  issuer: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type OrganizationMembersResponse = PaginatedResponse<OrganizationMember>;
export type OrganizationCompaniesResponse = PaginatedResponse<OrganizationCompany>;
export type OrganizationCompanyCertificatesResponse =
  PaginatedResponse<OrganizationCompanyCertificate>;
export type OrganizationRolesResponse = PaginatedResponse<OrganizationRole>;
