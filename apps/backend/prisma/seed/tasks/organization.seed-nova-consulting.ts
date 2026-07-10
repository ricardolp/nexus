import { createHash, randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import {
  ALL_ORG_ROLE_PERMISSIONS,
  DEFAULT_ORGANIZATION_TI_ROLE,
  INTEGRATION_API_SCOPES,
} from '@nexus/shared';

export const NOVA_CONSULTING = {
  slug: 'nova-consulting',
  nome: 'Nova Consulting',
  razaoSocial: 'Nova Consulting Nova Consultoria em Tecnologia da Informacao LTDA',
  cnpj: '35934186000130',
  address: {
    logradouro: 'Rua Jose Soares Pinto',
    numero: '440',
    bairro: 'Vila Bancaria',
    cep: '83601-520',
    municipio: 'Campo Largo',
    uf: 'PR',
    estado: 'Paraná',
    correspondencia: [
      'Nova Consulting Nova Consultoria em Tecnologia da Informacao LTDA',
      'Rua Jose Soares Pinto 440',
      'Vila Bancaria',
      'Campo Largo PR',
      '83601-520',
    ].join('\n'),
  },
} as const;

const MOCK_TOKEN_SECRET = 'nxk_live_mock_nova_consulting_seed_token_do_not_use_prod';
const MOCK_WEBHOOK_SECRET = 'whsec_mock_nova_consulting_seed';

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

function generateIdempotencyKey(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}

export async function seedNovaConsultingOrganization(
  prisma: PrismaClient,
): Promise<void> {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@nexus.local';
  const admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!admin) {
    throw new Error(
      `[seed:nova] Admin user ${adminEmail} not found. Run seedAdmin first.`,
    );
  }

  const organization = await prisma.organization.upsert({
    where: { slug: NOVA_CONSULTING.slug },
    create: {
      nome: NOVA_CONSULTING.nome,
      slug: NOVA_CONSULTING.slug,
    },
    update: {
      nome: NOVA_CONSULTING.nome,
      deleted_at: null,
    },
  });

  const company = await prisma.organizationCompany.upsert({
    where: { cnpj: NOVA_CONSULTING.cnpj },
    create: {
      organization_id: organization.id,
      cnpj: NOVA_CONSULTING.cnpj,
      razao_social: NOVA_CONSULTING.razaoSocial,
      status: 'active',
    },
    update: {
      organization_id: organization.id,
      razao_social: NOVA_CONSULTING.razaoSocial,
      status: 'active',
      deleted_at: null,
    },
  });

  await prisma.organizationSettings.upsert({
    where: { organization_id: organization.id },
    create: {
      organization_id: organization.id,
      max_companies: 5,
      integration_base_url: 'https://sap-mock.local/http',
      integration_client_id: 'nova-mock-client',
      integration_client_secret_local: 'nova-mock-secret',
      sap_client: process.env.SAP_DEFAULT_CLIENT ?? '310',
      sap_language: process.env.SAP_DEFAULT_LANGUAGE ?? 'PT',
    },
    update: {
      max_companies: 5,
      integration_base_url: 'https://sap-mock.local/http',
      integration_client_id: 'nova-mock-client',
      integration_client_secret_local: 'nova-mock-secret',
      sap_client: process.env.SAP_DEFAULT_CLIENT ?? '310',
      sap_language: process.env.SAP_DEFAULT_LANGUAGE ?? 'PT',
    },
  });

  const role = await prisma.organizationRole.upsert({
    where: {
      organization_id_slug: {
        organization_id: organization.id,
        slug: DEFAULT_ORGANIZATION_TI_ROLE.slug,
      },
    },
    create: {
      organization_id: organization.id,
      nome: DEFAULT_ORGANIZATION_TI_ROLE.nome,
      slug: DEFAULT_ORGANIZATION_TI_ROLE.slug,
    },
    update: {
      nome: DEFAULT_ORGANIZATION_TI_ROLE.nome,
      deleted_at: null,
    },
  });

  for (const permission of ALL_ORG_ROLE_PERMISSIONS) {
    await prisma.organizationRolePermission.upsert({
      where: {
        role_id_permission: {
          role_id: role.id,
          permission,
        },
      },
      create: {
        role_id: role.id,
        permission,
      },
      update: {
        deleted_at: null,
      },
    });
  }

  await prisma.organizationMember.upsert({
    where: {
      organization_id_user_id: {
        organization_id: organization.id,
        user_id: admin.id,
      },
    },
    create: {
      organization_id: organization.id,
      user_id: admin.id,
      role_id: role.id,
    },
    update: {
      role_id: role.id,
      deleted_at: null,
    },
  });

  const existingCert = await prisma.organizationCompanyCertificate.findFirst({
    where: {
      company_id: company.id,
      key_vault_cert_name: 'mock-nova-consulting-a1',
      deleted_at: null,
    },
  });
  if (!existingCert) {
    await prisma.organizationCompanyCertificate.create({
      data: {
        organization_id: organization.id,
        company_id: company.id,
        name: 'Certificado Mock Nova Consulting',
        description: 'Certificado A1 fictício para ambiente de demonstração',
        status: 'inactive',
        key_vault_cert_name: 'mock-nova-consulting-a1',
        key_vault_cert_id: 'https://mock.vault.local/certificates/mock-nova-consulting-a1',
        subject: `CN=${NOVA_CONSULTING.razaoSocial}:${NOVA_CONSULTING.cnpj}`,
        issuer: 'Mock ICP-Brasil',
        expires_at: new Date('2028-12-31T23:59:59.000Z'),
      },
    });
  }

  const tokenHash = hashToken(MOCK_TOKEN_SECRET);
  const existingToken = await prisma.integrationToken.findUnique({
    where: { token_hash: tokenHash },
  });
  if (!existingToken) {
    await prisma.integrationToken.create({
      data: {
        organization_id: organization.id,
        name: 'Mock API Token',
        token_prefix: MOCK_TOKEN_SECRET.slice(0, 16),
        token_hash: tokenHash,
        scopes: [...INTEGRATION_API_SCOPES],
        created_by_user_id: admin.id,
        expires_at: new Date('2030-01-01T00:00:00.000Z'),
      },
    });
  }

  const existingWebhook = await prisma.webhookEndpoint.findFirst({
    where: {
      organization_id: organization.id,
      url: 'https://webhook.site/mock-nova-consulting',
      deleted_at: null,
    },
  });
  if (!existingWebhook) {
    await prisma.webhookEndpoint.create({
      data: {
        organization_id: organization.id,
        url: 'https://webhook.site/mock-nova-consulting',
        description: 'Webhook mock Nova Consulting',
        secret: MOCK_WEBHOOK_SECRET,
        event_types: [
          'nfe.authorized',
          'nfe.cancelled',
          'nfe.rejected',
          'nfse.authorized',
        ],
        active: true,
        created_by_user_id: admin.id,
      },
    });
  }

  for (const environment of ['homologation', 'production'] as const) {
    const existingRange = await prisma.fiscalNfeNumberRange.findFirst({
      where: {
        company_id: company.id,
        environment,
        model: '55',
        series: 1,
        number_from: 1,
        number_to: 999999,
        deleted_at: null,
      },
    });
    if (!existingRange) {
      await prisma.fiscalNfeNumberRange.create({
        data: {
          organization_id: organization.id,
          company_id: company.id,
          environment,
          model: '55',
          series: 1,
          number_from: 1,
          number_to: 999999,
          justification: 'Faixa mock seed Nova Consulting',
          protocol: `MOCK${environment === 'homologation' ? 'H' : 'P'}001`,
          authorized_at: new Date(),
        },
      });
    }
  }

  const nfseCount = await prisma.fiscalNfseDocument.count({
    where: { company_id: company.id, deleted_at: null },
  });
  if (nfseCount === 0) {
    const recipients = [
      { document: '11222333000181', name: 'Cliente Demo Alfa Ltda' },
      { document: '22333444000192', name: 'Cliente Demo Beta S.A.' },
      { document: '33444555000103', name: 'Cliente Demo Gama ME' },
      { document: '44555666000114', name: 'Cliente Demo Delta Eireli' },
      { document: '55666777000125', name: 'Cliente Demo Épsilon Ltda' },
    ];

    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i]!;
      const issuedAt = new Date(Date.now() - (i + 1) * 86_400_000);
      await prisma.fiscalNfseDocument.create({
        data: {
          organization_id: organization.id,
          company_id: company.id,
          direction: 'outbound',
          environment: i % 2 === 0 ? 'homologation' : 'production',
          status: i === 4 ? 'draft' : 'authorized',
          model: 'NFSe',
          series: 1,
          number: 1000 + i,
          issuer_cnpj: NOVA_CONSULTING.cnpj,
          recipient_document: recipient.document,
          recipient_name: recipient.name,
          total_amount: (1500 + i * 250).toFixed(2),
          issued_at: issuedAt,
          authorized_at: i === 4 ? null : new Date(issuedAt.getTime() + 60_000),
          authorization_protocol: i === 4 ? null : `NFSE${100000 + i}`,
          service_code: '1.07',
          municipality_code: '4104204',
          service_description: 'Consultoria em tecnologia da informação',
          rps_number: 1000 + i,
          rps_series: 'RPS',
          verification_code: `MOCK${1000 + i}`,
          idempotency_key: generateIdempotencyKey(`nfse-mock-${i}`),
          metadata: {
            mock: true,
            emitente: NOVA_CONSULTING.address,
          },
        },
      });
    }
  }

  console.log(
    `[seed:nova] Organization ready: ${organization.slug} / company ${company.cnpj}`,
  );
  console.log(
    `[seed:nova] Mock integration token secret (dev only): ${MOCK_TOKEN_SECRET}`,
  );
}
