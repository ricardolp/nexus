import { existsSync } from "fs";
import fp from "fastify-plugin";
import i18next from "i18next";
import Backend from "i18next-fs-backend";
import { join } from "path";
import type { FastifyRequest } from "fastify";

function localesLoadPath(): string {
  const distDir = join(process.cwd(), "dist", "i18n", "locales");
  const srcDir = join(process.cwd(), "src", "i18n", "locales");
  const useDist =
    process.env.NODE_ENV === "production" && existsSync(distDir);
  const base = useDist ? distDir : srcDir;
  return join(base, "{{lng}}", "{{ns}}.json");
}

export default fp(async (fastify) => {
  await i18next.use(Backend).init({
    lng: "pt",
    fallbackLng: "pt",
    supportedLngs: ["pt", "en"],
    preload: ["pt", "en"],
    ns: ["translation"],
    defaultNS: "translation",
    backend: {
      loadPath: localesLoadPath(),
    },
  });

  fastify.decorateRequest("t", null as unknown as FastifyRequest["t"]);

  fastify.addHook("onRequest", async (request: FastifyRequest) => {
    const lng = pickLocale(request);
    request.t = i18next.getFixedT(lng);
  });
});

function pickLocale(request: FastifyRequest): string {
  const x = request.headers["x-locale"];
  if (typeof x === "string" && (x === "pt" || x === "en")) return x;
  const accept = request.headers["accept-language"];
  if (typeof accept === "string") {
    const first = accept.split(",")[0]?.trim().split("-")[0]?.toLowerCase();
    if (first === "en" || first === "pt") return first;
  }
  return "pt";
}
