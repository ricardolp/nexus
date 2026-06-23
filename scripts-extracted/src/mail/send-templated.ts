import { readFile } from "fs/promises";
import { join } from "path";
import handlebars from "handlebars";
import type { Env } from "../config/env.js";
import type { EmailJobPayload } from "../workers/email.queue.js";
import { createMailTransporter } from "./transporter.js";

const subjects: Record<EmailJobPayload["template"], string> = {
  welcome: "Bem-vindo",
  "password-reset": "Recuperação de senha",
  "nfe-inbound-rejected": "NF-e não reconhecida",
};

export function emailSubjectForTemplate(template: EmailJobPayload["template"]): string {
  return subjects[template];
}

export async function sendTemplatedEmail(env: Env, payload: EmailJobPayload) {
  const templatePath = join(
    process.cwd(),
    "emails",
    "templates",
    `${payload.template}.hbs`
  );
  const raw = await readFile(templatePath, "utf-8");
  const compiled = handlebars.compile(raw);
  const html = compiled(payload.vars);

  const transporter = createMailTransporter(env);
  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: payload.to,
    subject: emailSubjectForTemplate(payload.template),
    html,
  });
}
