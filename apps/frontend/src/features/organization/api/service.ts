import type {
  OrganizationCompaniesResponse,
  OrganizationCompanyCertificatesResponse,
  OrganizationListFilters,
  OrganizationMembersResponse,
  OrganizationRolesResponse,
} from './types';
import { parseApiError } from './parse-api-error';

async function fetchOrganizationPage<T extends { items: unknown[] }>(
  path: string,
  filters: OrganizationListFilters,
  searchFields: ((item: T['items'][number]) => string)[],
): Promise<T> {
  const params = new URLSearchParams({
    page: String(filters.page),
    perPage: String(filters.limit),
  });

  const response = await fetch(`${path}?${params.toString()}`);

  if (!response.ok) {
    throw new Error('Falha ao carregar dados da organização');
  }

  const data = (await response.json()) as T;

  if (!filters.search) {
    return data;
  }

  const search = filters.search.toLowerCase();
  const filteredItems = data.items.filter((item) =>
    searchFields.some((getValue) => getValue(item).toLowerCase().includes(search)),
  );

  return {
    ...data,
    items: filteredItems,
    total: filteredItems.length,
  };
}

export async function getOrganizationMembers(
  organizationId: string,
  filters: OrganizationListFilters,
): Promise<OrganizationMembersResponse> {
  return fetchOrganizationPage<OrganizationMembersResponse>(
    `/api/backend/organization/${organizationId}/members`,
    filters,
    [
      (item) => `${item.user.nome} ${item.user.sobrenome}`,
      (item) => item.user.email,
      (item) => item.role.nome,
    ],
  );
}

export async function getOrganizationCompanies(
  organizationId: string,
  filters: OrganizationListFilters,
): Promise<OrganizationCompaniesResponse> {
  return fetchOrganizationPage<OrganizationCompaniesResponse>(
    `/api/backend/organization/${organizationId}/companies`,
    filters,
    [(item) => item.razaoSocial, (item) => item.cnpj],
  );
}

export async function getOrganizationRoles(
  organizationId: string,
  filters: OrganizationListFilters,
): Promise<OrganizationRolesResponse> {
  return fetchOrganizationPage<OrganizationRolesResponse>(
    `/api/backend/organization/${organizationId}/roles`,
    filters,
    [(item) => item.nome, (item) => item.slug],
  );
}

async function parseError(response: Response, fallback: string) {
  return parseApiError(response, fallback);
}

export interface CreateOrganizationMemberUserPayload {
  nome: string;
  sobrenome: string;
  email: string;
  senha: string;
  roleId: string;
}

export async function createOrganizationMemberUser(
  organizationId: string,
  payload: CreateOrganizationMemberUserPayload,
) {
  const response = await fetch(
    `/api/backend/organization/${organizationId}/members/create-user`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    await parseError(response, 'Falha ao criar usuário');
  }

  return response.json();
}

export async function removeOrganizationMember(organizationId: string, memberId: string) {
  const response = await fetch(
    `/api/backend/organization/${organizationId}/members/${memberId}`,
    { method: 'DELETE' },
  );

  if (!response.ok) {
    await parseError(response, 'Falha ao bloquear usuário');
  }

  return response.json();
}

export interface CreateOrganizationCompanyPayload {
  cnpj: string;
  razaoSocial: string;
}

export async function createOrganizationCompany(
  organizationId: string,
  payload: CreateOrganizationCompanyPayload,
) {
  const response = await fetch(`/api/backend/organization/${organizationId}/companies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    await parseError(response, 'Falha ao criar empresa');
  }

  return response.json();
}

export interface UpdateOrganizationCompanyPayload {
  razaoSocial?: string;
  status?: 'active' | 'inactive';
}

export async function getOrganizationCompanyCertificates(
  organizationId: string,
  companyId: string,
  page = 1,
  perPage = 50,
): Promise<OrganizationCompanyCertificatesResponse> {
  const params = new URLSearchParams({
    page: String(page),
    perPage: String(perPage),
  });

  const response = await fetch(
    `/api/backend/organization/${organizationId}/companies/${companyId}/certificates?${params.toString()}`,
  );

  if (!response.ok) {
    await parseError(response, 'Falha ao carregar certificados');
  }

  return response.json();
}

export interface UploadOrganizationCompanyCertificatePayload {
  certificate: File;
  password: string;
  name?: string;
  description?: string;
  status?: 'active' | 'inactive';
}

export async function uploadOrganizationCompanyCertificate(
  organizationId: string,
  companyId: string,
  payload: UploadOrganizationCompanyCertificatePayload,
) {
  const formData = new FormData();
  formData.append('certificate', payload.certificate);
  formData.append('password', payload.password);

  if (payload.name) {
    formData.append('name', payload.name);
  }

  if (payload.description) {
    formData.append('description', payload.description);
  }

  if (payload.status) {
    formData.append('status', payload.status);
  }

  const response = await fetch(
    `/api/backend/organization/${organizationId}/companies/${companyId}/certificates/upload`,
    {
      method: 'POST',
      body: formData,
    },
  );

  if (!response.ok) {
    await parseError(response, 'Falha ao enviar certificado');
  }

  return response.json();
}

export async function updateOrganizationCompany(
  organizationId: string,
  companyId: string,
  payload: UpdateOrganizationCompanyPayload,
) {
  const response = await fetch(
    `/api/backend/organization/${organizationId}/companies/${companyId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    await parseError(response, 'Falha ao atualizar empresa');
  }

  return response.json();
}

export interface CreateOrganizationRolePayload {
  nome: string;
  slug: string;
}

export async function createOrganizationRole(
  organizationId: string,
  payload: CreateOrganizationRolePayload,
) {
  const response = await fetch(`/api/backend/organization/${organizationId}/roles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    await parseError(response, 'Falha ao criar perfil');
  }

  return response.json();
}

export async function updateOrganizationRolePermissions(
  organizationId: string,
  roleId: string,
  permissions: string[],
) {
  const response = await fetch(
    `/api/backend/organization/${organizationId}/roles/${roleId}/permissions`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions }),
    },
  );

  if (!response.ok) {
    await parseError(response, 'Falha ao atualizar perfil');
  }

  return response.json();
}

