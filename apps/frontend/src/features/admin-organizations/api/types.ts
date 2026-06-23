export interface Organization {
  id: string;
  nome: string;
  slug: string;
}

export interface OrganizationFilters {
  page: number;
  limit: number;
  search?: string;
}

export interface OrganizationsResponse {
  items: Organization[];
  page: number;
  perPage: number;
  total: number;
}

export interface CreateOrganizationUserPayload {
  nome: string;
  sobrenome: string;
  email: string;
  senha: string;
}

export interface CreateOrganizationPayload {
  nome: string;
  slug: string;
}

export interface OrganizationSettings {
  id: string;
  organizationId: string;
  maxCompanies: number;
}

export interface UpdateOrganizationSettingsPayload {
  maxCompanies: number;
}
