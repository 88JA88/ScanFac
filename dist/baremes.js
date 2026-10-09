let parameters = JSON.parse(JSON.stringify(window.SCANFAC_PARAMETERS_DEFAULT));
let loadedFromFile = false;
const body = document.querySelector("#kilometrageBody");
const status = document.querySelector("#saveStatus");
const accountantEmailInput = document.querySelector("#accountantEmailSetting");
const fields = ["puissance", "jusqua5000", "coefficient", "constante", "auDela20000"];
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&":"&amp;", "<":"&gt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[char]);

function render() {
  accountantEmailInput.value = parameters.accountantEmail || "";
  body.innerHTML = parameters.kilometrage.map((row, index) => `<tr><td><input class="active-power" type="radio" name="activePower" value="${index}" ${index === Number(parameters.activePowerIndex || 0) ? "checked" : ""} aria-label="Utiliser ${escapeHtml(row.puissance)}" /></td>${fields.map(field => `<td><input data-row="${index}" data-field="${field}" value="${escapeHtml(row[field])}" aria-label="${field}" /></td>`).join("")}</tr>`).join("");
}
function validParameters(data) { return data?.format === "scanfac-parametres" && Array.isArray(data.kilometrage); }
function folderDb() { return new Promise((resolve, reject) => { const request = indexedDB.open("scanfac-local", 1); request.onupgradeneeded = () => request.result.createObjectStore("handles"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function storedFolder() { try { const db = await folderDb(); return await new Promise((resolve, reject) => { const request = db.transaction("handles", "readonly").objectStore("handles").get("data-folder"); request.onsuccess = () => { db.close(); resolve(request.result || null); }; request.onerror = () => { db.close(); reject(request.error); }; }); } catch { return null; } }
async function canRead(handle) { return handle && (await handle.queryPermission({ mode: "read" })) === "granted"; }
async function canWrite(handle) { return handle && ((await handle.queryPermission({ mode: "readwrite" })) === "granted" || (await handle.requestPermission({ mode: "readwrite" })) === "granted"); }
async function loadSavedParameters() {
  try { const folder = await storedFolder(); if (!await canRead(folder)) return false; const file = await folder.getFileHandle("scanfac-parametres.json"); const data = JSON.parse(await (await file.getFile()).text()); if (validParameters(data)) { parameters = data; loadedFromFile = true; render(); status.textContent = "Paramètres enregistrés chargés."; return true; } } catch { /* Les valeurs par défaut restent affichées. */ }
  return false;
}
async function saveParameters() {
  const content = JSON.stringify(parameters, null, 2), folder = await storedFolder();
  try {
    if (await canWrite(folder)) {
      if (!loadedFromFile) { try { const file = await folder.getFileHandle("scanfac-parametres.json"); const data = JSON.parse(await (await file.getFile()).text()); if (validParameters(data)) { parameters = data; loadedFromFile = true; render(); status.textContent = "Paramètres existants chargés. Vérifiez-les puis cliquez à nouveau sur Enregistrer."; return; } } catch { /* Premier enregistrement : le fichier n’existe pas encore. */ } }
      const file = await folder.getFileHandle("scanfac-parametres.json", { create: true }); const writable = await file.createWritable(); await writable.write(content); await writable.close(); loadedFromFile = true; status.textContent = "Paramètres enregistrés."; return;
    }
    if ("showSaveFilePicker" in window) { const file = await window.showSaveFilePicker({ suggestedName: "scanfac-parametres.json", types: [{ description: "Paramètres ScanFac", accept: { "application/json": [".json"] } }] }); const writable = await file.createWritable(); await writable.write(content); await writable.close(); status.textContent = "Paramètres enregistrés."; return; }
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([content], { type: "application/json" })); link.download = "scanfac-parametres.json"; link.click(); URL.revokeObjectURL(link.href); status.textContent = "Paramètres téléchargés.";
  } catch (error) { if (error.name !== "AbortError") status.textContent = "Impossible d’enregistrer les paramètres."; }
}

body.addEventListener("input", event => { const input = event.target; if (input.dataset.row === undefined) return; parameters.kilometrage[Number(input.dataset.row)][input.dataset.field] = input.value; status.textContent = ""; });
body.addEventListener("change", event => { const input = event.target; if (!input.matches(".active-power")) return; parameters.activePowerIndex = Number(input.value); status.textContent = ""; });
accountantEmailInput.addEventListener("input", () => { parameters.accountantEmail = accountantEmailInput.value.trim(); status.textContent = ""; });
document.querySelector("#saveParameters").addEventListener("click", saveParameters);
document.querySelector("#restoreDefaults").addEventListener("click", () => { if (!confirm("Rétablir les valeurs par défaut ? Les modifications non enregistrées seront perdues.")) return; parameters = JSON.parse(JSON.stringify(window.SCANFAC_PARAMETERS_DEFAULT)); render(); status.textContent = "Valeurs par défaut rétablies."; });
render(); loadSavedParameters();
if ("serviceWorker" in navigator && location.protocol !== "file:") window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js?v=7").catch(() => {}));
