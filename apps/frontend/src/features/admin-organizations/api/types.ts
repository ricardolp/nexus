export interface Organization {
  id: string;
  nome: string;
  slug: string;
  logo?: string | null;
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
  logo?: string | null;
}

export interface UpdateOrganizationPayload {
  nome: string;
  slug: string;
  logo?: string | null;
}

export interface OrganizationSettings {
  id: string;
  organizationId: string;
  maxCompanies: number;
}

export interface UpdateOrganizationSettingsPayload {
  maxCompanies: number;
}

export interface OrganizationUsageFilters {
  from?: string;
  to?: string;
}

export interface OrganizationUsageSummaryItem {
  organizationId: string;
  nome: string;
  slug: string;
  companies: number;
  members: number;
  nfeEmitted: number;
  nfseEmitted: number;
  emittedTotal: number;
  documentsTotal: number;
  eventsTotal: number;
  integrationRequests: number;
  webhookDeliveries: number;
}

export interface OrganizationUsageList {
  period: {
    from: string | null;
    to: string | null;
  };
  totals: {
    organizations: number;
    companies: number;
    members: number;
    nfeEmitted: number;
    nfseEmitted: number;
    emittedTotal: number;
    documentsTotal: number;
    eventsTotal: number;
    integrationRequests: number;
    webhookDeliveries: number;
  };
  items: OrganizationUsageSummaryItem[];
}

export interface OrganizationUsage {
  organizationId: string;
  period: {
    from: string | null;
    to: string | null;
  };
  resources: {
    companies: number;
    members: number;
    certificates: number;
  };
  documents: {
    nfe: {
      total: number;
      emitted: number;
      byDirection: Record<string, number>;
      byStatus: Record<string, number>;
      byModel: Record<string, number>;
    };
    nfse: {
      total: number;
      emitted: number;
      byDirection: Record<string, number>;
      byStatus: Record<string, number>;
    };
    total: number;
  };
  events: {
    nfe: {
      total: number;
      byType: Record<string, number>;
    };
    nfse: {
      total: number;
      byType: Record<string, number>;
    };
    total: number;
  };
  integration: {
    requestLogs: number;
    byOperation: Record<string, number>;
    webhookDeliveries: number;
  };
}
