import { cpSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src", "i18n", "locales");
const dest = join(root, "dist", "i18n", "locales");

if (existsSync(src)) {
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
}

const sapFixturesSrc = join(root, "src", "integrations", "sap", "fixtures");
const sapFixturesDest = join(root, "dist", "integrations", "sap", "fixtures");
if (existsSync(sapFixturesSrc)) {
  mkdirSync(dirname(sapFixturesDest), { recursive: true });
  cpSync(sapFixturesSrc, sapFixturesDest, { recursive: true });
}
