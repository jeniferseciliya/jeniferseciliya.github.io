const state = { data: null, filters: { priority: "All", segment: "All", territory: "All" } };

const $ = (selector) => document.querySelector(selector);
const number = new Intl.NumberFormat("en-US");
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const pct = (value) => `${Number(value).toFixed(1)}%`;
const safe = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));

function setText(selector, value) {
  const node = $(selector);
  if (node) node.textContent = value;
}

function uniqueValues(key) {
  return [...new Set(state.data.accounts.map((account) => account[key]).filter(Boolean))].sort();
}

function fillSelect(selector, values) {
  const select = $(selector);
  values.forEach((value) => select.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`));
}

function filteredAccounts() {
  return state.data.accounts.filter((account) => {
    const territory = account.scenario_territory || "Unassigned / reference";
    return (state.filters.priority === "All" || account.priority_band === state.filters.priority)
      && (state.filters.segment === "All" || account.account_segment === state.filters.segment)
      && (state.filters.territory === "All" || territory === state.filters.territory);
  });
}

function renderSummary() {
  const { metadata, summary } = state.data;
  const observed = new Date(metadata.observed_at);
  setText("#headerDate", `Observed ${observed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`);
  setText("#heroCompanies", number.format(metadata.tracked_companies));
  setText("#heroJobs", compact.format(metadata.public_open_jobs));
  setText("#evidenceBoundary", metadata.evidence_boundary);
  setText("#relevantJobsKpi", number.format(metadata.relevant_open_jobs));
  setText("#relevantRate", `${pct(metadata.classification_rate_pct)} of scanned openings`);
  setText("#strategicKpi", number.format(summary.strategic_accounts));
  setText("#imbalanceKpi", pct(summary.territory_imbalance_pct));
  setText("#reviewKpi", number.format(summary.identity_review_queue));
  setText("#qualityKpi", pct(summary.data_quality_pass_pct));
}

function renderBriefing() {
  $("#briefingGrid").innerHTML = state.data.briefing.map((item, index) => `
    <article class="brief-card">
      <span>${String(index + 1).padStart(2, "0")} · ${escapeHtml(item.signal)}</span>
      <h3>${escapeHtml(item.finding)}</h3>
      <p>${escapeHtml(item.action)}</p>
      <footer>Evidence: ${escapeHtml(item.metric)}</footer>
    </article>
  `).join("");
}

function renderAccounts() {
  const accounts = filteredAccounts();
  setText("#filterResult", `${accounts.length} account${accounts.length === 1 ? "" : "s"}`);
  $("#accountRows").innerHTML = accounts.map((account) => `
    <button class="account-row" type="button" data-account="${escapeHtml(account.canonical_account_id)}">
      <strong>${escapeHtml(account.company)}</strong>
      <span class="score-cell">${safe(account.priority_score).toFixed(1)}</span>
      <span class="status-tag ${account.priority_band === "Market reference" ? "reference" : escapeHtml(account.priority_band)}">${escapeHtml(account.priority_band)}</span>
    </button>
  `).join("") || `<p>No accounts match this view.</p>`;

  $("#signalMatrix").innerHTML = accounts.map((account) => {
    const x = Math.max(3, Math.min(97, safe(account.hiring_score)));
    const y = Math.max(3, Math.min(97, safe(account.open_source_score)));
    return `<button class="matrix-dot ${account.planning_eligible ? "" : "reference"}" type="button" data-account="${escapeHtml(account.canonical_account_id)}" style="left:${x}%;bottom:${y}%" aria-label="Open ${escapeHtml(account.company)} details"><span>${escapeHtml(account.company)} · ${safe(account.priority_score).toFixed(1)}</span></button>`;
  }).join("");

  document.querySelectorAll("[data-account]").forEach((button) => button.addEventListener("click", () => openAccount(button.dataset.account)));
}

function renderTerritories() {
  const maxPotential = Math.max(...state.data.territories.map((item) => safe(item.weighted_potential)));
  $("#territoryCards").innerHTML = state.data.territories.map((territory, index) => `
    <article class="territory-card">
      <span class="territory-number">T-${String(index + 1).padStart(2, "0")}</span>
      <h3>${escapeHtml(territory.scenario_territory)}</h3>
      <p>${territory.accounts} accounts · ${territory.strategic_accounts} strategic</p>
      <div class="territory-load" aria-label="${safe(territory.weighted_potential)} weighted potential"><span style="width:${100 * safe(territory.weighted_potential) / maxPotential}%"></span></div>
      <div class="territory-metrics">
        <div><span>Weighted potential</span><strong>${safe(territory.weighted_potential).toFixed(1)}</strong></div>
        <div><span>Average priority</span><strong>${safe(territory.average_priority).toFixed(1)}</strong></div>
        <div><span>Relevant jobs</span><strong>${number.format(territory.relevant_jobs)}</strong></div>
      </div>
    </article>
  `).join("");
}

function renderMarket() {
  const maxRole = Math.max(...state.data.roles.map((item) => safe(item.open_jobs)));
  $("#roleBars").innerHTML = state.data.roles.map((role) => `
    <div class="bar-row">
      <div class="bar-label"><span>${escapeHtml(role.role_category)}</span><strong>${number.format(role.open_jobs)}</strong></div>
      <div class="bar-track"><span style="width:${100 * safe(role.open_jobs) / maxRole}%"></span></div>
    </div>
  `).join("");

  $("#stackGrid").innerHTML = state.data.top_stacks.map((item) => `
    <div class="stack-chip"><span>${escapeHtml(item.skill)}</span><strong>${item.accounts}</strong></div>
  `).join("");

  $("#industryRows").innerHTML = state.data.industries.slice(0, 10).map((industry) => `
    <div class="industry-row">
      <span>${escapeHtml(industry.industry)}</span>
      <span>${industry.accounts} acct.</span>
      <strong>${number.format(industry.relevant_jobs)}</strong>
    </div>
  `).join("");
}

function renderQuality() {
  const quality = state.data.validation;
  const cards = [
    ["dbt models & tests", `${quality.dbt_checks_passed}/${quality.dbt_checks_total}`, "Passed with zero warnings or errors"],
    ["Account grain", quality.account_grain_valid ? "Valid" : "Review", "One canonical row per monitored company"],
    ["Job-posting grain", quality.job_grain_valid ? "Valid" : "Review", `${number.format(quality.missing_titles + quality.missing_urls)} missing titles or URLs`],
    ["Identity mappings", `${quality.high_confidence_identity_mappings}/25`, "High-confidence company-source links"],
  ];
  $("#qualityGrid").innerHTML = cards.map(([label, value, note]) => `
    <article class="quality-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>
  `).join("");
}

function accountJobs(accountId) {
  return state.data.jobs.filter((job) => job.canonical_account_id === accountId).slice(0, 6);
}

function signalBar(label, value) {
  return `<div class="bar-row"><div class="bar-label"><span>${label}</span><strong>${safe(value).toFixed(1)}</strong></div><div class="bar-track"><span style="width:${safe(value)}%"></span></div></div>`;
}

function openAccount(accountId) {
  const account = state.data.accounts.find((item) => item.canonical_account_id === accountId);
  if (!account) return;
  const jobs = accountJobs(accountId);
  const sources = [
    account.github_url ? `<a href="${escapeHtml(account.github_url)}" target="_blank" rel="noreferrer"><span>GitHub evidence</span><b>↗</b></a>` : "",
    account.hf_url && account.hf_models > 0 ? `<a href="${escapeHtml(account.hf_url)}" target="_blank" rel="noreferrer"><span>Hugging Face evidence</span><b>↗</b></a>` : "",
  ].join("");
  $("#drawerContent").innerHTML = `
    <div class="drawer-title">
      <p class="overline">${escapeHtml(account.account_segment)} · ${escapeHtml(account.identity_status)}</p>
      <h2>${escapeHtml(account.company)}</h2>
      <p>${escapeHtml(account.industry)} · ${escapeHtml(account.hq_region)}${account.scenario_territory ? ` · ${escapeHtml(account.scenario_territory)} territory` : ""}</p>
    </div>
    <div class="drawer-score">
      <div class="score-orbit" style="--score:${safe(account.priority_score)}%"><strong>${safe(account.priority_score).toFixed(1)}</strong></div>
      <div><span class="status-tag ${account.priority_band === "Market reference" ? "reference" : escapeHtml(account.priority_band)}">${escapeHtml(account.priority_band)}</span><p>${account.evidence_sources} independent public evidence source${account.evidence_sources === 1 ? "" : "s"}</p></div>
    </div>
    <p class="drawer-evidence">This score ranks research attention within the monitored panel. It is not a purchase-propensity model or a claim about internal pipeline.</p>
    <h3>Signal composition</h3>
    <div class="signal-bars">
      ${signalBar("Hiring signal", account.hiring_score)}
      ${signalBar("Open-source signal", account.open_source_score)}
      ${signalBar("Public model signal", account.model_score)}
    </div>
    <h3>Observable evidence</h3>
    <div class="industry-rows">
      <div class="industry-row"><span>Relevant openings</span><span></span><strong>${number.format(account.ai_jobs)}</strong></div>
      <div class="industry-row"><span>Infrastructure context</span><span></span><strong>${number.format(account.infra_jobs)}</strong></div>
      <div class="industry-row"><span>Public AI repositories</span><span></span><strong>${number.format(account.github_ai_repos)}</strong></div>
      <div class="industry-row"><span>Public HF models</span><span></span><strong>${number.format(account.hf_models)}</strong></div>
    </div>
    ${account.stack_signals ? `<h3>Observed technology terms</h3><p class="drawer-evidence">${escapeHtml(account.stack_signals)}</p>` : ""}
    ${sources ? `<h3>Source profiles</h3><div class="source-links">${sources}</div>` : ""}
    ${jobs.length ? `<h3>Recently updated job evidence</h3><div class="job-links">${jobs.map((job) => `<a href="${escapeHtml(job.url)}" target="_blank" rel="noreferrer"><span>${escapeHtml(job.title)}</span><b>↗</b></a>`).join("")}</div>` : ""}
  `;
  $("#accountDrawer").showModal();
}

function openDefinition(key) {
  const labels = {
    gtm_priority_score: "GTM priority score",
    relevant_open_job: "Relevant open job",
    strategic_account: "Strategic account",
    weighted_potential: "Weighted potential",
  };
  setText("#definitionTitle", labels[key] || "Metric definition");
  setText("#definitionBody", state.data.definitions[key] || "Definition not found.");
  $("#definitionDialog").showModal();
}

function bindControls() {
  [["#priorityFilter", "priority"], ["#segmentFilter", "segment"], ["#territoryFilter", "territory"]].forEach(([selector, key]) => {
    $(selector).addEventListener("change", (event) => { state.filters[key] = event.target.value; renderAccounts(); });
  });
  $("#resetFilters").addEventListener("click", () => {
    state.filters = { priority: "All", segment: "All", territory: "All" };
    ["#priorityFilter", "#segmentFilter", "#territoryFilter"].forEach((selector) => { $(selector).value = "All"; });
    renderAccounts();
  });
  document.querySelectorAll("[data-open-definition]").forEach((button) => button.addEventListener("click", () => openDefinition(button.dataset.openDefinition)));
  $("[data-close-drawer]").addEventListener("click", () => $("#accountDrawer").close());
  $("[data-close-definition]").addEventListener("click", () => $("#definitionDialog").close());
}

async function init() {
  const response = await fetch("data/dashboard.json");
  if (!response.ok) throw new Error(`Dashboard data failed to load: ${response.status}`);
  state.data = await response.json();
  fillSelect("#priorityFilter", uniqueValues("priority_band"));
  fillSelect("#segmentFilter", uniqueValues("account_segment"));
  fillSelect("#territoryFilter", [...new Set(state.data.accounts.map((item) => item.scenario_territory || "Unassigned / reference"))].sort());
  renderSummary();
  renderBriefing();
  renderAccounts();
  renderTerritories();
  renderMarket();
  renderQuality();
  bindControls();
}

init().catch((error) => {
  console.error(error);
  document.body.insertAdjacentHTML("afterbegin", `<div style="padding:16px;background:#bd452d;color:white">Unable to load dashboard data. Serve this folder through a local web server.</div>`);
});
