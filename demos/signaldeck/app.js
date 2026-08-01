const state = { data: null, view: "strategic" };
const $ = (selector) => document.querySelector(selector);
const number = new Intl.NumberFormat("en-US");
const safe = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));

function setText(selector, value) {
  const node = $(selector);
  if (node) node.textContent = value;
}

function eligibleAccounts() {
  return state.data.accounts
    .filter((account) => account.planning_eligible)
    .sort((a, b) => safe(b.priority_score) - safe(a.priority_score));
}

function strongestSignal(account) {
  const signals = [
    ["Hiring activity", safe(account.hiring_score)],
    ["Open-source activity", safe(account.open_source_score)],
    ["Public model activity", safe(account.model_score)],
  ];
  return signals.sort((a, b) => b[1] - a[1])[0][0];
}

function renderOverview() {
  const { metadata, summary } = state.data;
  const strategic = eligibleAccounts().filter((account) => account.priority_band === "Strategic");
  setText("#jobsScanned", number.format(metadata.public_open_jobs));
  setText("#companiesTracked", number.format(metadata.tracked_companies));
  setText("#strategicCount", number.format(summary.strategic_accounts));
  setText("#recommendationNames", strategic.map((account) => account.company).join(", ") + ".");
  setText("#imbalanceText", `${safe(summary.territory_imbalance_pct).toFixed(1)}%`);
  setText("#classificationRate", `${safe(metadata.classification_rate_pct).toFixed(1)}%`);
  setText("#reviewCount", number.format(summary.identity_review_queue));
  setText("#evidenceBoundary", metadata.evidence_boundary);
  const observed = new Date(metadata.observed_at);
  setText("#observedDate", `Observed ${observed.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })} UTC`);
}

function renderAccounts() {
  const all = eligibleAccounts();
  const accounts = state.view === "strategic" ? all.filter((account) => account.priority_band === "Strategic") : all;
  $("#accountTable").innerHTML = accounts.map((account, index) => `
    <tr data-account="${escapeHtml(account.canonical_account_id)}" tabindex="0">
      <td class="rank">${String(index + 1).padStart(2, "0")}</td>
      <td><span class="account-name">${escapeHtml(account.company)}</span></td>
      <td><span class="signal-label">${escapeHtml(strongestSignal(account))}</span></td>
      <td>${number.format(account.ai_jobs)}</td>
      <td><span class="score">${safe(account.priority_score).toFixed(1)}</span></td>
      <td><button class="row-action" type="button" data-account-button="${escapeHtml(account.canonical_account_id)}">View evidence</button></td>
    </tr>
  `).join("");

  document.querySelectorAll("[data-account]").forEach((row) => {
    row.addEventListener("click", () => openAccount(row.dataset.account));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openAccount(row.dataset.account); }
    });
  });
}

function renderTerritories() {
  const max = Math.max(...state.data.territories.map((territory) => safe(territory.weighted_potential)));
  $("#territoryList").innerHTML = state.data.territories.map((territory) => `
    <div class="territory-row">
      <strong>${escapeHtml(territory.scenario_territory)}</strong>
      <span>${territory.accounts} accounts</span>
      <div class="bar" aria-label="${safe(territory.weighted_potential).toFixed(1)} weighted potential"><i style="width:${100 * safe(territory.weighted_potential) / max}%"></i></div>
      <b>${safe(territory.weighted_potential).toFixed(1)}</b>
    </div>
  `).join("");
}

function signalItem(label, value) {
  return `<div class="signal-item"><span>${label}</span><div class="bar"><i style="width:${safe(value)}%"></i></div><strong>${safe(value).toFixed(0)}</strong></div>`;
}

function openAccount(accountId) {
  const account = state.data.accounts.find((item) => item.canonical_account_id === accountId);
  if (!account) return;
  const sources = [
    account.github_url ? `<a href="${escapeHtml(account.github_url)}" target="_blank" rel="noreferrer">GitHub evidence ↗</a>` : "",
    account.hf_url && account.hf_models > 0 ? `<a href="${escapeHtml(account.hf_url)}" target="_blank" rel="noreferrer">Hugging Face evidence ↗</a>` : "",
  ].join("");
  $("#dialogContent").innerHTML = `
    <div class="dialog-title">
      <p class="eyebrow">Account evidence · ${escapeHtml(account.priority_band)}</p>
      <h2>${escapeHtml(account.company)}</h2>
      <p>${escapeHtml(account.industry)} · ${escapeHtml(account.scenario_territory || "Unassigned")} territory</p>
    </div>
    <div class="dialog-score"><span>Panel-relative research score</span><strong>${safe(account.priority_score).toFixed(1)}</strong></div>
    <p class="dialog-boundary">This ranking determines research attention inside the monitored panel. It does not estimate purchase probability.</p>
    <div class="signal-breakdown">
      ${signalItem("Hiring activity", account.hiring_score)}
      ${signalItem("Open-source activity", account.open_source_score)}
      ${signalItem("Public model activity", account.model_score)}
    </div>
    <div class="evidence-list">
      <div><span>Relevant public openings</span><strong>${number.format(account.ai_jobs)}</strong></div>
      <div><span>Infrastructure-context openings</span><strong>${number.format(account.infra_jobs)}</strong></div>
      <div><span>Independent source families</span><strong>${number.format(account.evidence_sources)}</strong></div>
    </div>
    ${sources ? `<div class="source-links">${sources}</div>` : ""}
  `;
  $("#accountDialog").showModal();
}

function bindInteractions() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      document.querySelectorAll("[data-view]").forEach((item) => item.classList.toggle("active", item === button));
      renderAccounts();
    });
  });
  $(".dialog-close").addEventListener("click", () => $("#accountDialog").close());
}

async function init() {
  const response = await fetch("data/dashboard.json");
  if (!response.ok) throw new Error(`Dashboard data failed to load: ${response.status}`);
  state.data = await response.json();
  renderOverview();
  renderAccounts();
  renderTerritories();
  bindInteractions();
}

init().catch((error) => {
  console.error(error);
  document.body.insertAdjacentHTML("afterbegin", '<div style="padding:14px;background:#8b2c20;color:white">Unable to load the dashboard data. Please serve this folder through a local web server.</div>');
});
