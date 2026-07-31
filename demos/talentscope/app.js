const state = { data: null, family: "People & Talent", market: "Bay Area" };

const el = (id) => document.getElementById(id);
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function segmentKey() {
  return `${slug(state.family)}__${slug(state.market)}`;
}

function formatPercent(value, signed = false) {
  if (value === null || value === undefined) return "—";
  const prefix = signed && value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(1)}%`;
}

function renderBars(target, rows, labelKey, valueKey, formatter = compact.format.bind(compact)) {
  const container = el(target);
  container.innerHTML = "";
  if (!rows?.length) {
    container.innerHTML = '<p class="empty-state">No records for this view.</p>';
    return;
  }
  const max = Math.max(...rows.map((row) => Number(row[valueKey]) || 0), 1);
  rows.forEach((row, index) => {
    const item = document.createElement("div");
    item.className = "bar-item";
    item.innerHTML = `
      <span class="bar-label" title="${row[labelKey]}">${row[labelKey]}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${(row[valueKey] / max) * 100}%;animation-delay:${index * 35}ms"></span></span>
      <span class="bar-value">${formatter(Number(row[valueKey]))}</span>`;
    container.appendChild(item);
  });
}

function renderTable(target, rows, labelKey) {
  const body = el(target);
  body.innerHTML = "";
  rows.slice(0, 10).forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td title="${row[labelKey]}">${row[labelKey]}</td>
      <td>${integer.format(row.positions)}</td>
      <td>${currency.format(row.median_salary_floor)}</td>`;
    body.appendChild(tr);
  });
}

function renderTrend(rows) {
  const target = el("trendChart");
  if (!rows.length) return;
  const width = 900;
  const height = 285;
  const pad = { left: 48, right: 22, top: 25, bottom: 38 };
  const values = rows.map((row) => Number(row.positions));
  const max = Math.max(...values) * 1.12;
  const x = (index) => pad.left + (index * (width - pad.left - pad.right)) / Math.max(rows.length - 1, 1);
  const y = (value) => height - pad.bottom - (value / max) * (height - pad.top - pad.bottom);
  const points = rows.map((row, index) => `${x(index)},${y(row.positions)}`).join(" ");
  const area = `${pad.left},${height - pad.bottom} ${points} ${x(rows.length - 1)},${height - pad.bottom}`;
  const grid = [0, 0.5, 1].map((ratio) => {
    const gy = pad.top + ratio * (height - pad.top - pad.bottom);
    const label = compact.format(max * (1 - ratio));
    return `<line class="grid-line" x1="${pad.left}" y1="${gy}" x2="${width - pad.right}" y2="${gy}"/><text class="axis-label" x="0" y="${gy + 3}">${label}</text>`;
  }).join("");
  const dots = rows.map((row, index) => `
    <circle class="trend-dot" cx="${x(index)}" cy="${y(row.positions)}" r="5">
      <title>${row.decision_month}: ${integer.format(row.positions)} positions</title>
    </circle>
    <text class="axis-label" x="${x(index)}" y="${height - 12}" text-anchor="middle">${row.decision_month.slice(5)}</text>
  `).join("");
  target.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      ${grid}
      <polygon class="trend-area" points="${area}" />
      <polyline class="trend-line" points="${points}" />
      ${dots}
    </svg>`;
}

function updateDashboard() {
  const segment = state.data.segments[segmentKey()];
  if (!segment) return;
  const summary = segment.summary;

  el("selectionLabel").textContent = `${state.family} · ${state.market}`;
  el("positionsKpi").textContent = compact.format(summary.certified_positions);
  el("newPositionsKpi").textContent = compact.format(summary.new_employment_positions);
  el("salaryKpi").textContent = currency.format(summary.median_salary_floor);
  el("premiumKpi").textContent = formatPercent(summary.median_premium_pct, true);
  el("certificationKpi").textContent = formatPercent(summary.certification_rate_pct);
  el("processingKpi").textContent = `${integer.format(summary.median_processing_days)}d`;
  el("processingP90").textContent = `P90: ${integer.format(summary.p90_processing_days)} days`;

  el("salaryDelta").textContent = state.market === "United States"
    ? "Annualized lower bound"
    : `${formatPercent(summary.market_salary_delta_pct, true)} vs national ${state.family.toLowerCase()}`;

  el("lowPremium").textContent = formatPercent(summary.low_premium_share_pct);
  el("concentration").textContent = formatPercent(summary.top_10_employer_share_pct);
  el("belowPrevailing").textContent = integer.format(summary.below_prevailing_cases);

  el("insightList").innerHTML = segment.insights.map((insight) => `<li>${insight}</li>`).join("");
  el("geographyTitle").textContent = state.market === "Bay Area" ? "Leading Bay Area cities" : "Leading states";

  renderTrend(segment.monthly);
  renderBars("salaryBars", segment.salary_bands, "salary_band", "filings", integer.format.bind(integer));
  renderBars("wageLevelBars", segment.wage_levels, "pw_wage_level", "filings", compact.format.bind(compact));
  renderBars("pipelineBars", segment.pipeline, "case_status", "cases", compact.format.bind(compact));
  renderBars("actionBars", segment.actions, "employment_action", "positions", compact.format.bind(compact));
  renderBars(
    "geographyBars",
    segment.geography,
    state.market === "Bay Area" ? "city" : "state",
    "positions",
    compact.format.bind(compact),
  );
  renderTable("employerTable", segment.employers, "employer");
  renderTable("occupationTable", segment.occupations, "occupation");
}

function fillSelect(select, values) {
  values.forEach((value) => select.add(new Option(value, value)));
}

async function init() {
  const response = await fetch("data/dashboard.json");
  if (!response.ok) throw new Error(`Dashboard data failed to load: ${response.status}`);
  state.data = await response.json();
  fillSelect(el("familyFilter"), state.data.filters.job_families);
  fillSelect(el("marketFilter"), state.data.filters.markets);
  el("familyFilter").value = state.family;
  el("marketFilter").value = state.market;
  el("methodNote").textContent = state.data.metadata.method_note;

  el("familyFilter").addEventListener("change", (event) => {
    state.family = event.target.value;
    updateDashboard();
  });
  el("marketFilter").addEventListener("change", (event) => {
    state.market = event.target.value;
    updateDashboard();
  });
  el("resetFilters").addEventListener("click", () => {
    state.family = "People & Talent";
    state.market = "Bay Area";
    el("familyFilter").value = state.family;
    el("marketFilter").value = state.market;
    updateDashboard();
  });
  updateDashboard();
}

init().catch((error) => {
  console.error(error);
  document.body.innerHTML = `<main class="load-error"><h1>TalentScope</h1><p>${error.message}</p></main>`;
});
