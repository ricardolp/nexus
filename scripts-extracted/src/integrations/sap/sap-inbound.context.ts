import type { Env } from "../../config/env.js";
import type { DbConn } from "../cpi/cpi-credentials.service.js";

export type SapInboundAdapterContext = {
  db: DbConn;
  env: Env;
  organizationId: string;
  integrationLog?: {
    nfeDocumentId?: string;
    correlationId?: string;
  };
};
