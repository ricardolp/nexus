import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { AppError } from "../../../common/http/errors.js";
import { sendSuccess } from "../../../common/http/responses.js";
import { importNfeDocument } from "../services/nfe-import.service.js";

const importFieldsSchema = z.object({
  companyId: z.string().uuid().optional(),
});

export async function importNfeDocumentHandler(request: FastifyRequest, reply: FastifyReply) {
  const organizationId = request.organizationContext!.organizationId;
  const userId = request.user.sub;

  let fileBuf: Buffer | null = null;
  let fileName = "nfe.xml";
  const fields: Record<string, string> = {};

  for await (const part of request.parts()) {
    if (part.type === "file") {
      fileBuf = await part.toBuffer();
      fileName = part.filename ?? fileName;
      const lower = fileName.toLowerCase();
      if (!lower.endsWith(".xml")) {
        throw new AppError("nfe_xml_invalid", 400);
      }
    } else {
      fields[part.fieldname] = String(part.value ?? "");
    }
  }

  if (!fileBuf || fileBuf.length === 0) {
    throw new AppError("nfe_xml_invalid", 400);
  }

  const meta = importFieldsSchema.safeParse({
    companyId: fields.companyId?.trim() || undefined,
  });
  if (!meta.success) throw meta.error;

  const result = await importNfeDocument(request.server, {
    organizationId,
    companyId: meta.data.companyId,
    xmlBuffer: fileBuf,
    fileName,
    triggeredByUserId: userId,
  });

  return sendSuccess(reply, result, 201);
}
