/*
 * Modèle de document. Les champs date, fournisseur et montant sont les points
 * d'entrée prévus pour un futur module OCR : applyOcrResult(id, result).
 */
const categories = ["", "Repas", "Transport", "Fournitures", "Hébergement", "Téléphonie", "Autre"];
let documents = [
  { id: "SCN-20261007-001", fileName: "ticket_cafe_lilas.jpg", importedAt: "2026-10-07T08:42:00", documentCreatedAt: "2026-10-06", page: 1, category: "Repas", date: "2026-10-06", supplier: "Café des Lilas", amount: "18,50", needsReview: false, validationState: "validated", file: null, url: null },
  { id: "SCN-20261007-002", fileName: "facture_train_octobre.pdf", importedAt: "2026-10-07T08:43:00", documentCreatedAt: "2026-10-02", page: 1, category: "Transport", date: "2026-10-02", supplier: "SNCF Voyageurs", amount: "84,00", needsReview: true, validationState: "to_review", file: null, url: null },
  { id: "SCN-20261007-003", fileName: "fournitures-bureau.png", importedAt: "2026-10-07T08:45:00", documentCreatedAt: "", page: 1, category: "Fournitures", date: "", supplier: "", amount: "42,90", needsReview: true, validationState: "draft", file: null, url: null }
];
let sortRules = [{ field: "date", direction: "asc" }, { field: "supplier", direction: "asc" }];

const body = document.querySelector("#documentsBody");
const emptyState = document.querySelector("#emptyState");
const count = document.querySelector("#documentCount");
const fileInput = document.querySelector("#fileInput");
const searchInput = document.querySelector("#searchInput");
const reviewFilter = document.querySelector("#reviewFilter");
const sortDialog = document.querySelector("#sortDialog");
const sourceDialog = document.querySelector("#sourceDialog");

function frenchDate(value, withTime = false) {
  if (!value) return "Non renseignée";
  const date = new Date(value);
  return new Intl.DateTimeFormat("fr-FR", withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(date);
}
function escapeHtml(value = "") { return String(value).replace(/[&<>'"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[char]); }
function sortedFilteredDocuments() {
  const search = searchInput.value.trim().toLocaleLowerCase("fr");
  return documents.filter(d => (!reviewFilter.checked || d.needsReview) && (!search || `${d.fileName} ${d.supplier}`.toLocaleLowerCase("fr").includes(search)))
    .sort((a, b) => { for (const rule of sortRules) { const av = String(a[rule.field] || ""); const bv = String(b[rule.field] || ""); const compare = av.localeCompare(bv, "fr", { numeric: true }); if (compare) return rule.direction === "asc" ? compare : -compare; } return 0; });
}
function stateMarkup(doc) {
  const map = { validated: ["valid", "Validé"], to_review: ["review", "À contrôler"], draft: ["draft", "À compléter"] };
  const [klass, label] = map[doc.validationState]; return `<span class="status ${klass}">${label}</span>`;
}
function categoryOptions(value) { return categories.map(c => `<option value="${c}" ${c === value ? "selected" : ""}>${c || "—"}</option>`).join(""); }
function render() {
  const rows = sortedFilteredDocuments(); count.textContent = `${documents.length} document${documents.length > 1 ? "s" : ""}`;
  body.innerHTML = rows.map(d => `<tr data-id="${d.id}">
    <td class="source-cell"><button class="source-button" data-action="open-source" title="Voir le scan source">${escapeHtml(d.fileName)}</button><span class="source-meta">${d.id} · importé le ${frenchDate(d.importedAt)}</span></td>
    <td><select class="cell-select" data-field="category" aria-label="Catégorie">${categoryOptions(d.category)}</select></td>
    <td><input class="cell-input" data-field="date" type="date" value="${d.date}" aria-label="Date" /></td>
    <td><input class="cell-input" data-field="supplier" value="${escapeHtml(d.supplier)}" placeholder="À compléter" aria-label="Fournisseur" /></td>
    <td><input class="cell-input amount" data-field="amount" inputmode="decimal" value="${escapeHtml(d.amount)}" placeholder="0,00" aria-label="Montant" /></td>
    <td><label class="review-check" title="Signaler à vérifier"><input data-field="needsReview" type="checkbox" ${d.needsReview ? "checked" : ""} aria-label="À vérifier" /></label></td>
    <td>${stateMarkup(d)}</td><td><button class="delete-button" data-action="delete" aria-label="Supprimer ${escapeHtml(d.fileName)}" title="Supprimer">×</button></td>
  </tr>`).join("");
  emptyState.hidden = rows.length !== 0;
}
function updateState(doc) { doc.validationState = doc.needsReview ? "to_review" : (doc.date && doc.supplier && doc.amount ? "validated" : "draft"); }
function getDocument(id) { return documents.find(d => d.id === id); }
function generateId() { return `SCN-${new Date().toISOString().slice(0,10).replaceAll("-", "")}-${String(documents.length + 1).padStart(3, "0")}`; }
function importFiles(files) { Array.from(files).forEach(file => { const now = new Date().toISOString(); documents.push({ id: generateId(), fileName: file.name, importedAt: now, documentCreatedAt: "", page: 1, category: "", date: "", supplier: "", amount: "", needsReview: true, validationState: "draft", file, url: URL.createObjectURL(file) }); }); render(); }

body.addEventListener("input", event => { const field = event.target.dataset.field; if (!field) return; const doc = getDocument(event.target.closest("tr").dataset.id); doc[field] = event.target.type === "checkbox" ? event.target.checked : event.target.value; updateState(doc); });
body.addEventListener("change", event => { if (event.target.dataset.field) { const doc = getDocument(event.target.closest("tr").dataset.id); doc[event.target.dataset.field] = event.target.type === "checkbox" ? event.target.checked : event.target.value; updateState(doc); render(); } });
body.addEventListener("click", event => { const row = event.target.closest("tr"); if (!row) return; const doc = getDocument(row.dataset.id); if (event.target.closest('[data-action="delete"]')) { if (confirm(`Supprimer « ${doc.fileName} » du tableau ?`)) { if (doc.url) URL.revokeObjectURL(doc.url); documents = documents.filter(d => d.id !== doc.id); render(); } } if (event.target.closest('[data-action="open-source"]')) openSource(doc); });
fileInput.addEventListener("change", event => { importFiles(event.target.files); event.target.value = ""; });
searchInput.addEventListener("input", render); reviewFilter.addEventListener("change", render);
document.querySelector("#addDemoButton").addEventListener("click", () => { documents.push({ id: generateId(), fileName: "nouveau_justificatif.jpg", importedAt: new Date().toISOString(), documentCreatedAt: "", page: 1, category: "", date: "", supplier: "", amount: "", needsReview: true, validationState: "draft", file: null, url: null }); render(); });

function openSource(doc) { const preview = doc.file?.type.startsWith("image/") ? `<img src="${doc.url}" alt="Aperçu de ${escapeHtml(doc.fileName)}" />` : `<div class="file-placeholder"><b>${doc.file?.type === "application/pdf" ? "PDF" : "SCAN"}</b><span>L’aperçu du fichier source apparaîtra ici.<br>${doc.url && doc.file?.type === "application/pdf" ? "Ouvrez le PDF local pour le consulter." : "Aucun fichier associé à cette ligne de démonstration."}</span></div>`; document.querySelector("#sourceContent").innerHTML = `<h2 class="source-title">${escapeHtml(doc.fileName)}</h2><p class="source-info">Source ${doc.id} · importée le ${frenchDate(doc.importedAt, true)}</p><div class="preview">${preview}</div><div class="source-details"><div><span>Date de création / impression</span>${frenchDate(doc.documentCreatedAt)}</div><div><span>Page</span>${doc.page || "—"}</div></div>`; sourceDialog.showModal(); }

const sortRulesEl = document.querySelector("#sortRules");
const fields = [{ value:"date", label:"Date" }, { value:"supplier", label:"Fournisseur" }, { value:"category", label:"Catégorie" }, { value:"amount", label:"Montant" }, { value:"fileName", label:"Nom du fichier" }];
function renderSortRules() { sortRulesEl.innerHTML = sortRules.map((rule, index) => `<div class="sort-rule"><span class="rule-number">${index + 1}</span><select class="rule-select" data-sort-field="${index}">${fields.map(f => `<option value="${f.value}" ${f.value === rule.field ? "selected" : ""}>${f.label}</option>`).join("")}</select><select class="rule-select" data-sort-direction="${index}"><option value="asc" ${rule.direction === "asc" ? "selected" : ""}>Croissant</option><option value="desc" ${rule.direction === "desc" ? "selected" : ""}>Décroissant</option></select><button type="button" class="remove-rule" data-remove-rule="${index}" aria-label="Supprimer ce critère">×</button></div>`).join(""); }
document.querySelector("#sortButton").addEventListener("click", () => { renderSortRules(); sortDialog.showModal(); });
document.querySelector("#addSortRule").addEventListener("click", () => { sortRules.push({ field: "date", direction: "asc" }); renderSortRules(); });
sortRulesEl.addEventListener("change", event => { const index = event.target.dataset.sortField ?? event.target.dataset.sortDirection; if (index !== undefined) sortRules[index][event.target.dataset.sortField !== undefined ? "field" : "direction"] = event.target.value; });
sortRulesEl.addEventListener("click", event => { const index = event.target.dataset.removeRule; if (index !== undefined && sortRules.length > 1) { sortRules.splice(index, 1); renderSortRules(); } });
document.querySelector("#applySort").addEventListener("click", () => render());

function csvValue(value) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }
document.querySelector("#exportButton").addEventListener("click", () => { const headers = ["ID scan", "Fichier source", "Date importation", "Date création/impression", "Page", "Catégorie", "Date", "Fournisseur", "Montant", "À vérifier", "État validation"]; const lines = [headers, ...sortedFilteredDocuments().map(d => [d.id,d.fileName,d.importedAt,d.documentCreatedAt,d.page,d.category,d.date,d.supplier,d.amount,d.needsReview ? "Oui" : "Non",d.validationState])].map(row => row.map(csvValue).join(";")); const blob = new Blob(["\\uFEFF" + lines.join("\\r\\n")], { type:"text/csv;charset=utf-8" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `scanfac-export-${new Date().toISOString().slice(0,10)}.csv`; link.click(); URL.revokeObjectURL(link.href); });

// Replace the initial button node so the export handler remains isolated and easy to evolve.
const exportButton = document.querySelector("#exportButton");
const freshExportButton = exportButton.cloneNode(true);
exportButton.replaceWith(freshExportButton);
freshExportButton.addEventListener("click", () => {
  const headers = ["ID scan", "Fichier source", "Date importation", "Date création/impression", "Page", "Catégorie", "Date", "Fournisseur", "Montant", "À vérifier", "État validation"];
  const rows = sortedFilteredDocuments().map(d => [d.id, d.fileName, d.importedAt, d.documentCreatedAt, d.page, d.category, d.date, d.supplier, d.amount, d.needsReview ? "Oui" : "Non", d.validationState]);
  const csv = [headers, ...rows].map(row => row.map(csvValue).join(";")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "scanfac-export-" + new Date().toISOString().slice(0, 10) + ".csv";
  link.click();
  URL.revokeObjectURL(link.href);
});

// Point d'intégration OCR ultérieur : applyOcrResult(id, { date, supplier, amount, documentCreatedAt }).
function applyOcrResult(id, result) { const doc = getDocument(id); if (!doc) return; ["date", "supplier", "amount", "documentCreatedAt"].forEach(field => { if (result[field] !== undefined) doc[field] = result[field]; }); doc.needsReview = true; updateState(doc); render(); }
window.applyOcrResult = applyOcrResult;
render();
