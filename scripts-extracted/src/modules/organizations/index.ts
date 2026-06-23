import type { FastifyInstance } from "fastify";
import { organizationRoutes } from "./routes/organization.routes.js";

export async function organizationsModule(fastify: FastifyInstance) {
  await fastify.register(organizationRoutes);
}
