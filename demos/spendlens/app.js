const state = {
  data: null,
  department: "All departments",
  fiscalYear: "2026",
};

const byId = (id) => document.getElementById(id);
const number = new Intl.NumberFormat("en-US");
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function formatMoney(value, compactValue = false) {
  const amount = Number(value || 0);
  if (compactValue) {
    return `$${compact.format(amount)}`;
  }
  return money.format(amount);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function currentSummary() {
  return state.data.scope_summary.find(
    (row) => row.fiscal_year === state.fiscalYear && row.department === state.department,
  );
}

function aggregateMonthly() {
  const rows = state.data.monthly.filter(
    (row) =>
      (state.fiscalYear === "All" || String(row.fiscal_year) === state.fiscalYear) &&
      (state.department === "All departments" || row.department === state.department),
  );
  const grouped = new Map();
  rows.forEach((row) => {
    const useFiscalPeriod = state.fiscalYear !== "All";
    const key = useFiscalPeriod
      ? `P${String(row.fiscal_period).padStart(2, "0")}`
      : row.transaction_month;
    const current = grouped.get(key) || {
      month: key,
      sortKey: useFiscalPeriod ? Number(row.fiscal_period) : row.transaction_month,
      netSpend: 0,
      transactions: 0,
    };
    current.netSpend += Number(row.net_spend || 0);
    current.transactions += Number(row.transactions || 0);
    grouped.set(key, current);
  });
  const result = [...grouped.values()].sort((a, b) =>
    typeof a.sortKey === "number"
      ? a.sortKey - b.sortKey
      : a.sortKey.localeCompare(b.sortKey),
  );
  result.forEach((row, index) => {
    const prior = result.slice(Math.max(0, index - 3), index);
    row.trailingAverage = prior.length
      ? prior.reduce((sum, item) => sum + item.netSpend, 0) / prior.length
      : null;
  });
  return result;
}

function renderKpis() {
  const summary = currentSummary();
  if (!summary) return;
  byId("kpi-spend").textContent = formatMoney(summary.net_spend, true);
  byId("kpi-transactions").textContent = compact.format(summary.transactions);
  byId("kpi-merchants").textContent = compact.format(summary.merchants);
  byId("kpi-signals").textContent = number.format(summary.review_signals);
  const rate = summary.transactions ? (100 * summary.review_signals) / summary.transactions : 0;
  byId("kpi-signals-note").textContent = `${rate.toFixed(1)}% routed for review · ${number.format(summary.high_priority)} high priority`;
  byId("kpi-spend-note").textContent = `${formatMoney(summary.gross_spend, true)} purchases less ${formatMoney(summary.credits, true)} credits`;
}

function linePath(points, x, y, valueKey) {
  return points
    .filter((point) => point[valueKey] !== null)
    .map((point, index) => `${index === 0 ? "M" : "L"}${x(point.index).toFixed(1)},${y(point[valueKey]).toFixed(1)}`)
    .join(" ");
}

function renderTrend() {
  const rows = aggregateMonthly().map((row, index) => ({ ...row, index }));
  const container = byId("spend-chart");
  if (!rows.length) {
    container.innerHTML = '<p class="empty-state">No monthly data for this scope.</p>';
    return;
  }
  const width = 920;
  const height = 330;
  const margin = { top: 26, right: 26, bottom: 38, left: 70 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const values = rows.flatMap((row) => [row.netSpend, row.trailingAverage]).filter((value) => value !== null);
  let minValue = Math.min(0, ...values);
  let maxValue = Math.max(...values);
  if (minValue === maxValue) maxValue = minValue + 1;
  const x = (index) => margin.left + (index / Math.max(rows.length - 1, 1)) * plotWidth;
  const y = (value) => margin.top + (1 - (value - minValue) / (maxValue - minValue)) * plotHeight;
  const spendPath = linePath(rows, x, y, "netSpend");
  const averagePath = linePath(rows, x, y, "trailingAverage");
  const areaPath = `${spendPath} L${x(rows.length - 1)},${margin.top + plotHeight} L${x(0)},${margin.top + plotHeight} Z`;
  const ticks = Array.from({ length: 5 }, (_, index) => minValue + ((maxValue - minValue) * index) / 4);
  const labelStep = Math.max(1, Math.ceil(rows.length / 7));
  const latest = rows.at(-1);

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" aria-hidden="true">
      <defs>
        <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#d7ff64" stop-opacity=".46" />
          <stop offset="1" stop-color="#d7ff64" stop-opacity="0" />
        </linearGradient>
      </defs>
      ${ticks
        .map(
          (tick) => `
            <line class="chart-grid" x1="${margin.left}" x2="${width - margin.right}" y1="${y(tick)}" y2="${y(tick)}" />
            <text class="chart-axis" x="${margin.left - 12}" y="${y(tick) + 3}" text-anchor="end">${escapeHtml(formatMoney(tick, true))}</text>
          `,
        )
        .join("")}
      <path class="chart-area" d="${areaPath}" />
      <path class="chart-average" d="${averagePath}" />
      <path class="chart-line" d="${spendPath}" />
      ${rows
        .filter((_, index) => index % labelStep === 0 || index === rows.length - 1)
        .map(
          (row) => `<text class="chart-axis" x="${x(row.index)}" y="${height - 9}" text-anchor="middle">${row.month.slice(0, 7)}</text>`,
        )
        .join("")}
      <circle class="chart-dot" cx="${x(latest.index)}" cy="${y(latest.netSpend)}" r="5" />
      <text class="chart-callout" x="${Math.max(margin.left, x(latest.index) - 6)}" y="${Math.max(13, y(latest.netSpend) - 13)}" text-anchor="end">${escapeHtml(formatMoney(latest.netSpend, true))}</text>
    </svg>`;

  const first = rows[0];
  byId("trend-context").textContent = state.fiscalYear === "All"
    ? `${rows.length} observed months, from ${first.month.slice(0, 7)} through ${latest.month.slice(0, 7)}.`
    : `${rows.length} posted fiscal periods, from ${first.month} through ${latest.month}.`;
}

function renderCategories() {
  const rows = state.data.categories
    .filter(
      (row) => row.fiscal_year === state.fiscalYear && row.department === state.department,
    )
    .sort((a, b) => b.net_spend - a.net_spend)
    .slice(0, 8);
  const total = rows.reduce((sum, row) => sum + Math.max(0, Number(row.net_spend)), 0);
  byId("category-bars").innerHTML = rows.length
    ? rows
        .map((row, index) => {
          const share = total ? (100 * Math.max(0, row.net_spend)) / total : 0;
          return `
            <div class="rank-item">
              <span class="rank-item__index">${String(index + 1).padStart(2, "0")}</span>
              <div class="rank-item__label">
                <strong title="${escapeHtml(row.category)}">${escapeHtml(row.category)}</strong>
                <div class="rank-item__bar"><i style="width:${share.toFixed(1)}%"></i></div>
              </div>
              <span class="rank-item__value">${escapeHtml(formatMoney(row.net_spend, true))}</span>
            </div>`;
        })
        .join("")
    : '<p class="empty-state">No category data for this scope.</p>';
}

function renderSignals() {
  const summary = state.data.signal_summary.find(
    (row) => row.fiscal_year === state.fiscalYear && row.department === state.department,
  );
  const metrics = summary
    ? [
        ["High priority", summary.high_priority],
        ["Amount above P99", summary.high_amount],
        ["Merchant-day clusters", summary.vendor_day],
        ["New high-value merchant", summary.new_merchant],
        ["Weekend / large credit", Number(summary.weekend) + Number(summary.large_credit)],
      ]
    : [];
  byId("signal-summary").innerHTML = metrics
    .map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${number.format(value)}</strong></article>`)
    .join("");

  const rows = state.data.signals
    .filter(
      (row) =>
        (state.fiscalYear === "All" || String(row.fiscal_year) === state.fiscalYear) &&
        (state.department === "All departments" || row.department === state.department),
    )
    .sort((a, b) => b.review_score - a.review_score || Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, 10);
  byId("signal-table").innerHTML = rows.length
    ? rows
        .map(
          (row) => `
            <tr>
              <td><span class="priority priority--${row.review_priority.toLowerCase()}">${escapeHtml(row.review_priority)}</span></td>
              <td>${escapeHtml(row.transaction_date)}</td>
              <td><strong>${escapeHtml(row.merchant_normalized)}</strong><small>${escapeHtml(row.signal_reason)}</small></td>
              <td>${escapeHtml(row.category)}</td>
              <td class="numeric">${escapeHtml(formatMoney(row.amount))}</td>
            </tr>`,
        )
        .join("")
    : '<tr><td colspan="5" class="empty-state">No review signals for this scope.</td></tr>';
}

function renderMerchants() {
  const rows = state.data.merchants
    .filter(
      (row) => row.fiscal_year === state.fiscalYear && row.department === state.department,
    )
    .sort((a, b) => b.net_spend - a.net_spend)
    .slice(0, 8);
  byId("merchant-list").innerHTML = rows.length
    ? rows
        .map(
          (row, index) => `
            <div class="merchant-row">
              <span class="merchant-row__rank">${String(index + 1).padStart(2, "0")}</span>
              <div><strong>${escapeHtml(row.merchant_normalized)}</strong><small>${number.format(row.transactions)} transactions</small></div>
              <span class="merchant-row__value">${escapeHtml(formatMoney(row.net_spend, true))}</span>
            </div>`,
        )
        .join("")
    : '<p class="empty-state">No merchant data for this scope.</p>';
}

function renderEvidencePacket() {
  const summary = currentSummary();
  const monthly = aggregateMonthly();
  if (!summary || !monthly.length) return;
  const latest = monthly.at(-1);
  const prior = monthly.length > 1 ? monthly.at(-2) : null;
  const variance = prior && prior.netSpend
    ? (100 * (latest.netSpend - prior.netSpend)) / Math.abs(prior.netSpend)
    : null;
  const signal = state.data.signal_summary.find(
    (row) => row.fiscal_year === state.fiscalYear && row.department === state.department,
  );
  const packet = {
    scope: `${state.department} / FY${state.fiscalYear}`,
    latest_observed_period: state.fiscalYear === "All" ? latest.month.slice(0, 7) : `FY${state.fiscalYear} ${latest.month}`,
    latest_net_spend: Math.round(latest.netSpend),
    period_change_pct: variance === null ? null : Number(variance.toFixed(1)),
    review_signals: Number(signal?.review_signals || 0),
    high_priority: Number(signal?.high_priority || 0),
    evidence_boundary: "review_priority_not_adjudication",
  };
  byId("packet-code").innerHTML = `{<br>${Object.entries(packet)
    .map(([key, value]) => `&nbsp;&nbsp;<span class="key">"${escapeHtml(key)}"</span>: <span class="value">${value === null ? "null" : `"${escapeHtml(value)}"`}</span>`)
    .join(",<br>")}<br>}`;

  const movement = variance === null
    ? "does not have a comparable preceding observed period"
    : `${variance >= 0 ? "increased" : "decreased"} ${Math.abs(variance).toFixed(1)}% from the preceding observed period`;
  const periodLabel = state.fiscalYear === "All" ? latest.month.slice(0, 7) : `FY${state.fiscalYear} ${latest.month}`;
  byId("draft-brief").textContent = `${state.department} recorded ${formatMoney(latest.netSpend)} in net card spend during ${periodLabel} and ${movement}. ${number.format(signal?.review_signals || 0)} records were prioritized for review, including ${number.format(signal?.high_priority || 0)} high-priority signals. These signals identify unusual context and require human investigation; they do not establish noncompliance.`;
}

function renderQuality() {
  const metadata = state.data.metadata;
  const quality = state.data.quality;
  byId("evidence-boundary").textContent = metadata.evidence_boundary;
  byId("coverage-note").textContent = metadata.coverage_note;
  byId("quality-rows").textContent = compact.format(metadata.source_rows);
  byId("quality-tests").textContent = `${metadata.dbt_checks_passed} / ${metadata.dbt_checks_total}`;
  byId("quality-lag").textContent = `${metadata.lagged_pct}%`;
  byId("quality-missing").textContent = number.format(
    Number(quality.missing_merchant) + Number(quality.missing_category),
  );
}

function render() {
  byId("scope-label").textContent = `${state.department} · ${state.fiscalYear === "All" ? "all fiscal years" : `FY${state.fiscalYear}`}`;
  renderKpis();
  renderTrend();
  renderCategories();
  renderSignals();
  renderMerchants();
  renderEvidencePacket();
}

function setupFilters() {
  const department = byId("department-filter");
  const year = byId("year-filter");
  department.innerHTML = ["All departments", ...state.data.departments]
    .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
    .join("");
  year.innerHTML = ["All", ...state.data.fiscal_years.slice().reverse()]
    .map((value) => `<option value="${escapeHtml(value)}">${value === "All" ? "All fiscal years" : `FY${escapeHtml(value)}`}</option>`)
    .join("");
  department.value = state.department;
  year.value = state.fiscalYear;
  department.addEventListener("change", (event) => {
    state.department = event.target.value;
    render();
  });
  year.addEventListener("change", (event) => {
    state.fiscalYear = event.target.value;
    render();
  });
  byId("reset-filters").addEventListener("click", () => {
    state.department = "All departments";
    state.fiscalYear = "2026";
    department.value = state.department;
    year.value = state.fiscalYear;
    render();
  });
}

async function init() {
  try {
    const response = await fetch("data/dashboard.json");
    if (!response.ok) throw new Error(`Dashboard data request failed: ${response.status}`);
    state.data = await response.json();
    setupFilters();
    renderQuality();
    render();
  } catch (error) {
    console.error(error);
    document.body.innerHTML = `<main class="empty-state" style="padding:4rem">SpendLens could not load its analytical data. ${escapeHtml(error.message)}</main>`;
  }
}

init();
