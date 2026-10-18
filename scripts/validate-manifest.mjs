import Ajv from "ajv";
import { readFile, access } from "node:fs/promises";
const url =
  "https://raw.githubusercontent.com/overwolf/community-gists/master/overwolf-manifest-schema.json";
const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
if (!response.ok)
  throw new Error(`Cannot retrieve official schema: ${response.status}`);
const validate = new Ajv({
  strict: false,
  allErrors: true,
  validateFormats: false,
}).compile(await response.json());
const manifest = JSON.parse(await readFile("dist/manifest.json", "utf8"));
if (!validate(manifest))
  throw new Error(JSON.stringify(validate.errors, null, 2));
for (const path of [
  manifest.meta.icon,
  manifest.meta.icon_gray,
  manifest.meta.launcher_icon,
  manifest.meta.window_icon,
  ...Object.values(manifest.data.windows).map((w) => w.file),
])
  await access(`dist/${path}`);
console.log(
  "Overwolf manifest passes the official schema; all declared assets and windows exist.",
);
