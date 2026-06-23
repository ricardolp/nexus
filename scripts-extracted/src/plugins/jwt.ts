import jwt from "@fastify/jwt";
import fp from "fastify-plugin";
import type { Env } from "../config/env.js";

export default fp<{ env: Env }>(async (fastify, opts) => {
  await fastify.register(jwt, {
    secret: opts.env.JWT_SECRET,
    sign: { expiresIn: opts.env.JWT_EXPIRES_IN },
  });
});
