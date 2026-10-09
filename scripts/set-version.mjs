import { readFile, writeFile } from "node:fs/promises";

// Incrémenter uniquement cette constante à chaque publication.
const APP_VERSION = "11";
const root = new URL("../", import.meta.url);
const files = ["dist/index.html", "dist/baremes.html", "dist/app.js", "dist/baremes.js", "dist/service-worker.js"];

for (const relativePath of files) {
  const url = new URL(relativePath, root);
  let content = await readFile(url, "utf8");
  content = content
    .replace(/(styles\.css\?v=)\d+/g, `$1${APP_VERSION}`)
    .replace(/(overrides\.css\?v=)\d+/g, `$1${APP_VERSION}`)
    .replace(/(baremes\.css\?v=)\d+/g, `$1${APP_VERSION}`)
    .replace(/(baremes-defaut\.js\?v=)\d+/g, `$1${APP_VERSION}`)
    .replace(/(app\.js\?v=)\d+/g, `$1${APP_VERSION}`)
    .replace(/(baremes\.js\?v=)\d+/g, `$1${APP_VERSION}`)
    .replace(/(service-worker\.js\?v=)\d+/g, `$1${APP_VERSION}`)
    .replace(/scanfac-static-v\d+/g, `scanfac-static-v${APP_VERSION}`);
  await writeFile(url, content);
}

console.log(`ScanFac version ${APP_VERSION} appliquée.`);
