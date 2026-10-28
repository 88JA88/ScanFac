let parameters = JSON.parse(JSON.stringify(window.SCANFAC_PARAMETERS_DEFAULT));
let loadedFromFile = false;
let editingParameters = false;
const body = document.querySelector("#kilometrageBody");
const status = document.querySelector("#saveStatus");
const accountantEmailInput = document.querySelector("#accountantEmailSetting");
const editParametersButton = document.querySelector("#editParameters");
const mileageTierInputs = [...document.querySelectorAll(".mileage-tier")];
const workFolderName = document.querySelector("#workFolderName");
const backupFolderName = document.querySelector("#backupFolderName");
const csvFolderName = document.querySelector("#csvFolderName");
const WORK_FOLDER_KEY = "data-folder";
const BACKUP_FOLDER_KEY = "backup-folder";
const CSV_FOLDER_KEY = "csv-folder";
const PENDING_PARAMETERS_KEY = "scanfac-pending-parameters";
const fields = ["puissance", "jusqua5000", "coefficient", "constante", "auDela20000"];
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&":"&amp;", "<":"&gt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[char]);

function render() {
  accountantEmailInput.value = parameters.accountantEmail || "";
  mileageTierInputs.forEach(input => { input.checked = input.value === (parameters.mileageTier || "under5000"); });
  body.innerHTML = parameters.kilometrage.map((row, index) => `<tr><td><input class="active-power" type="radio" name="activePower" value="${index}" ${index === Number(parameters.activePowerIndex || 0) ? "checked" : ""} aria-label="Utiliser ${escapeHtml(row.puissance)}" /></td>${fields.map(field => `<td>${field === "puissance" || !editingParameters ? escapeHtml(row[field]) : `<input data-row="${index}" data-field="${field}" value="${escapeHtml(row[field])}" aria-label="${field}" />`}</td>`).join("")}</tr>`).join("");
  editParametersButton.textContent = editingParameters ? "Valider" : "Modifier les coefficients";
}
function validParameters(data) { return data?.format === "scanfac-parametres" && Array.isArray(data.kilometrage); }
function folderDb() { return new Promise((resolve, reject) => { const request = indexedDB.open("scanfac-local", 1); request.onupgradeneeded = () => request.result.createObjectStore("handles"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function storedHandle(key) { try { const db = await folderDb(); return await new Promise((resolve, reject) => { const request = db.transaction("handles", "readonly").objectStore("handles").get(key); request.onsuccess = () => { db.close(); resolve(request.result || null); }; request.onerror = () => { db.close(); reject(request.error); }; }); } catch { return null; } }
async function storedFolder() { return await storedHandle(WORK_FOLDER_KEY); }
async function rememberFolder(handle, key) { try { const db = await folderDb(); await new Promise((resolve, reject) => { const request = db.transaction("handles", "readwrite").objectStore("handles").put(handle, key); request.onsuccess = () => { db.close(); resolve(); }; request.onerror = () => { db.close(); reject(request.error); }; }); } catch { /* Le dossier reste disponible pour cette session. */ } }
async function canRead(handle, ask = false) { if (!handle) return false; const options = { mode: "read" }; return (await handle.queryPermission(options)) === "granted" || (ask && (await handle.requestPermission(options)) === "granted"); }
async function canWrite(handle) { return handle && ((await handle.queryPermission({ mode: "readwrite" })) === "granted" || (await handle.requestPermission({ mode: "readwrite" })) === "granted"); }
async function loadSavedParameters() {
  try { const pending = JSON.parse(localStorage.getItem(PENDING_PARAMETERS_KEY) || "null"); if (validParameters(pending)) { parameters = pending; render(); status.textContent = "Paramètres en attente de sauvegarde."; return true; } } catch { /* Les paramètres enregistrés restent la référence. */ }
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
async function renderFolderNames() { const [workFolder, backupFolder, csvFolder] = await Promise.all([storedFolder(), storedHandle(BACKUP_FOLDER_KEY), storedHandle(CSV_FOLDER_KEY)]); workFolderName.textContent = workFolder?.name || "Aucun dossier sélectionné"; backupFolderName.textContent = backupFolder?.name || "Aucun dossier sélectionné"; csvFolderName.textContent = csvFolder?.name || "Aucun dossier sélectionné"; }
async function chooseFolder(key, label, mode = "readwrite") { if (!("showDirectoryPicker" in window)) { status.textContent = "Le choix d’un dossier est disponible dans Chrome ou Edge."; return; } try { const handle = await window.showDirectoryPicker({ mode }); const allowed = mode === "read" ? await canRead(handle, true) : await canWrite(handle); if (!allowed) { status.textContent = `Autorisation refusée pour le dossier ${label}.`; return; } await rememberFolder(handle, key); await renderFolderNames(); status.textContent = `Dossier ${label} sélectionné : ${handle.name}.`; } catch (error) { if (error.name !== "AbortError") status.textContent = `Impossible de sélectionner le dossier ${label}.`; } }
function markParametersPending(message = "Paramètres à sauvegarder dans la fenêtre de travail.") { try { localStorage.setItem(PENDING_PARAMETERS_KEY, JSON.stringify(parameters)); } catch { /* La sauvegarde principale restera possible. */ } status.textContent = message; }

body.addEventListener("input", event => { const input = event.target; if (input.dataset.row === undefined || !input.dataset.field) return; parameters.kilometrage[Number(input.dataset.row)][input.dataset.field] = input.value; markParametersPending(); });
body.addEventListener("change", event => { const input = event.target; if (!input.matches(".active-power")) return; parameters.activePowerIndex = Number(input.value); markParametersPending(); });
accountantEmailInput.addEventListener("input", () => { parameters.accountantEmail = accountantEmailInput.value.trim(); markParametersPending(); });
mileageTierInputs.forEach(input => input.addEventListener("change", () => { parameters.mileageTier = input.value; markParametersPending(); }));
editParametersButton.addEventListener("click", () => { editingParameters = !editingParameters; render(); status.textContent = editingParameters ? "Modifiez les coefficients, puis cliquez sur « Valider » et sauvegardez depuis la fenêtre de travail." : "Modifications prêtes à sauvegarder dans la fenêtre de travail."; });
document.querySelector("#chooseWorkFolder").addEventListener("click", () => chooseFolder(WORK_FOLDER_KEY, "Travail"));
document.querySelector("#chooseBackupFolder").addEventListener("click", () => chooseFolder(BACKUP_FOLDER_KEY, "Sauvegardes"));
document.querySelector("#chooseCsvFolder").addEventListener("click", () => chooseFolder(CSV_FOLDER_KEY, "CSV"));
document.querySelector("#restoreDefaults").addEventListener("click", () => { if (!confirm("Rétablir les valeurs par défaut ? Les modifications non enregistrées seront perdues.")) return; parameters = JSON.parse(JSON.stringify(window.SCANFAC_PARAMETERS_DEFAULT)); render(); markParametersPending("Valeurs par défaut sélectionnées. Sauvegardez depuis la fenêtre de travail."); });
render(); loadSavedParameters(); renderFolderNames();
if ("serviceWorker" in navigator && location.protocol !== "file:") window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js?v=28").catch(() => {}));
