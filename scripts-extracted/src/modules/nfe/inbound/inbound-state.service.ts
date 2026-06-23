import { eq, max } from "drizzle-orm";
import type { Db } from "../../../db/client.js";
import {
  nfeDocumentEvents,
  nfeDocumentTimeline,
  nfeInboundProcess,
  type nfeEventTypeEnum,
} from "../../../db/nfe-schema.js";
import { AppError } from "../../../common/http/errors.js";
import {
  canTransitionInbound,
  INBOUND_STATUS_LABELS,
  type NfeInboundStatus,
} from "./inbound-status.js";

type DbTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0];
type DbConn = Db | DbTransaction;

type NfeEventType = (typeof nfeEventTypeEnum.enumValues)[number];

export type TransitionInboundInput = {
  nfeDocumentId: string;
  to: NfeInboundStatus;
  eventType?: NfeEventType;
  title: string;
  message?: string;
  source?: "system" | "user" | "sefaz" | "sap" | "webhook" | "job" | "api";
  triggeredByUserId?: string;
  correlationId?: string;
  requestSummary?: Record<string, unknown>;
  responseSummary?: Record<string, unknown>;
  patchProcess?: Partial<{
    sefazValidatedAt: Date;
    pedidoValidatedAt: Date;
    deliveryCreatedAt: Date;
    portariaConfirmedAt: Date;
    portariaConfirmedByUserId: string;
    migoCompletedAt: Date;
    miroCompletedAt: Date;
    rejectedAt: Date;
    rejectedByUserId: string;
    rejectionReason: string;
    alertCode: string | null;
    alertMessage: string | null;
    correlationId: string;
  }>;
};

async function nextEventSequence(db: DbConn, nfeDocumentId: string): Promise<number> {
  const [row] = await db
    .select({ maxSeq: max(nfeDocumentEvents.sequence) })
    .from(nfeDocumentEvents)
    .where(eq(nfeDocumentEvents.nfeDocumentId, nfeDocumentId));
  return (row?.maxSeq ?? 0) + 1;
}

export async function getInboundProcess(db: DbConn, nfeDocumentId: string) {
  const [row] = await db
    .select()
    .from(nfeInboundProcess)
    .where(eq(nfeInboundProcess.nfeDocumentId, nfeDocumentId))
    .limit(1);
  return row ?? null;
}

export async function transitionInboundStatus(
  db: DbConn,
  input: TransitionInboundInput
): Promise<{ inboundStatus: NfeInboundStatus }> {
  const process = await getInboundProcess(db, input.nfeDocumentId);
  if (!process) {
    throw new AppError("nfe_inbound_process_not_found", 404);
  }

  const from = process.inboundStatus as NfeInboundStatus;
  if (from === input.to) {
    return { inboundStatus: from };
  }

  if (!canTransitionInbound(from, input.to)) {
    throw new AppError("nfe_inbound_invalid_transition", 409);
  }

  const now = new Date();
  const eventType: NfeEventType = input.eventType ?? "inbound_status_change";

  const [event] = await db
    .insert(nfeDocumentEvents)
    .values({
      nfeDocumentId: input.nfeDocumentId,
      eventType,
      eventStatus: "accepted",
      sequence: await nextEventSequence(db, input.nfeDocumentId),
      correlationId: input.correlationId ?? null,
      requestSummary: input.requestSummary ?? null,
      responseSummary: input.responseSummary ?? null,
      triggeredByUserId: input.triggeredByUserId ?? null,
      startedAt: now,
      completedAt: now,
    })
    .returning({ id: nfeDocumentEvents.id });

  await db.insert(nfeDocumentTimeline).values({
    nfeDocumentId: input.nfeDocumentId,
    nfeDocumentEventId: event!.id,
    source: input.source ?? "system",
    title: input.title,
    message:
      input.message ??
      `${INBOUND_STATUS_LABELS[from]} → ${INBOUND_STATUS_LABELS[input.to]}`,
    createdByUserId: input.triggeredByUserId ?? null,
  });

  await db
    .update(nfeInboundProcess)
    .set({
      inboundStatus: input.to,
      statusChangedAt: now,
      updatedAt: now,
      ...(input.patchProcess ?? {}),
    })
    .where(eq(nfeInboundProcess.nfeDocumentId, input.nfeDocumentId));

  return { inboundStatus: input.to };
}

export async function createInboundProcess(
  db: DbConn,
  nfeDocumentId: string,
  correlationId?: string
) {
  const [row] = await db
    .insert(nfeInboundProcess)
    .values({
      nfeDocumentId,
      inboundStatus: "xml_imported",
      correlationId: correlationId ?? null,
    })
    .returning();
  return row!;
}
