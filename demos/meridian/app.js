const state = {
  data: null,
  country: "All",
  year: "All",
};

const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});
const integer = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function sum(rows, key) {
  return rows.reduce((total, row) => total + Number(row[key] || 0), 0);
}

function currentRows() {
  return state.data.monthly.filter((row) => {
    const countryMatch = state.country === "All" || row.country === state.country;
    const yearMatch = state.year === "All" || row.month.startsWith(state.year);
    return countryMatch && yearMatch;
  });
}

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

function renderKPIs(rows) {
  const revenue = sum(rows, "revenue");
  const orders = sum(rows, "orders");
  const cancelled = sum(rows, "cancelled_orders");
  const customerScope = state.data.customer_scopes.find(
    (row) => row.country === state.country && String(row.year) === state.year
  );
  const customers = customerScope?.customers ?? 0;
  const cancelRate = (100 * cancelled) / Math.max(orders + cancelled, 1);

  setText("kpi-revenue", money.format(revenue));
  setText("kpi-orders", integer.format(orders));
  setText("kpi-aov", money.format(revenue / Math.max(orders, 1)));
  setText("kpi-customers", integer.format(customers));
  setText("kpi-cancellations", `${oneDecimal.format(cancelRate)}%`);

  const scope = [
    state.country === "All" ? "all countries" : state.country,
    state.year === "All" ? "all years" : state.year,
  ].join(" · ");
  setText("kpi-revenue-note", `Completed positive-value invoices · ${scope}`);
}

function aggregateMonthly(rows) {
  const grouped = new Map();
  rows.forEach((row) => {
    grouped.set(row.month, (grouped.get(row.month) || 0) + Number(row.revenue));
  });
  return [...grouped.entries()]
    .map(([month, revenue]) => ({ month, revenue }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

function renderLineChart(rows) {
  const target = document.getElementById("revenue-chart");
  const series = aggregateMonthly(rows);
  if (!series.length) {
    target.innerHTML = `<p class="empty">No data for this selection.</p>`;
    return;
  }

  const width = 900;
  const height = 350;
  const pad = { left: 64, right: 24, top: 26, bottom: 44 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const maxValue = Math.max(...series.map((item) => item.revenue)) * 1.08;
  const minValue = 0;
  const x = (index) =>
    pad.left + (index / Math.max(series.length - 1, 1)) * innerWidth;
  const y = (value) =>
    pad.top + innerHeight - ((value - minValue) / (maxValue - minValue)) * innerHeight;

  const points = series.map((item, index) => `${x(index)},${y(item.revenue)}`).join(" ");
  const area = `${pad.left},${pad.top + innerHeight} ${points} ${x(
    series.length - 1
  )},${pad.top + innerHeight}`;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const value = maxValue * ratio;
    const ypos = y(value);
    return `
      <line x1="${pad.left}" x2="${width - pad.right}" y1="${ypos}" y2="${ypos}" stroke="rgba(23,33,31,.14)" />
      <text x="${pad.left - 10}" y="${ypos + 4}" text-anchor="end" fill="#53605c" font-size="11">${money
        .format(value)
        .replace("£", "£")}</text>`;
  });
  const labelIndices = [...new Set([0, Math.floor(series.length / 4), Math.floor(series.length / 2), Math.floor((3 * series.length) / 4), series.length - 1])];
  const xTicks = labelIndices.map((index) => `
    <text x="${x(index)}" y="${height - 16}" text-anchor="middle" fill="#53605c" font-size="11">${series[index].month}</text>
  `);

  target.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" aria-hidden="true">
      <defs>
        <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#dd4b2f" stop-opacity=".34" />
          <stop offset="100%" stop-color="#dd4b2f" stop-opacity=".02" />
        </linearGradient>
      </defs>
      ${yTicks.join("")}
      <polygon points="${area}" fill="url(#area-fill)" />
      <polyline points="${points}" fill="none" stroke="#9d2c1c" stroke-width="3" stroke-linejoin="round" />
      ${series
        .map(
          (item, index) =>
            `<circle cx="${x(index)}" cy="${y(item.revenue)}" r="3" fill="#f3eee3" stroke="#9d2c1c" stroke-width="2">
              <title>${item.month}: ${money.format(item.revenue)}</title>
            </circle>`
        )
        .join("")}
      ${xTicks.join("")}
    </svg>`;

  const peak = series.reduce((best, item) => (item.revenue > best.revenue ? item : best));
  setText(
    "trend-caption",
    `Peak month: ${peak.month} at ${money.format(peak.revenue)}.`
  );
}

function renderRanking() {
  const target = document.getElementById("ranking-bars");
  let rows;
  if (state.country === "All") {
    setText("ranking-title", "Top countries");
    rows = state.data.countries.slice(0, 9).map((row) => ({
      name: row.country,
      value: Number(row.revenue),
    }));
  } else {
    setText("ranking-title", `Leading products · ${state.country}`);
    rows = state.data.products
      .filter((row) => row.country === state.country)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 9)
      .map((row) => ({
        name: titleCase(row.description || row.stock_code),
        value: Number(row.revenue),
      }));
  }
  const maxValue = Math.max(...rows.map((row) => row.value), 1);
  target.innerHTML = rows
    .map(
      (row) => `
      <div class="ranking-row">
        <span class="ranking-row__name" title="${escapeHtml(row.name)}">${escapeHtml(
        row.name
      )}</span>
        <strong>${money.format(row.value)}</strong>
        <div class="ranking-row__track">
          <div class="ranking-row__fill" style="width:${(100 * row.value) / maxValue}%"></div>
        </div>
      </div>`
    )
    .join("");
}

function renderInsights() {
  document.getElementById("insight-cards").innerHTML = state.data.insights
    .map(
      (item) => `
      <article class="insight-card">
        <span class="insight-card__type">${escapeHtml(item.type)}</span>
        <strong>${escapeHtml(item.metric)}</strong>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.evidence)}</p>
        <small>Review → ${escapeHtml(item.recommended_check)}</small>
      </article>`
    )
    .join("");
}

function renderRetention() {
  const target = document.getElementById("retention-heatmap");
  const cohorts = [...new Set(state.data.retention.map((row) => row.cohort_month))]
    .sort()
    .slice(-12);
  const lookup = new Map(
    state.data.retention.map((row) => [
      `${row.cohort_month}-${row.period_number}`,
      Number(row.retention_pct),
    ])
  );
  const periods = Array.from({ length: 13 }, (_, index) => index);
  const header = [
    `<span class="heatmap__label">Cohort</span>`,
    ...periods.map((period) => `<span class="heatmap__period">M${period}</span>`),
  ];
  const cells = cohorts.flatMap((cohort) => [
    `<span class="heatmap__label">${cohort}</span>`,
    ...periods.map((period) => {
      const value = lookup.get(`${cohort}-${period}`);
      if (value === undefined) return `<span class="heatmap__cell"></span>`;
      const intensity = Math.max(0.08, value / 100);
      const color =
        value > 45
          ? `rgba(30,101,100,${0.25 + intensity * 0.75})`
          : `rgba(198,155,60,${0.14 + intensity * 0.72})`;
      return `<span class="heatmap__cell" style="background:${color}" title="${cohort}, month ${period}: ${oneDecimal.format(
        value
      )}%">${Math.round(value)}%</span>`;
    }),
  ]);
  target.innerHTML = `<div class="heatmap">${[...header, ...cells].join("")}</div>`;
}

function renderSegments() {
  const colors = ["#1e6564", "#dd4b2f", "#c69b3c", "#53605c", "#9d2c1c"];
  const rows = state.data.segments;
  let cursor = 0;
  const stops = rows.map((row, index) => {
    const start = cursor;
    cursor += Number(row.customer_share);
    return `${colors[index % colors.length]} ${start}% ${cursor}%`;
  });
  document.getElementById(
    "segment-donut"
  ).style.background = `conic-gradient(${stops.join(",")})`;
  document.getElementById("segment-legend").innerHTML = rows
    .map(
      (row, index) => `
      <div class="segment-row">
        <i style="background:${colors[index % colors.length]}"></i>
        <span>${escapeHtml(row.segment)}</span>
        <strong>${oneDecimal.format(row.customer_share)}%</strong>
      </div>`
    )
    .join("");
}

function renderProducts() {
  const selected =
    state.country === "All"
      ? state.data.products
          .reduce((map, row) => {
            const key = row.stock_code;
            if (!map.has(key)) {
              map.set(key, {
                stock_code: key,
                description: row.description,
                revenue: 0,
                units: 0,
                orders: 0,
              });
            }
            const item = map.get(key);
            item.revenue += Number(row.revenue);
            item.units += Number(row.units);
            item.orders += Number(row.orders);
            return map;
          }, new Map())
          .values()
      : state.data.products.filter((row) => row.country === state.country);
  const rows = [...selected]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);
  setText(
    "product-table-title",
    state.country === "All" ? "Top products" : `Top products · ${state.country}`
  );
  document.getElementById("product-table-body").innerHTML = rows
    .map(
      (row, index) => `
      <tr>
        <td>${String(index + 1).padStart(2, "0")}</td>
        <td>${escapeHtml(titleCase(row.description || "Unclassified item"))}</td>
        <td>${escapeHtml(row.stock_code)}</td>
        <td class="number">${money.format(row.revenue)}</td>
        <td class="number">${integer.format(row.units)}</td>
        <td class="number">${integer.format(row.orders)}</td>
      </tr>`
    )
    .join("");
}

function renderQuality() {
  const quality = state.data.validation;
  setText("quality-source", integer.format(quality.source_rows));
  setText("quality-valid", integer.format(quality.valid_sales_rows));
  setText("quality-missing", integer.format(quality.missing_customer_ids));
  setText("quality-cancelled", integer.format(quality.cancelled_or_return_rows));
  setText("quality-status", quality.status.replaceAll("_", " "));
}

function titleCase(value) {
  return String(value)
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function render() {
  const rows = currentRows();
  renderKPIs(rows);
  renderLineChart(rows);
  renderRanking();
  renderProducts();
}

async function init() {
  const response = await fetch("data/dashboard.json");
  if (!response.ok) throw new Error(`Data request failed: ${response.status}`);
  state.data = await response.json();

  setText(
    "analysis-period",
    `${state.data.meta.date_min} — ${state.data.meta.date_max}`
  );
  const countrySelect = document.getElementById("country-filter");
  state.data.countries
    .map((row) => row.country)
    .sort((a, b) => a.localeCompare(b))
    .forEach((country) => {
      const option = document.createElement("option");
      option.value = country;
      option.textContent = country;
      countrySelect.appendChild(option);
    });

  countrySelect.addEventListener("change", (event) => {
    state.country = event.target.value;
    render();
  });
  document.getElementById("year-filter").addEventListener("change", (event) => {
    state.year = event.target.value;
    render();
  });
  document.getElementById("reset-filters").addEventListener("click", () => {
    state.country = "All";
    state.year = "All";
    countrySelect.value = "All";
    document.getElementById("year-filter").value = "All";
    render();
  });

  renderInsights();
  renderRetention();
  renderSegments();
  renderQuality();
  render();
}

init().catch((error) => {
  console.error(error);
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<div style="padding:16px;background:#9d2c1c;color:white">Dashboard failed to load: ${escapeHtml(
      error.message
    )}</div>`
  );
});
