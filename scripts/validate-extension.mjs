import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const extensionRoot = resolve(projectRoot, "extension");
const manifestPath = resolve(extensionRoot, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

if (manifest.manifest_version !== 3) throw new Error("The extension must use Manifest V3.");
if (!manifest.browser_specific_settings?.gecko?.id) throw new Error("Firefox requires an extension ID for signing.");
if (manifest.host_permissions?.length) throw new Error("SafeMind must not request host permissions.");

const allowedPermissions = new Set(["storage"]);
for (const permission of manifest.permissions || []) {
  if (!allowedPermissions.has(permission)) throw new Error(`Unexpected extension permission: ${permission}`);
}

const requiredFiles = [
  manifest.action?.default_popup,
  manifest.options_ui?.page,
  ...Object.values(manifest.icons || {}),
  "popup/popup.css",
  "popup/popup.js",
  "options/options.css",
  "options/options.js"
].filter(Boolean);

await Promise.all(requiredFiles.map((path) => access(resolve(extensionRoot, path))));

for (const script of ["popup/popup.js", "options/options.js"]) {
  const source = await readFile(resolve(extensionRoot, script), "utf8");
  if (/\beval\s*\(|\.innerHTML\s*=|document\.write\s*\(/.test(source)) {
    throw new Error(`Unsafe JavaScript pattern found in ${script}.`);
  }
}

console.log("SafeMind extension manifest, permissions, assets, and scripts are valid.");
