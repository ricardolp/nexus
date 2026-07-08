export interface AuthUser {
  id: string;
  nome: string;
  sobrenome: string;
  email: string;
  role: string;
}

export interface OrganizationRole {
  id: string;
  nome: string;
  slug: string;
}

export interface OrganizationSummary {
  id: string;
  nome: string;
  slug: string;
  logo: string | null;
  role: OrganizationRole | null;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export interface ListMyOrganizationsResponse {
  items: OrganizationSummary[];
}
