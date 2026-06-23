import type { FastifyReply } from "fastify";

export function sendSuccess<T>(reply: FastifyReply, data: T, statusCode = 200) {
  return reply.status(statusCode).send({ success: true, data });
}

export function sendError(
  reply: FastifyReply,
  code: string,
  statusCode: number,
  message?: string
) {
  return reply.status(statusCode).send({ success: false, code, message });
}
