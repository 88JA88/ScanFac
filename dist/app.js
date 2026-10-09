// Liste facilement adaptable lorsque les comptes seront définis avec le comptable.
const defaultExpenseTypes = [
  { label: "Restaurant", account: "" }, { label: "Parking", account: "" },
  { label: "Autoroute", account: "" }, { label: "Tramway", account: "" },
  { label: "Taxi", account: "" }, { label: "Hôtel", account: "" },
  { label: "Carburant", account: "" }, { label: "Fournitures", account: "" },
  { label: "Téléphone", account: "" }, { label: "Kilométrage", account: "" },
  { label: "Postage", account: "" }, { label: "Divers", account: "" }
];
let expenseTypes = defaultExpenseTypes.map(type => ({ ...type }));
const monthLabels = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
// Chaque personne possède une liste continue de dépenses dans son fichier JSON.
let expenses = [];
let sequences = {};
let selectedLabel = "";
let sortRules = [{ field: "order", direction: "asc" }];
let monthRange = { from: "", to: "" };
let monthFilterState = { operator: "=", value: "" };
let accountantMode = false;
let masterBackup = null;
let personName = "";
let masterFileHandle = null;
let dataFolderHandle = null;
let mileageParameters = JSON.parse(JSON.stringify(window.SCANFAC_PARAMETERS_DEFAULT));
let hasUnsavedChanges = false;

const body = document.querySelector("#expensesBody");
const emptyState = document.querySelector("#emptyState");
const dateInput = document.querySelector("#expenseDate");
const amountInput = document.querySelector("#expenseAmount");
const amountLabel = document.querySelector("#amountLabel");
const knownPlaces = document.querySelector("#knownPlaces");
const unsavedNotice = document.querySelector("#unsavedNotice");
const sortDialog = document.querySelector("#sortDialog");
const expenseTypesDialog = document.querySelector("#expenseTypesDialog");
const expenseTypeList = document.querySelector("#expenseTypeList");
const expenseTypeName = document.querySelector("#expenseTypeName");
const expenseTypeAccount = document.querySelector("#expenseTypeAccount");
const guideDialog = document.querySelector("#guideDialog");
const hoverTips = {
  backupButton: "Enregistre les dépenses et les paramètres dans le dossier de travail.",
  exportJsonButton: "Crée une copie de secours complète au format JSON dans le dossier de travail.",
  accountantButton: "Prépare l’export comptable et permet de choisir la période.",
  openMasterButton: "Ouvre un fichier maître ScanFac existant.",
  folderButton: "Choisit le dossier où ScanFac enregistre les fichiers."
};
Object.entries(hoverTips).forEach(([id, text]) => { const element = document.querySelector(`#${id}`); if (element) element.dataset.tooltip = text; });
const fromMonth = document.querySelector("#fromMonth");
const toMonth = document.querySelector("#toMonth");
const periodFilter = document.querySelector("#periodFilter");
const monthOperator = document.querySelector("#monthOperator");
const monthFilter = document.querySelector("#monthFilter");
const personInput = document.querySelector("#personName");
const masterSelect = document.querySelector("#masterSelect");
function renderPerson() { personInput.textContent = personName; }
document.querySelector("#guideButton").addEventListener("click", () => guideDialog.showModal());
function markUnsaved() { hasUnsavedChanges = true; unsavedNotice.hidden = false; }
function markSaved() { hasUnsavedChanges = false; unsavedNotice.hidden = true; }
function currentMonthValue() { return new Date().toLocaleDateString("en-CA").slice(0, 7); }
function renderMonthOptions() {
  const year = currentMonthValue().slice(0, 4);
  dateInput.innerHTML = monthLabels.map((label, index) => `<option value="${year}-${String(index + 1).padStart(2, "0")}">${label}</option>`).join("");
}
function escapeHtml(value = "") { return String(value).replace(/[&<>'"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[char]); }
function amountNumber(value) { return Number(String(value).trim().replace(/\s/g, "").replace(",", ".")); }
function isMileageExpense() { return selectedLabel === "Kilométrage"; }
function needsRouteFields(label = selectedLabel) { return label === "Kilométrage" || label === "Autoroute"; }
function activeMileageCoefficient() {
  const row = mileageParameters.kilometrage?.[Number(mileageParameters.activePowerIndex || 0)];
  return row ? amountNumber(row.jusqua5000) : NaN;
}
function calculatedMileageAmount(kilometres) {
  const coefficient = activeMileageCoefficient();
  return Number.isFinite(kilometres) && kilometres >= 0 && Number.isFinite(coefficient) ? kilometres * coefficient : NaN;
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
function normalizedExpenses(items) { return items.map(expense => ({ ...expense, date: expense.date?.slice(0, 7) || currentMonthValue() })); }
function validExpenseTypes(types) { return Array.isArray(types) && types.length > 0 && types.every(type => typeof type?.label === "string" && type.label.trim()) && new Set(types.map(type => type.label.trim().toLocaleLowerCase("fr-FR"))).size === types.length; }
function cloneExpenseTypes(types = defaultExpenseTypes) { return types.map(type => ({ label: type.label.trim(), account: String(type.account || "").trim() })); }
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
function newMaster() { return { format: "scanfac-master", version: 2, ownerName: personName, updatedAt: new Date().toISOString(), expenseTypes: cloneExpenseTypes(expenseTypes), bundles: [] }; }
function masterFileName() { return `scanfac-${safeFileName(masterBackup.ownerName || personName)}.json`; }
function csvFileName() { return `scanfac-${safeFileName(personName || masterBackup?.ownerName || "frais")}-comptable.csv`; }
function downloadFile(content, type, name) { const blob = new Blob([content], { type }), link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = name; link.click(); URL.revokeObjectURL(link.href); }
function folderDb() { return new Promise((resolve, reject) => { const request = indexedDB.open("scanfac-local", 1); request.onupgradeneeded = () => request.result.createObjectStore("handles"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function storedFolder() {
  try { const db = await folderDb(); return await new Promise((resolve, reject) => { const request = db.transaction("handles", "readonly").objectStore("handles").get("data-folder"); request.onsuccess = () => { db.close(); resolve(request.result || null); }; request.onerror = () => { db.close(); reject(request.error); }; }); }
  catch { return null; }
}
async function rememberFolder(handle) {
  try { const db = await folderDb(); await new Promise((resolve, reject) => { const request = db.transaction("handles", "readwrite").objectStore("handles").put(handle, "data-folder"); request.onsuccess = () => { db.close(); resolve(); }; request.onerror = () => { db.close(); reject(request.error); }; }); }
  catch { /* Le dossier reste disponible pour cette session. */ }
}
async function canWriteFolder(handle, ask = false) { if (!handle) return false; const options = { mode: "readwrite" }; if (await handle.queryPermission(options) === "granted") return true; return ask && await handle.requestPermission(options) === "granted"; }
async function chooseDataFolder() {
  if (!("showDirectoryPicker" in window)) { alert("Le choix d’un dossier est disponible dans Chrome ou Edge. Les fichiers seront téléchargés de façon classique."); return false; }
  try { const handle = await window.showDirectoryPicker({ mode: "readwrite" }); if (!await activateFolder(handle)) return false; await rememberFolder(handle); alert(`Dossier de travail sélectionné : ${handle.name}.`); return true; }
  catch (error) { if (error.name !== "AbortError") alert("Impossible de sélectionner ce dossier."); return false; }
}
async function activateFolder(handle) {
  if (!await canWriteFolder(handle, true)) return false;
  dataFolderHandle = handle; await loadMileageParameters(handle); await refreshMasterList(handle); return true;
}
async function writeToFolder(name, content, type) { const handle = await dataFolderHandle.getFileHandle(name, { create: true }); const writable = await handle.createWritable(); await writable.write(new Blob([content], { type })); await writable.close(); }
async function refreshMasterList(folder = dataFolderHandle) {
  try {
    if (!folder || await folder.queryPermission({ mode: "read" }) !== "granted") { masterSelect.disabled = true; return; }
    const names = [];
    for await (const [name, handle] of folder.entries()) if (handle.kind === "file" && /^scanfac-(?!parametres\.json$|baremes\.json$).+\.json$/i.test(name)) names.push(name);
    names.sort((a, b) => a.localeCompare(b, "fr"));
    masterSelect.innerHTML = `<option value="">Fichiers enregistrés</option>${names.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name.replace(/^scanfac-|\.json$/gi, ""))}</option>`).join("")}`;
    masterSelect.disabled = names.length === 0;
    masterSelect.title = names.length ? "Choisir un fichier maître à restaurer" : "Aucun fichier maître dans ce dossier";
  } catch { masterSelect.disabled = true; }
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
async function exportJson() { const content = JSON.stringify(masterBackup, null, 2); if (dataFolderHandle && await canWriteFolder(dataFolderHandle, true)) { await writeToFolder(masterFileName(), content, "application/json"); return true; } downloadFile(content, "application/json", masterFileName()); return true; }
function downloadJson() { downloadFile(JSON.stringify(masterBackup, null, 2), "application/json", masterFileName()); }
async function saveMaster() {
  masterBackup.updatedAt = new Date().toISOString();
  if (!dataFolderHandle && "showDirectoryPicker" in window && !await chooseDataFolder()) return false;
  if (dataFolderHandle && await canWriteFolder(dataFolderHandle, true)) { await writeToFolder(masterFileName(), JSON.stringify(masterBackup, null, 2), "application/json"); await refreshMasterList(); return true; }
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
    await writable.write(JSON.stringify(masterBackup, null, 2)); await writable.close();
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
  masterBackup = backup; masterFileHandle = handle; personName = backup.ownerName || "";
  expenses = masterExpenses(backup); sequences = masterSequences(backup, expenses); expenseTypes = validExpenseTypes(backup.expenseTypes) ? cloneExpenseTypes(backup.expenseTypes) : cloneExpenseTypes(); selectedLabel = "";
  monthRange = { from: "", to: "" }; monthFilterState = { operator: "=", value: "" }; accountantMode = false;
  markSaved(); renderPerson(); renderNatureList(); render();
}
function isInSelectedPeriod(expense) { return !accountantMode || ((!monthRange.from || expense.date >= monthRange.from) && (!monthRange.to || expense.date <= monthRange.to)); }
function matchesMonthFilter(expense) {
  if (!monthFilterState.value) return true;
  return monthFilterState.operator === "=" ? expense.date === monthFilterState.value : monthFilterState.operator === ">" ? expense.date > monthFilterState.value : expense.date < monthFilterState.value;
}
function comparable(expense, field) { return field === "amount" ? amountNumber(expense.amount) : String(expense[field] ?? ""); }
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
function monthName(value) { return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date(`${value}-01T12:00:00`)); }
function renderPeriodFilter() {
  const months = [...new Set(expenses.map(expense => expense.date))].sort();
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
  const months = [...new Set(expenses.map(expense => expense.date).filter(Boolean))].sort();
  if (!months.includes(monthFilterState.value)) monthFilterState.value = "";
  monthOperator.value = monthFilterState.operator;
  monthFilter.innerHTML = `<option value="">Tous</option>${months.map(month => `<option value="${month}">${monthName(month)}</option>`).join("")}`;
  monthFilter.value = monthFilterState.value;
}
function labelOptions(value) { return expenseTypes.map(type => `<option value="${escapeHtml(type.label)}" ${type.label === value ? "selected" : ""}>${escapeHtml(type.label)}</option>`).join(""); }
function renderNatureList() {
  document.querySelector("#natureList").innerHTML = expenseTypes.map(type => `<button type="button" class="nature-button ${type.label === selectedLabel ? "selected" : ""}" data-label="${escapeHtml(type.label)}">${escapeHtml(type.label)}</button>`).join("");
}
function renderExpenseTypeList() {
  expenseTypeList.innerHTML = expenseTypes.map(type => {
    const used = expenses.some(expense => expense.label === type.label);
    const disabled = used || expenseTypes.length === 1;
    const title = used ? "Cette nature est déjà utilisée" : "Conservez au moins une nature de frais";
    return `<div class="expense-type-row"><span><b>${escapeHtml(type.label)}</b>${type.account ? ` <small>Compte ${escapeHtml(type.account)}</small>` : ""}</span><button class="delete-expense-type" type="button" data-delete-expense-type="${escapeHtml(type.label)}" ${disabled ? `disabled title="${title}"` : ""}>Supprimer</button></div>`;
  }).join("");
}
function renderTotals() {
  const periodExpenses = expenses.filter(expense => isInSelectedPeriod(expense) && matchesMonthFilter(expense));
  const total = periodExpenses.reduce((sum, expense) => sum + amountNumber(expense.amount), 0);
  const kilometres = periodExpenses.filter(expense => expense.label === "Kilométrage").reduce((sum, expense) => sum + amountNumber(expense.kilometres || 0), 0);
  const groupByMonth = sortRules[0]?.field === "date";
  document.querySelector("#grandTotal").textContent = euro(total);
  document.querySelector("#kilometerTotal").textContent = kilometres ? `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(kilometres)} km` : "";
  document.querySelector("#periodLabel").textContent = `${periodExpenses.length} dépense${periodExpenses.length > 1 ? "s" : ""} enregistrée${periodExpenses.length > 1 ? "s" : ""}`;
  document.querySelector("#totalsHeading").textContent = groupByMonth ? "Totaux par mois" : "Totaux par libellé";
  // L'ordre d'apparition des groupes suit le tri actif du tableau.
  const sums = new Map(); sortedFilteredExpenses().forEach(e => {
    const key = groupByMonth ? monthName(e.date) : e.label;
    sums.set(key, (sums.get(key) || 0) + amountNumber(e.amount));
  });
  document.querySelector("#labelTotals").innerHTML = sums.size
    ? [...sums.entries()].map(([label, total]) => `<span>${escapeHtml(label)} <b>${euro(total)}</b></span>`).join("")
    : "<span>Les totaux apparaîtront ici.</span>";
}
function render() {
  renderKnownPlaces();
  renderMonthFilter();
  const rows = sortedFilteredExpenses();
  document.querySelector("#expenseCount").textContent = `${expenses.length} dépense${expenses.length > 1 ? "s" : ""}`;
  body.innerHTML = rows.map(e => { const route = needsRouteFields(e.label), direction = e.routeDirection || "↔"; return `<tr data-id="${e.id}"><td><strong class="order-number">${escapeHtml(e.order)}</strong></td><td><select class="cell-select" data-field="label" aria-label="Libellé">${labelOptions(e.label)}</select></td><td><input class="cell-input amount" data-field="amount" inputmode="decimal" value="${escapeHtml(e.amount)}" aria-label="Montant TTC" ${e.label === "Kilométrage" ? "readonly title=\"Montant calculé à partir des kilomètres\"" : ""} /></td><td>${route ? `<input class="cell-input route-input" data-field="departure" value="${escapeHtml(e.departure || "")}" placeholder="Départ" aria-label="Départ" list="knownPlaces" />` : ""}</td><td>${route ? `<select class="cell-select direction-select" data-field="routeDirection" aria-label="Sens du trajet"><option value="→" ${direction === "→" ? "selected" : ""}>⟶</option><option value="↔" ${direction === "↔" ? "selected" : ""}>⟷</option></select>` : ""}</td><td>${route ? `<input class="cell-input route-input" data-field="arrival" value="${escapeHtml(e.arrival || "")}" placeholder="Arrivée" aria-label="Arrivée" list="knownPlaces" />` : ""}</td><td>${e.label === "Kilométrage" ? `<input class="cell-input kilometer-recap" value="${escapeHtml(e.kilometres ?? "")} km" aria-label="Kilomètres" readonly />` : ""}</td><td><button class="delete-button" data-action="delete" aria-label="Supprimer ${escapeHtml(e.order)}" title="Supprimer">×</button></td></tr>`; }).join("");
  if (emptyState) emptyState.hidden = rows.length !== 0; renderTotals(); renderPeriodFilter();
}
function getExpense(id) { return expenses.find(e => e.id === id); }
function updateExpense(expense, field, value) {
  if (field === "amount") { const amount = amountNumber(value); if (!Number.isFinite(amount) || amount < 0) return false; expense.amount = amount.toFixed(2).replace(".", ","); }
  else if (field === "label") { expense.label = value; expense.account = typeFor(value).account; }
  else expense[field] = value;
  return true;
}
document.querySelector("#manageExpenseTypesButton").addEventListener("click", () => { renderExpenseTypeList(); expenseTypeName.value = ""; expenseTypeAccount.value = ""; expenseTypesDialog.showModal(); expenseTypeName.focus(); });
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
  markUnsaved(); selectedLabel = ""; amountInput.value = ""; amountInput.setCustomValidity(""); renderNatureList(); updateExpenseInputMode(); render(); amountInput.focus();
});
body.addEventListener("change", event => {
  const field = event.target.dataset.field; if (!field) return;
  const expense = getExpense(event.target.closest("tr").dataset.id);
  if (!updateExpense(expense, field, event.target.value)) { event.target.setCustomValidity("Montant invalide."); event.target.reportValidity(); } else markUnsaved();
  render();
});
body.addEventListener("click", event => {
  const button = event.target.closest('[data-action="delete"]'); if (!button) return;
  const expense = getExpense(button.closest("tr").dataset.id);
  if (confirm(`Supprimer la dépense ${expense.order} ? Son numéro ne sera jamais réutilisé.`)) { expenses = expenses.filter(e => e.id !== expense.id); markUnsaved(); render(); }
});
monthOperator.addEventListener("change", () => { monthFilterState.operator = monthOperator.value; render(); });
monthFilter.addEventListener("change", () => { monthFilterState.value = monthFilter.value; render(); });
fromMonth.addEventListener("change", () => { monthRange.from = fromMonth.value; if (monthRange.from > monthRange.to) monthRange.to = monthRange.from; render(); });
toMonth.addEventListener("change", () => { monthRange.to = toMonth.value; if (monthRange.to < monthRange.from) monthRange.from = monthRange.to; render(); });
const fields = [{ value:"date", label:"Mois" }, { value:"label", label:"Libellé" }, { value:"amount", label:"Montant TTC" }, { value:"order", label:"N° d’ordre" }];
const sortRulesEl = document.querySelector("#sortRules");
function renderSortRules() { sortRulesEl.innerHTML = sortRules.map((rule, index) => `<div class="sort-rule"><span class="rule-number">${index + 1}</span><select class="rule-select" data-sort-field="${index}">${fields.map(field => `<option value="${field.value}" ${field.value === rule.field ? "selected" : ""}>${field.label}</option>`).join("")}</select><select class="rule-select" data-sort-direction="${index}"><option value="asc" ${rule.direction === "asc" ? "selected" : ""}>Croissant</option><option value="desc" ${rule.direction === "desc" ? "selected" : ""}>Décroissant</option></select><button type="button" class="remove-rule" data-remove-rule="${index}" aria-label="Supprimer ce critère">×</button></div>`).join(""); }
document.querySelector("#sortByMonthButton").addEventListener("click", () => { sortRules = [{ field: "date", direction: "asc" }, { field: "label", direction: "asc" }, { field: "order", direction: "asc" }]; render(); });
document.querySelector("#sortByLabelButton").addEventListener("click", () => { sortRules = [{ field: "label", direction: "asc" }, { field: "date", direction: "asc" }, { field: "order", direction: "asc" }]; render(); });
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
  const headers = ["N° d’ordre", "Mois de saisie", "Libellé", "N° compte comptable", "Montant TTC", "Départ", "Sens", "Arrivée", "Kilomètres"];
  const byMonthThenDate = expenses.filter(isInSelectedPeriod).sort((a, b) => a.date.localeCompare(b.date) || a.order.localeCompare(b.order, "fr", { numeric: true }));
  const { total, kilometres, totalsByLabel } = csvTotals(byMonthThenDate);
  const summaryRows = [
    [],
    ["Récapitulatif", "", "", "", "Montant TTC", "", "", "", "Kilomètres"],
    ["Total général", "", "", "", total.toFixed(2).replace(".", ","), "", "", "", kilometres || ""],
    ...[...totalsByLabel.entries()].map(([label, amount]) => [`Total ${label}`, "", "", "", amount.toFixed(2).replace(".", ","), "", "", "", ""])
  ];
  const csv = [headers, ...byMonthThenDate.map(e => [e.order, e.date, e.label, e.account, e.amount, e.departure, e.routeDirection, e.arrival, e.kilometres]), ...summaryRows].map(row => row.map(csvValue).join(";")).join("\r\n");
  const content = "\uFEFF" + csv;
  if (dataFolderHandle && await canWriteFolder(dataFolderHandle, true)) {
    try { await writeToFolder(csvFileName(), content, "text/csv;charset=utf-8"); } catch { alert("Impossible d’écrire le CSV dans le dossier choisi."); }
  } else downloadFile(content, "text/csv;charset=utf-8", csvFileName());
}
document.querySelector("#exportButton").addEventListener("click", exportCsv);
document.querySelector("#sendEmailButton").addEventListener("click", async () => {
  const email = document.querySelector("#accountantEmail");
  if (!email.checkValidity()) { email.reportValidity(); return; }
  const subject = "ScanFac — dépenses professionnelles";
  const body = `Bonjour,\n\nVeuillez trouver ci-joint l’export CSV ScanFac (${csvFileName()}).\n\nCordialement,`;
  window.location.href = `mailto:${email.value.trim()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  void exportCsv();
});
document.querySelector("#backupButton").addEventListener("click", async () => {
  if (!expenses.length && !hasUnsavedChanges) { alert("Ajoutez une dépense ou modifiez les natures de frais avant de sauvegarder."); return; }
  if (!personName) { alert("Choisissez d’abord « Nouveau nom » ou restaurez un fichier maître."); return; }
  if (masterBackup && masterBackup.ownerName && masterBackup.ownerName !== personName) { alert("Cliquez sur « Nouvelle personne » avant de commencer une comptabilité différente."); return; }
  if (!masterBackup) masterBackup = newMaster();
  masterBackup.ownerName = personName;
  masterBackup.expenseTypes = cloneExpenseTypes(expenseTypes);
  // Les anciens fichiers à plusieurs liasses sont conservés à la lecture, puis
  // réunis en une seule liste continue lors de leur prochaine sauvegarde.
  masterBackup.bundles = [{ id: masterBackup.bundles[0]?.id || crypto.randomUUID(), savedAt: new Date().toISOString(), expenses, sequences }];
  if (await saveMaster()) markSaved();
});
document.querySelector("#newPersonButton").addEventListener("click", () => {
  const nextName = prompt("Nom de la personne :")?.trim();
  if (!nextName) return;
  if (!confirm(`Commencer une nouvelle comptabilité pour « ${nextName} » ? La liste affichée sera vidée, sans supprimer les fichiers JSON existants.`)) return;
  personName = nextName; masterBackup = null; masterFileHandle = null; expenses = []; sequences = {}; expenseTypes = cloneExpenseTypes(); monthRange = { from: "", to: "" }; monthFilterState = { operator: "=", value: "" }; accountantMode = false; markSaved(); renderPerson(); renderNatureList(); render(); amountInput.focus();
});
document.querySelector("#newExpenseButton").addEventListener("click", () => {
  selectedLabel = ""; dateInput.value = currentMonthValue(); amountInput.value = "";
  renderNatureList(); updateExpenseInputMode(); amountInput.focus();
});
document.querySelector("#openMasterButton").addEventListener("click", async () => {
  try {
    await restoreMaster();
    if (masterBackup) alert(`Fichier maître restauré : ${expenses.length} dépense(s) affichée(s).`);
  } catch { alert("Ce fichier n’est pas un fichier maître ScanFac valide."); }
});
masterSelect.addEventListener("change", async () => {
  if (!masterSelect.value || !dataFolderHandle) return;
  try { const handle = await dataFolderHandle.getFileHandle(masterSelect.value); await applyMasterFile(await handle.getFile(), handle); alert(`Fichier maître restauré : ${expenses.length} dépense(s) affichée(s).`); }
  catch { alert("Impossible de restaurer ce fichier maître."); }
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
document.querySelector("#folderButton").addEventListener("click", async () => { if (!dataFolderHandle || !await activateFolder(dataFolderHandle)) await chooseDataFolder(); });
document.querySelector("#updateAppButton").addEventListener("click", async event => {
  if (hasUnsavedChanges) { alert("Sauvegardez d’abord vos modifications avant d’actualiser l’application."); return; }
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
document.querySelector("#restoreInput").addEventListener("change", async event => {
  const file = event.target.files?.[0]; event.target.value = "";
  if (!file) return;
  try { await applyMasterFile(file); alert(`Fichier maître restauré : ${expenses.length} dépense(s) affichée(s).`); }
  catch { alert("Ce fichier n’est pas un fichier maître ScanFac valide."); }
});
storedFolder().then(async handle => { if (!handle) return; dataFolderHandle = handle; if (await canWriteFolder(handle)) { await loadMileageParameters(handle); await refreshMasterList(handle); } });
window.addEventListener("beforeunload", event => { if (!hasUnsavedChanges) return; event.preventDefault(); event.returnValue = ""; });
if ("serviceWorker" in navigator && location.protocol !== "file:") window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js?v=4").catch(() => {}));
renderPerson(); renderMonthOptions(); dateInput.value = currentMonthValue(); renderNatureList(); updateExpenseInputMode(); render();
