import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../../common/http/errors.js";
import { organizationCompanySettings } from "../../../db/schema.js";
import { assertCompanyInOrganization } from "./organization-company.service.js";

const defaultFlags = {
  isNfseInboundActive: false,
  isNfseOutboundActive: false,
  isNfeInboundActive: false,
  isNfeOutboundActive: false,
  sendDanfeToApproveOutbound: false,
  sendXmlToApproveOutbound: false,
  sendXmlToCancelOutbound: false,
  sendXmlToCceOutbound: false,
} as const;

export type OrganizationCompanySettingsPublic = {
  id: string | null;
  organizationCompanyId: string;
  isNfseInboundActive: boolean;
  isNfseOutboundActive: boolean;
  isNfeInboundActive: boolean;
  isNfeOutboundActive: boolean;
  sendDanfeToApproveOutbound: boolean;
  sendXmlToApproveOutbound: boolean;
  sendXmlToCancelOutbound: boolean;
  sendXmlToCceOutbound: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
};

function toPublic(
  companyId: string,
  row: {
    id: string;
    organizationCompanyId: string;
    isNfseInboundActive: boolean;
    isNfseOutboundActive: boolean;
    isNfeInboundActive: boolean;
    isNfeOutboundActive: boolean;
    sendDanfeToApproveOutbound: boolean;
    sendXmlToApproveOutbound: boolean;
    sendXmlToCancelOutbound: boolean;
    sendXmlToCceOutbound: boolean;
    createdAt: Date;
    updatedAt: Date;
  } | undefined
): OrganizationCompanySettingsPublic {
  if (!row) {
    return {
      id: null,
      organizationCompanyId: companyId,
      ...defaultFlags,
      createdAt: null,
      updatedAt: null,
    };
  }
  return {
    id: row.id,
    organizationCompanyId: row.organizationCompanyId,
    isNfseInboundActive: row.isNfseInboundActive,
    isNfseOutboundActive: row.isNfseOutboundActive,
    isNfeInboundActive: row.isNfeInboundActive,
    isNfeOutboundActive: row.isNfeOutboundActive,
    sendDanfeToApproveOutbound: row.sendDanfeToApproveOutbound,
    sendXmlToApproveOutbound: row.sendXmlToApproveOutbound,
    sendXmlToCancelOutbound: row.sendXmlToCancelOutbound,
    sendXmlToCceOutbound: row.sendXmlToCceOutbound,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getOrganizationCompanySettings(
  fastify: FastifyInstance,
  organizationId: string,
  companyId: string
): Promise<OrganizationCompanySettingsPublic> {
  await assertCompanyInOrganization(fastify, organizationId, companyId);
  const [row] = await fastify.db
    .select({
      id: organizationCompanySettings.id,
      organizationCompanyId: organizationCompanySettings.organizationCompanyId,
      isNfseInboundActive: organizationCompanySettings.isNfseInboundActive,
      isNfseOutboundActive: organizationCompanySettings.isNfseOutboundActive,
      isNfeInboundActive: organizationCompanySettings.isNfeInboundActive,
      isNfeOutboundActive: organizationCompanySettings.isNfeOutboundActive,
      sendDanfeToApproveOutbound: organizationCompanySettings.sendDanfeToApproveOutbound,
      sendXmlToApproveOutbound: organizationCompanySettings.sendXmlToApproveOutbound,
      sendXmlToCancelOutbound: organizationCompanySettings.sendXmlToCancelOutbound,
      sendXmlToCceOutbound: organizationCompanySettings.sendXmlToCceOutbound,
      createdAt: organizationCompanySettings.createdAt,
      updatedAt: organizationCompanySettings.updatedAt,
    })
    .from(organizationCompanySettings)
    .where(eq(organizationCompanySettings.organizationCompanyId, companyId))
    .limit(1);
  return toPublic(companyId, row);
}

export async function patchOrganizationCompanySettings(
  fastify: FastifyInstance,
  organizationId: string,
  companyId: string,
  input: {
    isNfseInboundActive?: boolean;
    isNfseOutboundActive?: boolean;
    isNfeInboundActive?: boolean;
    isNfeOutboundActive?: boolean;
    sendDanfeToApproveOutbound?: boolean;
    sendXmlToApproveOutbound?: boolean;
    sendXmlToCancelOutbound?: boolean;
    sendXmlToCceOutbound?: boolean;
  }
): Promise<OrganizationCompanySettingsPublic> {
  const existing = await getOrganizationCompanySettings(fastify, organizationId, companyId);
  const now = new Date();

  const merged = {
    isNfseInboundActive:
      input.isNfseInboundActive ?? existing.isNfseInboundActive,
    isNfseOutboundActive:
      input.isNfseOutboundActive ?? existing.isNfseOutboundActive,
    isNfeInboundActive: input.isNfeInboundActive ?? existing.isNfeInboundActive,
    isNfeOutboundActive: input.isNfeOutboundActive ?? existing.isNfeOutboundActive,
    sendDanfeToApproveOutbound:
      input.sendDanfeToApproveOutbound ?? existing.sendDanfeToApproveOutbound,
    sendXmlToApproveOutbound:
      input.sendXmlToApproveOutbound ?? existing.sendXmlToApproveOutbound,
    sendXmlToCancelOutbound:
      input.sendXmlToCancelOutbound ?? existing.sendXmlToCancelOutbound,
    sendXmlToCceOutbound: input.sendXmlToCceOutbound ?? existing.sendXmlToCceOutbound,
  };

  if (existing.id === null) {
    const [inserted] = await fastify.db
      .insert(organizationCompanySettings)
      .values({
        organizationCompanyId: companyId,
        ...merged,
        createdAt: now,
        updatedAt: now,
      })
      .returning({
        id: organizationCompanySettings.id,
        organizationCompanyId: organizationCompanySettings.organizationCompanyId,
        isNfseInboundActive: organizationCompanySettings.isNfseInboundActive,
        isNfseOutboundActive: organizationCompanySettings.isNfseOutboundActive,
        isNfeInboundActive: organizationCompanySettings.isNfeInboundActive,
        isNfeOutboundActive: organizationCompanySettings.isNfeOutboundActive,
        sendDanfeToApproveOutbound: organizationCompanySettings.sendDanfeToApproveOutbound,
        sendXmlToApproveOutbound: organizationCompanySettings.sendXmlToApproveOutbound,
        sendXmlToCancelOutbound: organizationCompanySettings.sendXmlToCancelOutbound,
        sendXmlToCceOutbound: organizationCompanySettings.sendXmlToCceOutbound,
        createdAt: organizationCompanySettings.createdAt,
        updatedAt: organizationCompanySettings.updatedAt,
      });
    if (!inserted) throw new AppError("internal_error", 500);
    return toPublic(companyId, inserted);
  }

  const [updated] = await fastify.db
    .update(organizationCompanySettings)
    .set({ ...merged, updatedAt: now })
    .where(eq(organizationCompanySettings.organizationCompanyId, companyId))
    .returning({
      id: organizationCompanySettings.id,
      organizationCompanyId: organizationCompanySettings.organizationCompanyId,
      isNfseInboundActive: organizationCompanySettings.isNfseInboundActive,
      isNfseOutboundActive: organizationCompanySettings.isNfseOutboundActive,
      isNfeInboundActive: organizationCompanySettings.isNfeInboundActive,
      isNfeOutboundActive: organizationCompanySettings.isNfeOutboundActive,
      sendDanfeToApproveOutbound: organizationCompanySettings.sendDanfeToApproveOutbound,
      sendXmlToApproveOutbound: organizationCompanySettings.sendXmlToApproveOutbound,
      sendXmlToCancelOutbound: organizationCompanySettings.sendXmlToCancelOutbound,
      sendXmlToCceOutbound: organizationCompanySettings.sendXmlToCceOutbound,
      createdAt: organizationCompanySettings.createdAt,
      updatedAt: organizationCompanySettings.updatedAt,
    });
  if (!updated) throw new AppError("internal_error", 500);
  return toPublic(companyId, updated);
}
