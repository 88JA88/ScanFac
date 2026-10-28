import { readFile, writeFile } from "node:fs/promises";

// Chaque déploiement reçoit l'identifiant unique de son commit : le navigateur
// ne peut donc pas confondre son cache avec une version antérieure.
const APP_VERSION = process.env.GITHUB_SHA?.slice(0, 12) || "local";
const root = new URL("../", import.meta.url);
const files = ["dist/index.html", "dist/baremes.html", "dist/app.js", "dist/baremes.js", "dist/service-worker.js"];

for (const relativePath of files) {
  const url = new URL(relativePath, root);
  let content = await readFile(url, "utf8");
  content = content
    .replace(/(styles\.css\?v=)[a-zA-Z0-9_-]+/g, `$1${APP_VERSION}`)
    .replace(/(overrides\.css\?v=)[a-zA-Z0-9_-]+/g, `$1${APP_VERSION}`)
    .replace(/(baremes\.css\?v=)[a-zA-Z0-9_-]+/g, `$1${APP_VERSION}`)
    .replace(/(baremes-defaut\.js\?v=)[a-zA-Z0-9_-]+/g, `$1${APP_VERSION}`)
    .replace(/(app\.js\?v=)[a-zA-Z0-9_-]+/g, `$1${APP_VERSION}`)
    .replace(/(baremes\.js\?v=)[a-zA-Z0-9_-]+/g, `$1${APP_VERSION}`)
    .replace(/(service-worker\.js\?v=)[a-zA-Z0-9_-]+/g, `$1${APP_VERSION}`)
    .replace(/scanfac-static-v[a-zA-Z0-9_-]+/g, `scanfac-static-v${APP_VERSION}`);
  await writeFile(url, content);
}

console.log(`ScanFac version ${APP_VERSION} appliquée.`);
