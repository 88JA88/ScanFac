// Liste facilement adaptable lorsque les comptes seront définis avec le comptable.
const defaultExpenseTypes = [
  { label: "Réception", account: "" }, { label: "Parking", account: "" },
  { label: "Autoroute", account: "" }, { label: "Tramway", account: "" },
  { label: "Taxi", account: "" }, { label: "Hôtel", account: "" },
  { label: "Carburant", account: "" }, { label: "Fournitures", account: "" },
  { label: "Téléphone", account: "" }, { label: "Kilométrage", account: "" },
  { label: "Postage", account: "" }, { label: "Divers", account: "" }
];
let expenseTypes = defaultExpenseTypes.map(type => ({ ...type }));
let contracts = [];
const monthLabels = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
// Chaque personne possède une liste continue de dépenses dans son fichier JSON.
let expenses = [];
let sequences = {};
let selectedLabel = "";
let sortRules = [{ field: "order", direction: "desc" }];
let monthRange = { from: "", to: "" };
let monthFilterState = { operator: "=", value: "" };
let accountantMode = false;
let masterBackup = null;
let personName = "";
let masterFileHandle = null;
let dataFolderHandle = null;
let backupFolderHandle = null;
let csvFolderHandle = null;
let scanLotFolderHandle = null;
let mileageParameters = JSON.parse(JSON.stringify(window.SCANFAC_PARAMETERS_DEFAULT));
let hasUnsavedChanges = false;
let recentScanLotImportIds = new Set();

const body = document.querySelector("#expensesBody");
const emptyState = document.querySelector("#emptyState");
const dateInput = document.querySelector("#expenseDate");
const amountInput = document.querySelector("#expenseAmount");
const amountLabel = document.querySelector("#amountLabel");
const knownPlaces = document.querySelector("#knownPlaces");
const contractSuggestions = document.querySelector("#contractSuggestions");
const unsavedNotice = document.querySelector("#unsavedNotice");
const sortDialog = document.querySelector("#sortDialog");
const updateDialog = document.querySelector("#updateDialog");
const expenseTypesDialog = document.querySelector("#expenseTypesDialog");
const expenseTypeList = document.querySelector("#expenseTypeList");
const expenseTypeName = document.querySelector("#expenseTypeName");
const expenseTypeAccount = document.querySelector("#expenseTypeAccount");
const contractsDialog = document.querySelector("#contractsDialog");
const contractList = document.querySelector("#contractList");
const contractName = document.querySelector("#contractName");
const guideDialog = document.querySelector("#guideDialog");
const importScanLotButton = document.querySelector("#importScanLotButton");
const scanLotHistoryButton = document.querySelector("#scanLotHistoryButton");
const scanLotImportInput = document.querySelector("#scanLotImportInput");
const scanLotCsvSelect = document.querySelector("#scanLotCsvSelect");
const scanLotHistoryDialog = document.querySelector("#scanLotHistoryDialog");
const scanLotImportHistory = document.querySelector("#scanLotImportHistory");
const scanLotCsvDialog = document.querySelector("#scanLotCsvDialog");
const scanLotCsvList = document.querySelector("#scanLotCsvList");
const hoverTips = {
  backupButton: "Enregistre les dépenses et les paramètres dans le dossier de travail.",
  exportJsonButton: "Crée une copie de secours complète au format JSON dans le dossier de travail.",
  accountantButton: "Prépare l’export comptable et permet de choisir la période.",
  openMasterButton: "Ouvre un fichier maître ScanFac existant."
};
Object.entries(hoverTips).forEach(([id, text]) => { const element = document.querySelector(`#${id}`); if (element) { element.dataset.tooltip = text; element.removeAttribute("title"); } });
const fromMonth = document.querySelector("#fromMonth");
const toMonth = document.querySelector("#toMonth");
const periodFilter = document.querySelector("#periodFilter");
const monthOperator = document.querySelector("#monthOperator");
const monthFilter = document.querySelector("#monthFilter");
const masterSelect = document.querySelector("#masterSelect");
const masterSelectText = document.querySelector("#masterSelectText");
const folderSummary = document.querySelector("#folderSummary");
const expenseForm = document.querySelector("#expenseForm");
const WORK_FOLDER_KEY = "data-folder";
const BACKUP_FOLDER_KEY = "backup-folder";
const CSV_FOLDER_KEY = "csv-folder";
const SCANLOT_FOLDER_KEY = "scanlot-import-folder";
const LAST_MASTER_FILE_KEY = "scanfac-last-master-file";
function rememberLastMasterFile(name) { try { if (name) localStorage.setItem(LAST_MASTER_FILE_KEY, name); } catch { /* Mémoire locale indisponible. */ } }
function lastMasterFileName() { try { return localStorage.getItem(LAST_MASTER_FILE_KEY) || ""; } catch { return ""; } }
function forgetLastMasterFile() { try { localStorage.removeItem(LAST_MASTER_FILE_KEY); } catch { /* Mémoire locale indisponible. */ } }
function masterSelectLabel() { return personName || "Fichiers enregistrés"; }
function renderPerson() { const label = masterSelectLabel(), firstOption = masterSelect.querySelector('option[value=""]'); if (firstOption) firstOption.textContent = label; masterSelectText.textContent = label; }
function renderFolderSummary() { const workName = dataFolderHandle?.name || "non sélectionné", backupName = backupFolderHandle?.name || "non sélectionné", csvName = csvFolderHandle?.name || "non sélectionné", scanLotName = scanLotFolderHandle?.name || "non sélectionné"; folderSummary.textContent = `Dossiers — Travail : ${workName} · Sauvegardes : ${backupName} · CSV : ${csvName} · Import ScanLot : ${scanLotName}`; }
function updateEntryAccess() { const locked = !masterBackup; expenseForm.querySelectorAll(".nature-button,#expenseDate,#expenseAmount,.save-expense,.mileage-route input,.mileage-route select,#backupButton,#exportJsonButton,#importScanLotButton,#scanLotHistoryButton").forEach(control => { control.disabled = locked; }); scanLotCsvSelect.disabled = locked || !scanLotFolderHandle || scanLotCsvSelect.options.length < 2; }
document.querySelector("#guideButton").addEventListener("click", () => guideDialog.showModal());
function markUnsaved() { hasUnsavedChanges = true; unsavedNotice.hidden = false; document.querySelector("#backupButton").classList.add("needs-save"); }
function markSaved() { hasUnsavedChanges = false; unsavedNotice.hidden = true; document.querySelector("#backupButton").classList.remove("needs-save"); }
function currentDateValue() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; }
function currentMonthValue() { return currentDateValue().slice(0, 7); }
function escapeHtml(value = "") { return String(value).replace(/[&<>'"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[char]); }
function amountNumber(value) { return Number(String(value).trim().replace(/\s/g, "").replace(",", ".")); }
function isMileageExpense() { return selectedLabel === "Kilométrage"; }
function needsRouteFields(label = selectedLabel) { return label === "Kilométrage" || label === "Autoroute"; }
function calculatedMileageAmount(kilometres) {
  const row = mileageParameters.kilometrage?.[Number(mileageParameters.activePowerIndex || 0)];
  if (!Number.isFinite(kilometres) || kilometres < 0 || !row) return NaN;
  const field = mileageParameters.mileageTier === "over20000" ? "auDela20000" : mileageParameters.mileageTier === "from5001" ? "coefficient" : "jusqua5000";
  const coefficient = amountNumber(row[field]); return Number.isFinite(coefficient) ? kilometres * coefficient : NaN;
}
function updateExpenseInputMode() {
  const mileage = isMileageExpense();
  amountLabel.textContent = mileage ? "Kilomètres" : "Montant TTC";
  amountInput.placeholder = mileage ? "0" : "0,00";
}
function renderKnownPlaces() {
  const places = [...new Set(expenses.flatMap(expense => [expense.departure, expense.arrival]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
  knownPlaces.innerHTML = places.map(place => `<option value="${escapeHtml(place)}"></option>`).join("");
}
function typeFor(label) { return expenseTypes.find(type => type.label === label) || { label, account: "" }; }
function euro(value) { return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value); }
function nextOrder(date) {
  const month = date.slice(5, 7);
  const existing = expenses.filter(e => e.order?.startsWith(`${month}-`)).map(e => Number(e.order.slice(3)) || 0);
  sequences[month] = Math.max(sequences[month] || 0, ...existing) + 1;
  return `${month}-${String(sequences[month]).padStart(3, "0")}`;
}
function normalizedExpenseDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? value : /^\d{4}-\d{2}$/.test(value || "") ? `${value}-01` : `${currentMonthValue()}-01`; }
function monthOf(value) { return normalizedExpenseDate(value).slice(0, 7); }
function displayDate(value) { const [year, month, day] = normalizedExpenseDate(value).split("-"); return `${Number(day)} ${["Jan.", "Fév.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."][Number(month) - 1]} ${year}`; }
function normalizedExpenses(items) { return items.map(expense => ({ ...expense, date: normalizedExpenseDate(expense.date), routeDirection: expense.routeDirection ?? (needsRouteFields(expense.label) ? "↔" : undefined) })); }
function validExpenseTypes(types) { return Array.isArray(types) && types.length > 0 && types.every(type => typeof type?.label === "string" && type.label.trim()) && new Set(types.map(type => type.label.trim().toLocaleLowerCase("fr-FR"))).size === types.length; }
function cloneExpenseTypes(types = defaultExpenseTypes) { return types.map(type => ({ label: type.label.trim(), account: String(type.account || "").trim() })); }
function validContracts(items) { return Array.isArray(items) && items.every(item => typeof item === "string" && item.trim()) && new Set(items.map(item => item.trim().toLocaleLowerCase("fr-FR"))).size === items.length; }
function cloneContracts(items = contracts) { return items.map(item => item.trim()); }
// Les fichiers créés avant le renommage conservent toutes leurs écritures :
// seule la nature « Restaurant » devient « Réception » lors de leur ouverture.
function migrateRestaurantToReception(backup) {
  let changed = false;
  (backup?.bundles || []).forEach(bundle => (bundle.expenses || []).forEach(expense => {
    if (expense.label === "Restaurant") { expense.label = "Réception"; changed = true; }
  }));
  if (!Array.isArray(backup?.expenseTypes)) return changed;
  const reception = backup.expenseTypes.find(type => type?.label === "Réception");
  const restaurants = backup.expenseTypes.filter(type => type?.label === "Restaurant");
  if (!restaurants.length) return changed;
  if (reception) {
    if (!reception.account && restaurants[0].account) reception.account = restaurants[0].account;
    backup.expenseTypes = backup.expenseTypes.filter(type => type?.label !== "Restaurant");
  } else {
    restaurants[0].label = "Réception";
    backup.expenseTypes = backup.expenseTypes.filter(type => type?.label !== "Restaurant" || type === restaurants[0]);
  }
  return true;
}
function normalizedText(value = "") { return String(value).trim().replace(/\s+/g, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr-FR"); }
function scanLotImports() { return Array.isArray(masterBackup?.scanLotImports) ? masterBackup.scanLotImports : []; }
function parseCsv(content) {
  const rows = [], row = []; let field = "", quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index], next = content[index + 1];
    if (quoted) { if (character === '"' && next === '"') { field += '"'; index += 1; } else if (character === '"') quoted = false; else field += character; continue; }
    if (character === '"') quoted = true;
    else if (character === ";") { row.push(field); field = ""; }
    else if (character === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row.splice(0)); field = ""; }
    else field += character;
  }
  if (quoted) throw new Error("guillemets non fermés");
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  return rows.filter(line => line.some(value => String(value).trim()));
}
function scanLotMonthValue(monthName) { const index = monthLabels.findIndex(label => normalizedText(label) === normalizedText(monthName)); return index < 0 ? "" : `${currentDateValue().slice(0, 4)}-${String(index + 1).padStart(2, "0")}`; }
function parseScanLotRows(content) {
  const rows = parseCsv(content.replace(/^\uFEFF/, ""));
  if (!rows.length) throw new Error("fichier vide");
  const headers = rows.shift().map(normalizedText);
  const required = ["mois", "fournisseur", "nature", "montant ttc"];
  if (required.some(header => !headers.includes(header))) throw new Error("colonnes ScanLot attendues : Mois ; Fournisseur ; Nature ; Montant TTC");
  const column = Object.fromEntries(headers.map((header, index) => [header, index]));
  const errors = [], imported = [];
  rows.forEach((row, index) => {
    const line = index + 2, month = scanLotMonthValue(row[column.mois]), sourceLabel = String(row[column.nature] || "").trim();
    const requestedLabel = normalizedText(sourceLabel) === "restaurant" ? "Réception" : sourceLabel;
    const type = expenseTypes.find(item => normalizedText(item.label) === normalizedText(requestedLabel));
    const amount = amountNumber(row[column["montant ttc"]]);
    if (!month) errors.push(`ligne ${line} : mois « ${row[column.mois] || "vide"} » inconnu`);
    if (!type) errors.push(`ligne ${line} : nature « ${sourceLabel || "vide"} » absente de ScanFac`);
    if (!Number.isFinite(amount) || amount < 0) errors.push(`ligne ${line} : montant TTC invalide`);
    if (month && type && Number.isFinite(amount) && amount >= 0) imported.push({ month, type, amount, supplier: String(row[column.fournisseur] || "").trim() });
  });
  if (!imported.length && !errors.length) throw new Error("aucune dépense à importer");
  if (errors.length) throw new Error(`Import annulé :\n${errors.join("\n")}`);
  return imported;
}
async function sha256(file) { const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer()); return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join(""); }
function renderScanLotImportHistory() {
  const entries = scanLotImports();
  scanLotImportHistory.innerHTML = entries.length ? `<ul>${entries.map(entry => `<li><b>${escapeHtml(entry.fileName)}</b><span>${new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(entry.importedAt))} · ${entry.count} dépense${entry.count > 1 ? "s" : ""} · ${escapeHtml(entry.status)}</span></li>`).join("")}</ul>` : "<p>Aucun CSV ScanLot n’a encore été importé.</p>";
}
function validMaster(backup) { return backup?.format === "scanfac-master" && Array.isArray(backup.bundles); }
function masterExpenses(backup = masterBackup) {
  const unique = new Map();
  normalizedExpenses(backup?.bundles?.flatMap(bundle => bundle.expenses || []) || []).forEach(expense => unique.set(expense.id, expense));
  return [...unique.values()];
}
function masterSequences(backup, items) {
  const result = {};
  (backup?.bundles || []).forEach(bundle => Object.entries(bundle.sequences || {}).forEach(([month, number]) => { result[month] = Math.max(result[month] || 0, Number(number) || 0); }));
  items.forEach(expense => { const month = expense.date?.slice(5, 7), number = Number(expense.order?.slice(3)) || 0; if (month) result[month] = Math.max(result[month] || 0, number); });
  return result;
}
function safeFileName(value) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, "-").replace(/(^-|-$)/g, "").toLowerCase() || "sauvegarde"; }
function newMaster() { return { format: "scanfac-master", version: 3, ownerName: personName, expenseTypes: cloneExpenseTypes(expenseTypes), contracts: cloneContracts(), scanLotImports: [], bundles: [] }; }
function masterFileName() { return `scanfac-${safeFileName(masterBackup.ownerName || personName)}.json`; }
function backupFileName() { const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14); return `scanfac-${safeFileName(personName || masterBackup?.ownerName || "frais")}-copie-secours-${stamp}.json`; }
function csvFileName() { return `scanfac-${safeFileName(personName || masterBackup?.ownerName || "frais")}-comptable.csv`; }
function downloadFile(content, type, name) { const blob = new Blob([content], { type }), link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = name; link.click(); URL.revokeObjectURL(link.href); }
function folderDb() { return new Promise((resolve, reject) => { const request = indexedDB.open("scanfac-local", 1); request.onupgradeneeded = () => request.result.createObjectStore("handles"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function storedHandle(key) {
  try { const db = await folderDb(); return await new Promise((resolve, reject) => { const request = db.transaction("handles", "readonly").objectStore("handles").get(key); request.onsuccess = () => { db.close(); resolve(request.result || null); }; request.onerror = () => { db.close(); reject(request.error); }; }); }
  catch { return null; }
}
async function storedFolder() { return await storedHandle(WORK_FOLDER_KEY); }
async function rememberFolder(handle, key = WORK_FOLDER_KEY) {
  try { const db = await folderDb(); await new Promise((resolve, reject) => { const request = db.transaction("handles", "readwrite").objectStore("handles").put(handle, key); request.onsuccess = () => { db.close(); resolve(); }; request.onerror = () => { db.close(); reject(request.error); }; }); }
  catch { /* Le dossier reste disponible pour cette session. */ }
}
async function forgetStoredFolder() {
  try { const db = await folderDb(); await new Promise((resolve, reject) => { const request = db.transaction("handles", "readwrite").objectStore("handles").delete("data-folder"); request.onsuccess = () => { db.close(); resolve(); }; request.onerror = () => { db.close(); reject(request.error); }; }); }
  catch { /* L’absence de permission n’empêche pas l’actualisation. */ }
}
async function canWriteFolder(handle, ask = false) { if (!handle) return false; const options = { mode: "readwrite" }; if (await handle.queryPermission(options) === "granted") return true; return ask && await handle.requestPermission(options) === "granted"; }
async function canReadFolder(handle, ask = false) { if (!handle) return false; const options = { mode: "read" }; if (await handle.queryPermission(options) === "granted") return true; return ask && await handle.requestPermission(options) === "granted"; }
async function refreshScanLotCsvList(askPermission = false) {
  const selected = scanLotCsvSelect.value;
  if (!await canReadFolder(scanLotFolderHandle, askPermission)) {
    scanLotCsvSelect.innerHTML = `<option value="">${scanLotFolderHandle ? "Autorisez le dossier Import ScanLot" : "Dossier Import ScanLot à choisir"}</option>`;
    scanLotCsvList.innerHTML = `<p>${scanLotFolderHandle ? "Autorisez le dossier Import ScanLot dans Paramètres." : "Choisissez d’abord le dossier Import ScanLot dans Paramètres."}</p>`;
    updateEntryAccess();
    return false;
  }
  try {
    const names = [];
    for await (const [name, handle] of scanLotFolderHandle.entries()) if (handle.kind === "file" && /\.csv$/i.test(name)) names.push(name);
    names.sort((a, b) => a.localeCompare(b, "fr"));
    scanLotCsvSelect.innerHTML = `<option value="">${names.length ? "Choisir un CSV ScanLot" : "Aucun CSV ScanLot dans ce dossier"}</option>${names.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}`;
    scanLotCsvList.innerHTML = names.length ? names.map(name => `<button class="button secondary" type="button" data-scanlot-csv="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join("") : "<p>Aucun CSV ScanLot dans ce dossier.</p>";
    if (names.includes(selected)) scanLotCsvSelect.value = selected;
    updateEntryAccess();
    return true;
  } catch {
    scanLotCsvSelect.innerHTML = '<option value="">Lecture du dossier Import ScanLot impossible</option>';
    scanLotCsvList.innerHTML = "<p>Lecture du dossier Import ScanLot impossible.</p>";
    updateEntryAccess();
    return false;
  }
}
async function chooseDataFolder() {
  if (!("showDirectoryPicker" in window)) { alert("Le choix d’un dossier est disponible dans Chrome ou Edge. Les fichiers seront téléchargés de façon classique."); return false; }
  try { const handle = await window.showDirectoryPicker({ mode: "readwrite" }); if (!await activateFolder(handle)) return false; await rememberFolder(handle); alert(`Dossier de travail sélectionné : ${handle.name}.`); return true; }
  catch (error) { if (error.name !== "AbortError") alert("Impossible de sélectionner ce dossier."); return false; }
}
async function activateFolder(handle) {
  if (!await canWriteFolder(handle, true)) return false;
  dataFolderHandle = handle; renderFolderSummary(); await loadMileageParameters(handle); await refreshMasterList(handle); if (!masterBackup) await restoreLastMaster(handle); return true;
}
async function writeToFolder(folder, name, content, type) { const handle = await folder.getFileHandle(name, { create: true }); const writable = await handle.createWritable(); await writable.write(new Blob([content], { type })); await writable.close(); return handle; }
async function refreshMasterList(folder = dataFolderHandle) {
  try {
    if (!folder) { masterSelect.disabled = true; return; }
    if (await folder.queryPermission({ mode: "read" }) !== "granted") { masterSelect.innerHTML = `<option value="">${escapeHtml(masterSelectLabel())}</option>`; masterSelectText.textContent = masterSelectLabel(); masterSelect.disabled = false; masterSelect.classList.add("needs-permission"); return; }
    const names = [];
    for await (const [name, handle] of folder.entries()) if (handle.kind === "file" && /^scanfac-(?!parametres\.json$|baremes\.json$)(?!.*-copie-secours-).+\.json$/i.test(name)) names.push(name);
    names.sort((a, b) => a.localeCompare(b, "fr"));
    masterSelect.innerHTML = `<option value="">${escapeHtml(masterSelectLabel())}</option>${names.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name.replace(/^scanfac-|\.json$/gi, "").toLocaleUpperCase("fr-FR"))}</option>`).join("")}`; masterSelectText.textContent = masterSelectLabel();
    masterSelect.disabled = names.length === 0;
    masterSelect.classList.remove("needs-permission");
  } catch { masterSelect.disabled = true; masterSelect.classList.remove("needs-permission"); }
}
async function loadMileageParameters(folder) {
  try {
    if (!folder || await folder.queryPermission({ mode: "read" }) !== "granted") return;
    const file = await folder.getFileHandle("scanfac-parametres.json");
    const data = JSON.parse(await (await file.getFile()).text());
    if (data?.format === "scanfac-parametres" && Array.isArray(data.kilometrage)) { mileageParameters = data; document.querySelector("#accountantEmail").value = data.accountantEmail || ""; }
  } catch { /* Les valeurs intégrées restent utilisées tant que les paramètres ne sont pas disponibles. */ }
  updateExpenseInputMode();
}
function synchronizeMaster() {
  if (!masterBackup) return;
  masterBackup.ownerName = personName;
  masterBackup.expenseTypes = cloneExpenseTypes(expenseTypes);
  masterBackup.contracts = cloneContracts();
  masterBackup.bundles = [{ id: masterBackup.bundles[0]?.id || crypto.randomUUID(), savedAt: new Date().toISOString(), expenses, sequences }];
}
async function exportJson() { synchronizeMaster(); const content = JSON.stringify(masterBackup, null, 2), fileName = backupFileName(), folder = backupFolderHandle || dataFolderHandle; if (folder) { if (!await canWriteFolder(folder, true)) { alert(`L’autorisation du dossier ${backupFolderHandle ? "Sauvegardes" : "Travail"} n’est plus valide. Sélectionnez-le à nouveau dans Paramètres.`); return false; } await writeToFolder(folder, fileName, content, "application/json"); return true; } downloadFile(content, "application/json", fileName); return true; }
function downloadJson() { synchronizeMaster(); downloadFile(JSON.stringify(masterBackup, null, 2), "application/json", backupFileName()); }
async function saveMaster(createOnly = false) {
  synchronizeMaster();
  masterBackup.updatedAt = new Date().toISOString();
  if (!dataFolderHandle && "showDirectoryPicker" in window && !await chooseDataFolder()) return false;
  if (dataFolderHandle && await canWriteFolder(dataFolderHandle, true)) {
    if (createOnly) { try { await dataFolderHandle.getFileHandle(masterFileName()); alert(`Un fichier existe déjà pour « ${personName} ». Choisissez un autre nom ou restaurez ce fichier.`); return false; } catch (error) { if (error.name !== "NotFoundError") { alert("Impossible de vérifier le dossier Travail."); return false; } } }
    masterFileHandle = await writeToFolder(dataFolderHandle, masterFileName(), JSON.stringify(masterBackup, null, 2), "application/json"); rememberLastMasterFile(masterFileHandle.name); await refreshMasterList(); masterSelect.value = masterFileName(); updateEntryAccess(); return true;
  }
  if (dataFolderHandle) { alert("L’autorisation du dossier Travail n’est plus valide. Sélectionnez-le à nouveau dans Paramètres."); return false; }
  if (!("showSaveFilePicker" in window)) {
    alert("L’écriture directe n’est pas disponible dans ce navigateur. Un export JSON va être téléchargé.");
    downloadJson();
    return false;
  }
  try {
    if (!masterFileHandle) masterFileHandle = await window.showSaveFilePicker({
      suggestedName: masterFileName(),
      types: [{ description: "Sauvegarde ScanFac", accept: { "application/json": [".json"] } }]
    });
    const writable = await masterFileHandle.createWritable();
    await writable.write(JSON.stringify(masterBackup, null, 2)); await writable.close(); rememberLastMasterFile(masterFileHandle.name);
    return true;
  } catch (error) {
    if (error.name !== "AbortError") alert("Impossible de mettre à jour le fichier maître.");
    return false;
  }
}
async function restoreMaster() {
  try {
    if ("showOpenFilePicker" in window) {
      const [handle] = await window.showOpenFilePicker({ types: [{ description: "Sauvegarde ScanFac", accept: { "application/json": [".json"] } }], multiple: false });
      await applyMasterFile(await handle.getFile(), handle);
    } else {
      document.querySelector("#restoreInput").click();
    }
  } catch (error) {
    if (error.name !== "AbortError") throw error;
  }
}
async function applyMasterFile(file, handle = null) {
  const backup = JSON.parse(await file.text());
  if (!validMaster(backup)) throw new Error("invalid");
  const migrated = migrateRestaurantToReception(backup);
  masterBackup = backup; masterFileHandle = handle; if (handle?.name) rememberLastMasterFile(handle.name); personName = backup.ownerName || "";
  expenses = masterExpenses(backup); sequences = masterSequences(backup, expenses); expenseTypes = validExpenseTypes(backup.expenseTypes) ? cloneExpenseTypes(backup.expenseTypes) : cloneExpenseTypes(); contracts = validContracts(backup.contracts) ? cloneContracts(backup.contracts) : []; selectedLabel = "";
  monthRange = { from: "", to: "" }; monthFilterState = { operator: "=", value: "" }; accountantMode = false;
  if (migrated) markUnsaved(); else markSaved(); renderPerson(); renderNatureList(); render();
}
function isInSelectedPeriod(expense) { const month = monthOf(expense.date); return !accountantMode || ((!monthRange.from || month >= monthRange.from) && (!monthRange.to || month <= monthRange.to)); }
function matchesMonthFilter(expense) {
  if (!monthFilterState.value) return true;
  const month = monthOf(expense.date); return monthFilterState.operator === "=" ? month === monthFilterState.value : monthFilterState.operator === ">" ? month > monthFilterState.value : month < monthFilterState.value;
}
function comparable(expense, field) { return field === "amount" ? amountNumber(expense.amount) : field === "month" ? monthOf(expense.date) : String(expense[field] ?? ""); }
function sortedFilteredExpenses() {
  return expenses.filter(e => isInSelectedPeriod(e) && matchesMonthFilter(e)).sort((a, b) => {
    for (const rule of sortRules) {
      const av = comparable(a, rule.field), bv = comparable(b, rule.field);
      const result = typeof av === "number" ? av - bv : av.localeCompare(bv, "fr", { numeric: true });
      if (result) return rule.direction === "asc" ? result : -result;
    }
    return 0;
  });
}
function monthName(value) { return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date(`${monthOf(value)}-01T12:00:00`)); }
function renderPeriodFilter() {
  const months = [...new Set(expenses.map(expense => monthOf(expense.date)))].sort();
  periodFilter.hidden = !accountantMode || months.length === 0;
  if (!accountantMode || !months.length) return;
  const options = months.map(month => `<option value="${month}">${monthName(month)}</option>`).join("");
  fromMonth.innerHTML = options; toMonth.innerHTML = options;
  if (!months.includes(monthRange.from)) monthRange.from = months[0];
  if (!months.includes(monthRange.to)) monthRange.to = months[months.length - 1];
  fromMonth.value = monthRange.from; toMonth.value = monthRange.to;
}
function renderMonthFilter() {
  // Le filtre ne propose que les mois réellement présents dans la comptabilité
  // ouverte : on évite ainsi de laisser croire que des mois vides contiennent
  // des dépenses.
  const months = [...new Set(expenses.map(expense => monthOf(expense.date)).filter(Boolean))].sort();
  if (!months.includes(monthFilterState.value)) monthFilterState.value = "";
  monthOperator.value = monthFilterState.operator;
  monthFilter.innerHTML = `<option value="">Tous</option>${months.map(month => `<option value="${month}">${monthName(month)}</option>`).join("")}`;
  monthFilter.value = monthFilterState.value;
}
function labelOptions(value) { return expenseTypes.map(type => `<option value="${escapeHtml(type.label)}" ${type.label === value ? "selected" : ""}>${escapeHtml(type.label)}</option>`).join(""); }
function renderContractSuggestions() { contractSuggestions.innerHTML = contracts.map(contract => `<option value="${escapeHtml(contract)}"></option>`).join(""); }
function renderNatureList() {
  document.querySelector("#natureList").innerHTML = expenseTypes.map((type, index) => `<button type="button" class="nature-button ${type.label === selectedLabel ? "selected" : ""}" data-label="${escapeHtml(type.label)}">${escapeHtml(type.label)}</button>${(index + 1) % 10 === 0 && index < expenseTypes.length - 1 ? `<span class="nature-break" aria-hidden="true"></span>` : ""}`).join("");
}
function renderExpenseTypeList() {
  expenseTypeList.innerHTML = expenseTypes.map(type => {
    const used = expenses.some(expense => expense.label === type.label);
    const disabled = used || expenseTypes.length === 1;
    const title = used ? "Cette nature est déjà utilisée" : "Conservez au moins une nature de frais";
    return `<div class="expense-type-row"><b>${escapeHtml(type.label)}</b><label class="expense-type-account-field"><span>N° de compte</span><input class="expense-type-account-input" type="text" maxlength="30" value="${escapeHtml(type.account)}" data-expense-type-account="${escapeHtml(type.label)}" aria-label="N° de compte pour ${escapeHtml(type.label)}" placeholder="Facultatif" /></label><button class="delete-expense-type" type="button" data-delete-expense-type="${escapeHtml(type.label)}" ${disabled ? `disabled title="${title}"` : ""}>Supprimer</button></div>`;
  }).join("");
}
function renderContractList() {
  contractList.innerHTML = contracts.length ? contracts.map(contract => {
    const used = expenses.some(expense => expense.contract === contract);
    return `<div class="contract-row"><b>${escapeHtml(contract)}</b><button class="delete-contract" type="button" data-delete-contract="${escapeHtml(contract)}" ${used ? 'disabled title="Ce contrat est déjà utilisé"' : ""}>Supprimer</button></div>`;
  }).join("") : "<p class=\"dialog-copy\">Aucun contrat pour le moment.</p>";
}
function renderTotals() {
  const periodExpenses = expenses.filter(expense => isInSelectedPeriod(expense) && matchesMonthFilter(expense));
  const total = periodExpenses.reduce((sum, expense) => sum + amountNumber(expense.amount), 0);
  const kilometres = periodExpenses.filter(expense => expense.label === "Kilométrage").reduce((sum, expense) => sum + amountNumber(expense.kilometres || 0), 0);
  const primarySort = sortRules[0]?.field;
  const groupByMonth = primarySort === "month";
  document.querySelector("#grandTotal").textContent = euro(total);
  document.querySelector("#grandTotal").previousElementSibling.textContent = "Total :";
  document.querySelector("#kilometerTotal").textContent = kilometres ? `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(kilometres)} km` : "";
  document.querySelector("#periodLabel").textContent = `${periodExpenses.length} dépense${periodExpenses.length > 1 ? "s" : ""} enregistrée${periodExpenses.length > 1 ? "s" : ""}`;
  document.querySelector("#totalsHeading").textContent = groupByMonth ? "Totaux par mois" : primarySort === "contract" ? "Totaux par contrat" : "Totaux par libellé";
  // L'ordre d'apparition des groupes suit le tri actif du tableau.
  const sums = new Map(); sortedFilteredExpenses().forEach(e => {
    const key = groupByMonth ? monthName(e.date) : primarySort === "contract" ? (e.contract || "Sans contrat") : e.label;
    sums.set(key, (sums.get(key) || 0) + amountNumber(e.amount));
  });
  document.querySelector("#labelTotals").innerHTML = sums.size
    ? [...sums.entries()].map(([label, total], index) => `<span>${escapeHtml(label)} <b>${euro(total)}</b></span>${(index + 1) % 7 === 0 && index < sums.size - 1 ? `<span class="breakdown-break" aria-hidden="true"></span>` : ""}`).join("")
    : "<span>Les totaux apparaîtront ici.</span>";
}
function render() {
  renderKnownPlaces();
  renderContractSuggestions();
  renderMonthFilter();
  const rows = sortedFilteredExpenses();
  document.querySelector("#expenseCount").textContent = `${expenses.length} dépense${expenses.length > 1 ? "s" : ""}`;
  body.innerHTML = rows.map(e => { const route = needsRouteFields(e.label), direction = e.routeDirection || "↔"; const firstField = route ? `<input class="cell-input route-input" data-field="departure" value="${escapeHtml(e.departure || "")}" placeholder="Départ" aria-label="Départ" list="knownPlaces" />` : `<input class="cell-input observations-input" data-field="observations" value="${escapeHtml(e.observations || "")}" aria-label="Observations" />`; const dateField = `<label class="expense-date-cell"><span>${escapeHtml(displayDate(e.date))}</span><input class="expense-date-input" data-field="date" type="date" value="${escapeHtml(e.date)}" aria-label="Date de la dépense" /></label>`; return `<tr data-id="${e.id}"><td><strong class="order-number">${escapeHtml(e.order)}</strong></td><td>${dateField}</td><td><select class="cell-select" data-field="label" aria-label="Libellé">${labelOptions(e.label)}</select></td><td><input class="cell-input amount" data-field="amount" inputmode="decimal" value="${escapeHtml(e.amount)}" aria-label="Montant TTC" ${e.label === "Kilométrage" ? "readonly title=\"Montant calculé à partir des kilomètres\"" : ""} /></td><td>${firstField}</td><td>${route ? `<select class="cell-select direction-select" data-field="routeDirection" aria-label="Sens du trajet"><option value="" ${!e.routeDirection ? "selected" : ""}>—</option><option value="→" ${direction === "→" ? "selected" : ""}>⟶</option><option value="↔" ${direction === "↔" ? "selected" : ""}>⟷</option></select>` : ""}</td><td>${route ? `<input class="cell-input route-input" data-field="arrival" value="${escapeHtml(e.arrival || "")}" placeholder="Arrivée" aria-label="Arrivée" list="knownPlaces" />` : ""}</td><td>${e.label === "Kilométrage" ? `<input class="cell-input kilometer-recap" data-field="kilometres" inputmode="decimal" value="${escapeHtml(e.kilometres ?? "")}" placeholder="km" aria-label="Kilomètres" title="Modifier les kilomètres" />` : ""}</td><td><input class="cell-input contract-input" data-field="contract" list="contractSuggestions" value="${escapeHtml(e.contract || "")}" aria-label="Contrat" /></td><td><button class="delete-button" data-action="delete" aria-label="Supprimer ${escapeHtml(e.order)}" title="Supprimer">×</button></td></tr>`; }).join("");
  body.querySelectorAll("tr").forEach(row => row.classList.toggle("scanlot-recent-import", recentScanLotImportIds.has(row.dataset.id)));
  body.querySelectorAll('.direction-select option[value="→"]').forEach(option => { option.textContent = "--->"; });
  body.querySelectorAll('.direction-select option[value="↔"]').forEach(option => { option.textContent = "<--->"; });
  if (emptyState) emptyState.hidden = rows.length !== 0; renderTotals(); renderPeriodFilter(); updateEntryAccess();
}
function getExpense(id) { return expenses.find(e => e.id === id); }
function updateExpense(expense, field, value) {
  if (field === "amount") { const amount = amountNumber(value); if (!Number.isFinite(amount) || amount < 0) return false; expense.amount = amount.toFixed(2).replace(".", ","); }
  else if (field === "kilometres") { const kilometres = amountNumber(value), amount = calculatedMileageAmount(kilometres); if (!Number.isFinite(kilometres) || kilometres < 0 || !Number.isFinite(amount)) return false; expense.kilometres = kilometres; expense.amount = amount.toFixed(2).replace(".", ","); }
  else if (field === "date") { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; expense.date = value; }
  else if (field === "routeDirection") expense.routeDirection = value || "none";
  else if (field === "label") { expense.label = value; expense.account = typeFor(value).account; }
  else if (field === "contract") { const contract = value.trim().replace(/\s+/g, " "); expense.contract = contract; if (contract && !contracts.some(item => item.localeCompare(contract, "fr", { sensitivity: "accent" }) === 0)) { contracts.push(contract); contracts.sort((a, b) => a.localeCompare(b, "fr")); } }
  else expense[field] = value;
  return true;
}
document.querySelector("#manageExpenseTypesButton").addEventListener("click", () => { renderExpenseTypeList(); expenseTypeName.value = ""; expenseTypeAccount.value = ""; expenseTypesDialog.showModal(); expenseTypeName.focus(); });
document.querySelector("#manageContractsButton").addEventListener("click", () => { renderContractList(); contractName.value = ""; contractsDialog.showModal(); contractName.focus(); });
document.querySelector("#addContractButton").addEventListener("click", () => {
  const contract = contractName.value.trim().replace(/\s+/g, " ");
  if (!contract) { contractName.focus(); return; }
  if (contracts.some(item => item.localeCompare(contract, "fr", { sensitivity: "accent" }) === 0)) { alert("Ce contrat existe déjà."); contractName.focus(); return; }
  contracts.push(contract); contracts.sort((a, b) => a.localeCompare(b, "fr")); markUnsaved(); renderContractList(); contractName.value = ""; contractName.focus();
});
contractName.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); document.querySelector("#addContractButton").click(); } });
contractList.addEventListener("click", event => {
  const button = event.target.closest("[data-delete-contract]"); if (!button || button.disabled) return;
  contracts = contracts.filter(contract => contract !== button.dataset.deleteContract); markUnsaved(); renderContractList(); render();
});
document.querySelector("#addExpenseTypeButton").addEventListener("click", () => {
  const label = expenseTypeName.value.trim().replace(/\s+/g, " ");
  if (!label) { alert("Indiquez le nom de la nature de frais."); expenseTypeName.focus(); return; }
  if (expenseTypes.some(type => type.label.localeCompare(label, "fr", { sensitivity: "accent" }) === 0)) { alert("Cette nature de frais existe déjà."); expenseTypeName.focus(); return; }
  expenseTypes.push({ label, account: expenseTypeAccount.value.trim() });
  markUnsaved(); renderNatureList(); renderExpenseTypeList(); expenseTypeName.value = ""; expenseTypeAccount.value = ""; expenseTypeName.focus();
});
[expenseTypeName, expenseTypeAccount].forEach(input => input.addEventListener("keydown", event => {
  if (event.key === "Enter") { event.preventDefault(); document.querySelector("#addExpenseTypeButton").click(); }
}));
expenseTypeList.addEventListener("click", event => {
  const button = event.target.closest("[data-delete-expense-type]"); if (!button || button.disabled) return;
  const label = button.dataset.deleteExpenseType;
  if (expenses.some(expense => expense.label === label) || expenseTypes.length === 1) return;
  expenseTypes = expenseTypes.filter(type => type.label !== label);
  if (selectedLabel === label) { selectedLabel = ""; updateExpenseInputMode(); }
  markUnsaved(); renderNatureList(); renderExpenseTypeList();
});
expenseTypeList.addEventListener("change", event => {
  const input = event.target.closest("[data-expense-type-account]");
  if (!input) return;
  const label = input.dataset.expenseTypeAccount;
  const type = expenseTypes.find(item => item.label === label);
  if (!type) return;
  type.account = input.value.trim();
  expenses.forEach(expense => { if (expense.label === label) expense.account = type.account; });
  markUnsaved();
});
document.querySelector("#natureList").addEventListener("click", event => {
  const button = event.target.closest("[data-label]"); if (!button) return;
  selectedLabel = button.dataset.label; renderNatureList(); updateExpenseInputMode(); amountInput.focus();
});
document.querySelector("#expenseForm").addEventListener("submit", event => {
  event.preventDefault(); const amount = amountNumber(amountInput.value);
  if (!selectedLabel) { alert("Choisissez une nature de frais."); return; }
  if (!dateInput.value || !Number.isFinite(amount) || amount < 0) { amountInput.setCustomValidity(isMileageExpense() ? "Indiquez un nombre de kilomètres valide." : "Indiquez un montant TTC valide."); amountInput.reportValidity(); return; }
  const type = typeFor(selectedLabel);
  const calculatedAmount = isMileageExpense() ? calculatedMileageAmount(amount) : amount;
  if (!Number.isFinite(calculatedAmount)) { alert("Le coefficient kilométrique actif est invalide. Vérifiez les Paramètres."); return; }
  expenses.push({ id: crypto.randomUUID(), order: nextOrder(dateInput.value), date: dateInput.value, label: type.label, account: type.account, amount: calculatedAmount.toFixed(2).replace(".", ","), kilometres: isMileageExpense() ? amount : undefined, routeDirection: needsRouteFields() ? "↔" : undefined });
  recentScanLotImportIds.clear(); markUnsaved(); selectedLabel = ""; amountInput.value = ""; amountInput.setCustomValidity(""); renderNatureList(); updateExpenseInputMode(); render(); amountInput.focus();
});
body.addEventListener("change", event => {
  const field = event.target.dataset.field; if (!field) return;
  const expense = getExpense(event.target.closest("tr").dataset.id);
  if (!updateExpense(expense, field, event.target.value)) { event.target.setCustomValidity(field === "kilometres" ? "Indiquez un nombre de kilomètres valide." : "Montant invalide."); event.target.reportValidity(); } else { event.target.setCustomValidity(""); markUnsaved(); }
  render();
});
body.addEventListener("click", event => {
  const dateField = event.target.closest(".expense-date-cell");
  if (dateField) {
    const picker = dateField.querySelector('input[type="date"]');
    if (picker?.showPicker) { event.preventDefault(); try { picker.showPicker(); } catch { picker.focus(); } }
    else picker?.focus();
    return;
  }
  const button = event.target.closest('[data-action="delete"]'); if (!button) return;
  const expense = getExpense(button.closest("tr").dataset.id);
  if (confirm(`Supprimer la dépense ${expense.order} ? Son numéro ne sera jamais réutilisé.`)) { expenses = expenses.filter(e => e.id !== expense.id); markUnsaved(); render(); }
});
monthOperator.addEventListener("change", () => { monthFilterState.operator = monthOperator.value; render(); });
monthFilter.addEventListener("change", () => { monthFilterState.value = monthFilter.value; render(); });
fromMonth.addEventListener("change", () => { monthRange.from = fromMonth.value; if (monthRange.from > monthRange.to) monthRange.to = monthRange.from; render(); });
toMonth.addEventListener("change", () => { monthRange.to = toMonth.value; if (monthRange.to < monthRange.from) monthRange.from = monthRange.to; render(); });
const fields = [{ value:"contract", label:"Contrat" }, { value:"month", label:"Mois" }, { value:"date", label:"Date" }, { value:"departure", label:"Départ" }, { value:"label", label:"Libellé" }, { value:"amount", label:"Montant TTC" }, { value:"order", label:"N° d’ordre" }];
const sortRulesEl = document.querySelector("#sortRules");
function renderSortRules() { sortRulesEl.innerHTML = sortRules.map((rule, index) => `<div class="sort-rule"><span class="rule-number">${index + 1}</span><select class="rule-select" data-sort-field="${index}">${fields.map(field => `<option value="${field.value}" ${field.value === rule.field ? "selected" : ""}>${field.label}</option>`).join("")}</select><select class="rule-select" data-sort-direction="${index}"><option value="asc" ${rule.direction === "asc" ? "selected" : ""}>Croissant</option><option value="desc" ${rule.direction === "desc" ? "selected" : ""}>Décroissant</option></select><button type="button" class="remove-rule" data-remove-rule="${index}" aria-label="Supprimer ce critère">×</button></div>`).join(""); }
document.querySelector("#sortByMonthButton").addEventListener("click", () => { sortRules = [{ field: "month", direction: "desc" }, { field: "label", direction: "asc" }, { field: "date", direction: "desc" }, { field: "order", direction: "asc" }]; render(); });
document.querySelector("#sortByLabelButton").addEventListener("click", () => { sortRules = [{ field: "label", direction: "asc" }, { field: "month", direction: "desc" }, { field: "date", direction: "desc" }, { field: "order", direction: "asc" }]; render(); });
document.querySelector("#sortByContractButton").addEventListener("click", () => { sortRules = [{ field: "contract", direction: "desc" }, { field: "date", direction: "desc" }, { field: "order", direction: "asc" }]; render(); });
document.querySelector("#sortByDateDepartureButton").addEventListener("click", () => { sortRules = [{ field: "date", direction: "desc" }, { field: "label", direction: "asc" }, { field: "departure", direction: "asc" }, { field: "order", direction: "asc" }]; render(); });
document.querySelector("#addSortRule").addEventListener("click", () => { sortRules.push({ field: "order", direction: "asc" }); renderSortRules(); });
sortRulesEl.addEventListener("change", event => { const index = event.target.dataset.sortField ?? event.target.dataset.sortDirection; if (index !== undefined) sortRules[index][event.target.dataset.sortField !== undefined ? "field" : "direction"] = event.target.value; });
sortRulesEl.addEventListener("click", event => { const index = event.target.dataset.removeRule; if (index !== undefined && sortRules.length > 1) { sortRules.splice(index, 1); renderSortRules(); } });
document.querySelector("#applySort").addEventListener("click", render);
function csvValue(value) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }
function csvTotals(expensesToSummarize) {
  const total = expensesToSummarize.reduce((sum, expense) => sum + amountNumber(expense.amount), 0);
  const kilometres = expensesToSummarize.filter(expense => expense.label === "Kilométrage").reduce((sum, expense) => sum + amountNumber(expense.kilometres || 0), 0);
  const totalsByLabel = new Map();
  expensesToSummarize.forEach(expense => totalsByLabel.set(expense.label, (totalsByLabel.get(expense.label) || 0) + amountNumber(expense.amount)));
  return { total, kilometres, totalsByLabel };
}
async function exportCsv() {
  const headers = ["N° d’ordre", "Contrat", "Date", "Libellé", "N° compte comptable", "Montant TTC", "Départ / observations", "Sens", "Arrivée", "Kilomètres"];
  const byMonthThenDate = expenses.filter(isInSelectedPeriod).sort((a, b) => a.date.localeCompare(b.date) || a.order.localeCompare(b.order, "fr", { numeric: true }));
  const { total, kilometres, totalsByLabel } = csvTotals(byMonthThenDate);
  const summaryRows = [
    [],
    ["Récapitulatif", "", "", "", "", "Montant TTC", "", "", "", "Kilomètres"],
    ["Total général", "", "", "", "", total.toFixed(2).replace(".", ","), "", "", "", kilometres || ""],
    ...[...totalsByLabel.entries()].map(([label, amount]) => [`Total ${label}`, "", "", "", "", amount.toFixed(2).replace(".", ","), "", "", "", ""])
  ];
  const csv = [headers, ...byMonthThenDate.map(e => [e.order, e.contract, displayDate(e.date), e.label, e.account, e.amount, e.departure || e.observations, e.routeDirection === "none" ? "" : e.routeDirection, e.arrival, e.kilometres]), ...summaryRows].map(row => row.map(csvValue).join(";")).join("\r\n");
  const content = "\uFEFF" + csv;
  if (csvFolderHandle) {
    if (!await canWriteFolder(csvFolderHandle, true)) { alert("L’autorisation du dossier CSV n’est plus valide. Sélectionnez-le à nouveau dans Paramètres."); return false; }
    try { await writeToFolder(csvFolderHandle, csvFileName(), content, "text/csv;charset=utf-8"); } catch { alert("Impossible d’écrire le CSV dans le dossier choisi."); }
  } else downloadFile(content, "text/csv;charset=utf-8", csvFileName());
}
document.querySelector("#exportButton").addEventListener("click", async event => {
  const button = event.currentTarget;
  if (button.disabled) return;
  const initialText = button.textContent;
  button.disabled = true;
  button.classList.add("is-exporting");
  button.setAttribute("aria-busy", "true");
  button.textContent = "Exportation…";
  const startedAt = performance.now();
  try { await exportCsv(); const remaining = 500 - (performance.now() - startedAt); if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining)); }
  finally { button.disabled = false; button.classList.remove("is-exporting"); button.removeAttribute("aria-busy"); button.textContent = initialText; }
});
document.querySelector("#sendEmailButton").addEventListener("click", async () => {
  const email = document.querySelector("#accountantEmail");
  if (!email.checkValidity()) { email.reportValidity(); return; }
  const subject = "ScanFac — dépenses professionnelles";
  const body = `Bonjour,\n\nVeuillez trouver ci-joint l’export CSV ScanFac (${csvFileName()}).\n\nCordialement,`;
  window.location.href = `mailto:${email.value.trim()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  void exportCsv();
});
async function importScanLotCsv(file) {
  if (!masterBackup || !masterFileHandle) { alert("Restaurez d’abord le fichier maître dans lequel comptabiliser ce CSV."); return; }
  try {
    const fingerprint = await sha256(file);
    if (scanLotImports().some(entry => entry.sha256 === fingerprint)) { alert("Ce fichier a déjà été comptabilisé dans ScanFac."); return; }
    const rows = parseScanLotRows(await file.text());
    const previousMaster = JSON.parse(JSON.stringify(masterBackup)), previousExpenses = expenses, previousSequences = { ...sequences }, previousUnsaved = hasUnsavedChanges, previousRecentImportIds = recentScanLotImportIds;
    const importedExpenses = rows.map(row => ({ id: crypto.randomUUID(), order: nextOrder(row.month), date: `${row.month}-01`, label: row.type.label, account: row.type.account, amount: row.amount.toFixed(2).replace(".", ","), observations: row.supplier, routeDirection: needsRouteFields(row.type.label) ? "↔" : undefined }));
    expenses = [...expenses, ...importedExpenses]; recentScanLotImportIds = new Set(importedExpenses.map(expense => expense.id));
    masterBackup.scanLotImports = [...scanLotImports(), { fileName: file.name, sha256: fingerprint, importedAt: new Date().toISOString(), count: importedExpenses.length, status: "Comptabilisé" }];
    masterBackup.ownerName = personName;
    masterBackup.expenseTypes = cloneExpenseTypes(expenseTypes); masterBackup.contracts = cloneContracts();
    masterBackup.bundles = [{ id: masterBackup.bundles[0]?.id || crypto.randomUUID(), savedAt: new Date().toISOString(), expenses, sequences }];
    if (!await saveMaster()) {
      masterBackup = previousMaster; expenses = previousExpenses; sequences = previousSequences; recentScanLotImportIds = previousRecentImportIds;
      if (previousUnsaved) markUnsaved(); else markSaved(); render();
      alert("Import annulé : impossible de sauvegarder le fichier maître."); return;
    }
    markSaved(); render(); alert(`${importedExpenses.length} dépense${importedExpenses.length > 1 ? "s" : ""} ScanLot comptabilisée${importedExpenses.length > 1 ? "s" : ""}.`);
  } catch (error) { alert(error.message || "Import ScanLot impossible."); }
}
importScanLotButton.addEventListener("click", async () => { await refreshScanLotCsvList(true); scanLotCsvDialog.showModal(); });
scanLotCsvSelect.addEventListener("change", async () => {
  const name = scanLotCsvSelect.value;
  if (!name) return;
  try { await importScanLotCsv(await (await scanLotFolderHandle.getFileHandle(name)).getFile()); }
  catch (error) { alert(error.message || "Impossible de lire ce CSV ScanLot."); }
  finally { await refreshScanLotCsvList(); }
});
scanLotCsvList.addEventListener("click", async event => {
  const button = event.target.closest("[data-scanlot-csv]");
  if (!button) return;
  try { await importScanLotCsv(await (await scanLotFolderHandle.getFileHandle(button.dataset.scanlotCsv)).getFile()); scanLotCsvDialog.close(); }
  catch (error) { alert(error.message || "Impossible de lire ce CSV ScanLot."); }
  finally { await refreshScanLotCsvList(); }
});
scanLotImportInput.addEventListener("change", async event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) await importScanLotCsv(file); });
scanLotHistoryButton.addEventListener("click", () => { renderScanLotImportHistory(); scanLotHistoryDialog.showModal(); });
document.querySelector("#backupButton").addEventListener("click", async () => {
  if (!expenses.length && !hasUnsavedChanges) { alert("Ajoutez une dépense ou modifiez les natures de frais avant de sauvegarder."); return; }
  if (!personName) { alert("Choisissez d’abord « Nouveau nom » ou restaurez un fichier maître."); return; }
  if (masterBackup && masterBackup.ownerName && masterBackup.ownerName !== personName) { alert("Cliquez sur « Nouvelle personne » avant de commencer une comptabilité différente."); return; }
  if (!masterBackup) masterBackup = newMaster();
  if (await saveMaster()) markSaved();
});
document.querySelector("#newPersonButton").addEventListener("click", async () => {
  const nextName = prompt("Nom de la personne :")?.trim();
  if (!nextName) return;
  if (!confirm(`Commencer une nouvelle comptabilité pour « ${nextName} » ? La liste affichée sera vidée, sans supprimer les fichiers JSON existants.`)) return;
  personName = nextName; masterFileHandle = null; expenses = []; sequences = {}; expenseTypes = cloneExpenseTypes(); contracts = []; masterBackup = newMaster(); monthRange = { from: "", to: "" }; monthFilterState = { operator: "=", value: "" }; accountantMode = false; renderPerson(); renderNatureList(); render(); if (!await saveMaster(true)) { updateEntryAccess(); return; } markSaved(); render(); amountInput.focus();
});
const newExpenseButton = document.querySelector("#newExpenseButton");
if (newExpenseButton) {
  newExpenseButton.closest(".entry-panel")?.setAttribute("aria-label", "Saisie des dépenses");
  const entryTitle = document.createElement("h2");
  entryTitle.className = "entry-title";
  entryTitle.textContent = "Saisie des dépenses";
  newExpenseButton.replaceWith(entryTitle);
}
document.querySelector("#openMasterButton").addEventListener("click", async () => {
  try {
    if (!masterBackup && dataFolderHandle && await activateFolder(dataFolderHandle) && masterBackup) {
      alert(`Fichier maître restauré : ${expenses.length} dépense(s) affichée(s).`);
      return;
    }
    await restoreMaster();
    if (masterBackup) alert(`Fichier maître restauré : ${expenses.length} dépense(s) affichée(s).`);
  } catch { alert("Ce fichier n’est pas un fichier maître ScanFac valide."); }
});
masterSelect.addEventListener("change", async () => {
  if (!masterSelect.value || !dataFolderHandle) return;
  try { const handle = await dataFolderHandle.getFileHandle(masterSelect.value); await applyMasterFile(await handle.getFile(), handle); alert(`Fichier maître restauré : ${expenses.length} dépense(s) affichée(s).`); }
  catch { alert("Impossible de restaurer ce fichier maître."); }
});
masterSelect.addEventListener("mousedown", async event => {
  if (!dataFolderHandle || await dataFolderHandle.queryPermission({ mode: "read" }) === "granted") return;
  event.preventDefault();
  if (await canWriteFolder(dataFolderHandle, true)) { await loadMileageParameters(dataFolderHandle); await refreshMasterList(dataFolderHandle); }
  else alert("Autorisez à nouveau le dossier Travail pour afficher les fichiers enregistrés.");
});
document.querySelector("#accountantButton").addEventListener("click", async () => {
  if (!masterBackup) { alert("Restaurez d’abord le fichier maître de cette personne."); return; }
  if (!confirm(`Préparer l’export comptable avec ${expenses.length} dépense(s) ?`)) return;
  accountantMode = true; monthRange = { from: "", to: "" }; render();
});
document.querySelector("#exportJsonButton").addEventListener("click", async () => {
  if (!masterBackup) { alert("Aucun fichier maître à exporter."); return; }
  try { await exportJson(); } catch { alert("Impossible de créer la copie de secours JSON."); }
});
document.querySelector("#exportJsonButton").title = "Crée une copie de secours complète des données au format JSON dans le dossier de travail.";
function askBeforeUpdate() { return new Promise(resolve => { const onClose = () => { updateDialog.removeEventListener("close", onClose); resolve(updateDialog.returnValue); }; updateDialog.addEventListener("close", onClose); updateDialog.showModal(); }); }
document.querySelector("#updateAppButton").addEventListener("click", async event => {
  if (hasUnsavedChanges) {
    const choice = await askBeforeUpdate();
    if (choice !== "yes" && choice !== "no") return;
    if (choice === "yes") { if (!masterBackup) { alert("Aucune comptabilité n’est ouverte à sauvegarder."); return; } try { if (!await saveMaster()) return; } catch { alert("Impossible de sauvegarder le fichier maître."); return; } }
    markSaved();
  }
  const button = event.currentTarget;
  const initialText = button.textContent;
  button.disabled = true;
  button.textContent = "Actualisation…";
  try {
    if (!("serviceWorker" in navigator) || location.protocol === "file:") { window.location.reload(); return; }
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration?.active) { window.location.reload(); return; }
    await registration.update();
    const channel = new MessageChannel();
    const fallbackReload = window.setTimeout(() => window.location.reload(), 5000);
    channel.port1.onmessage = () => { window.clearTimeout(fallbackReload); window.location.reload(); };
    registration.active.postMessage({ type: "scanfac-refresh-cache" }, [channel.port2]);
  } catch {
    window.location.reload();
  } finally {
    window.setTimeout(() => { button.disabled = false; button.textContent = initialText; }, 1500);
  }
});
async function restoreLastMaster(folder = dataFolderHandle) {
  const name = lastMasterFileName();
  if (!name || !folder || !await canReadFolder(folder)) return false;
  try { const handle = await folder.getFileHandle(name); await applyMasterFile(await handle.getFile(), handle); masterSelect.value = name; return true; }
  catch { forgetLastMasterFile(); return false; }
}
document.querySelector("#restoreInput").addEventListener("change", async event => {
  const file = event.target.files?.[0]; event.target.value = "";
  if (!file) return;
  try { await applyMasterFile(file); alert(`Fichier maître restauré : ${expenses.length} dépense(s) affichée(s).`); }
  catch { alert("Ce fichier n’est pas un fichier maître ScanFac valide."); }
});
storedFolder().then(async handle => { if (!handle) return; dataFolderHandle = handle; renderFolderSummary(); await loadMileageParameters(handle); await refreshMasterList(handle); await restoreLastMaster(handle); });
storedHandle(BACKUP_FOLDER_KEY).then(handle => { backupFolderHandle = handle; renderFolderSummary(); });
storedHandle(CSV_FOLDER_KEY).then(handle => { csvFolderHandle = handle; renderFolderSummary(); });
storedHandle(SCANLOT_FOLDER_KEY).then(async handle => { scanLotFolderHandle = handle; renderFolderSummary(); await refreshScanLotCsvList(); });
window.addEventListener("beforeunload", event => { if (!hasUnsavedChanges) return; event.preventDefault(); event.returnValue = ""; });
if ("serviceWorker" in navigator && location.protocol !== "file:") window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js?v=28").catch(() => {}));
renderPerson(); renderFolderSummary(); dateInput.value = currentDateValue(); renderNatureList(); updateExpenseInputMode(); render();
