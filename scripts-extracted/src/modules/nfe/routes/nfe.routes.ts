import type { FastifyInstance } from "fastify";
import { requireScope } from "../../organizations/middleware/require-scope.middleware.js";
import { getNfeDashboardHandler } from "../handlers/nfe-dashboard.handler.js";
import {
  getNfeDocumentHandler,
  getNfeDocumentsSummaryHandler,
  listNfeDocumentsHandler,
} from "../handlers/nfe-document.handler.js";
import { getNfeRecentEventsHandler } from "../handlers/nfe-events.handler.js";
import { importNfeDocumentHandler } from "../handlers/nfe-import.handler.js";
import {
  confirmPortariaHandler,
  registerMigoHandler,
  rejectInboundHandler,
  reprocessInboundHandler,
  retrySapStepHandler,
} from "../handlers/nfe-inbound.handler.js";

export async function registerNfeRoutes(scope: FastifyInstance) {
  scope.get(
    "/nfe/dashboard",
    { preHandler: [requireScope("nfe:read")] },
    getNfeDashboardHandler
  );

  scope.get(
    "/nfe/events/recent",
    { preHandler: [requireScope("nfe:read")] },
    getNfeRecentEventsHandler
  );

  scope.get(
    "/nfe/summary",
    { preHandler: [requireScope("nfe:read")] },
    getNfeDocumentsSummaryHandler
  );

  scope.get("/nfe/documents", { preHandler: [requireScope("nfe:read")] }, listNfeDocumentsHandler);

  scope.get(
    "/nfe/documents/:documentId",
    { preHandler: [requireScope("nfe:read")] },
    getNfeDocumentHandler
  );

  scope.post(
    "/nfe/import/documents",
    { preHandler: [requireScope("nfe:import")] },
    importNfeDocumentHandler
  );

  scope.post(
    "/nfe/documents/:documentId/confirm-portaria",
    { preHandler: [requireScope("nfe:update")] },
    confirmPortariaHandler
  );

  scope.post(
    "/nfe/documents/:documentId/register-migo",
    { preHandler: [requireScope("nfe:update")] },
    registerMigoHandler
  );

  scope.post(
    "/nfe/documents/:documentId/reject",
    { preHandler: [requireScope("nfe:update")] },
    rejectInboundHandler
  );

  scope.post(
    "/nfe/documents/:documentId/retry-sap-step",
    { preHandler: [requireScope("nfe:update")] },
    retrySapStepHandler
  );

  scope.post(
    "/nfe/documents/:documentId/reprocess-inbound",
    { preHandler: [requireScope("nfe:update")] },
    reprocessInboundHandler
  );
}
