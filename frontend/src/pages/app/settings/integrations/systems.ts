export interface IntegrationSystem {
  id: string;
  name: string;
  description: string;
  integrationType: string;
  logoSrc?: string;
  logoText: string;
  logoClassName: string;
  supported: boolean;
}

export const integrationSystems: IntegrationSystem[] = [
  {
    id: 'sap',
    name: 'SAP ERP',
    description: 'Integração via SAP CPI (OAuth2 client credentials).',
    integrationType: 'sap_cpi',
    logoSrc: '/logos/sap.svg',
    logoText: 'SAP',
    logoClassName: 'bg-blue-600 text-white',
    supported: true
  },
  {
    id: 'c4c',
    name: 'SAP C4C',
    description: 'SAP Cloud for Customer.',
    integrationType: 'c4c',
    logoSrc: '/logos/sap.svg',
    logoText: 'C4C',
    logoClassName: 'bg-sky-600 text-white',
    supported: false
  },
  {
    id: 'vtex',
    name: 'VTEX',
    description: 'Plataforma de e-commerce VTEX.',
    integrationType: 'vtex',
    logoSrc: '/logos/vtex.svg',
    logoText: 'VTEX',
    logoClassName: 'bg-pink-600 text-white',
    supported: false
  },
  {
    id: 'salesforce',
    name: 'Salesforce',
    description: 'CRM Salesforce.',
    integrationType: 'salesforce',
    logoSrc: '/logos/salesforce.svg',
    logoText: 'SF',
    logoClassName: 'bg-cyan-600 text-white',
    supported: false
  }
];
