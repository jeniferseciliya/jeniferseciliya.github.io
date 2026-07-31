const state = { data: null, month: "All", country: "All" };
const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

function filteredSessions() {
  return state.data.sessions.filter(
    (row) =>
      (state.month === "All" || row.month === state.month) &&
      (state.country === "All" || row.country === state.country)
  );
}

function percentage(numerator, denominator) {
  return denominator ? (100 * numerator) / denominator : 0;
}

function renderKPIs(rows) {
  const sessions = rows.length;
  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0);
  const oneClick = rows.filter((row) => row.one_click_session).length;
  const friction = rows.filter((row) => row.friction_flag).length;
  setText("kpi-sessions", integer.format(sessions));
  setText("kpi-clicks", integer.format(clicks));
  setText("kpi-depth", decimal.format(clicks / Math.max(sessions, 1)));
  setText("kpi-bounce", `${decimal.format(percentage(oneClick, sessions))}%`);
  setText("kpi-friction", `${decimal.format(percentage(friction, sessions))}%`);
}

function renderStages(rows) {
  const definitions = [
    ["Visited", () => true],
    ["Explored 2+ items", (row) => row.explored],
    ["Considered 4+ items", (row) => row.considered],
    ["Deep exploration 7+", (row) => row.deep_exploration],
  ];
  const total = rows.length;
  document.getElementById("stage-flow").innerHTML = definitions
    .map(([label, test], index) => {
      const count = rows.filter(test).length;
      return `
        <article class="stage">
          <span>0${index + 1} / ${label}</span>
          <strong>${decimal.format(percentage(count, total))}%</strong>
          <small>${integer.format(count)} sessions</small>
        </article>`;
    })
    .join("");
}

function renderDepth(rows) {
  const bands = [
    ["1", (n) => n === 1],
    ["2–3", (n) => n >= 2 && n <= 3],
    ["4–6", (n) => n >= 4 && n <= 6],
    ["7–10", (n) => n >= 7 && n <= 10],
    ["11–20", (n) => n >= 11 && n <= 20],
    ["21+", (n) => n >= 21],
  ].map(([label, test]) => ({
    label,
    count: rows.filter((row) => test(row.clicks)).length,
  }));
  const max = Math.max(...bands.map((band) => band.count), 1);
  document.getElementById("depth-chart").innerHTML = bands
    .map(
      (band) => `
        <div class="depth-column">
          <div class="depth-column__bar" style="height:${Math.max(
            12,
            (220 * band.count) / max
          )}px"></div>
          <strong>${band.label}</strong>
          <small>${decimal.format(percentage(band.count, rows.length))}%</small>
        </div>`
    )
    .join("");
}

function renderCategories() {
  const records = state.data.categories.filter(
    (row) =>
      (state.month === "All" || row.month === state.month) &&
      (state.country === "All" || row.country === state.country)
  );
  const grouped = new Map();
  records.forEach((row) => {
    const current = grouped.get(row.category_name) || { clicks: 0, sessions: 0 };
    current.clicks += row.clicks;
    current.sessions += row.sessions;
    grouped.set(row.category_name, current);
  });
  const rows = [...grouped.entries()]
    .map(([name, value]) => ({ name, ...value }))
    .sort((a, b) => b.clicks - a.clicks);
  const max = Math.max(...rows.map((row) => row.clicks), 1);
  document.getElementById("category-bars").innerHTML = rows
    .map(
      (row) => `
        <div class="category-row">
          <span>${row.name}</span>
          <div class="category-track"><div class="category-fill" style="width:${
            (100 * row.clicks) / max
          }%"></div></div>
          <strong>${integer.format(row.clicks)}</strong>
        </div>`
    )
    .join("");
}

function renderPlacement() {
  const maxRate = Math.max(...state.data.placement.map((row) => row.repeat_rate), 1);
  document.getElementById("placement-grid").innerHTML = state.data.placement
    .sort((a, b) => a.location_id - b.location_id)
    .map(
      (row) => `
        <article class="placement-cell" style="--intensity:${
          12 + (68 * row.repeat_rate) / maxRate
        }">
          <span>${row.location_name}</span>
          <strong>${decimal.format(row.repeat_rate)}%</strong>
          <small>${integer.format(row.views)} views</small>
        </article>`
    )
    .join("");
}

function renderTransitions() {
  const rows = state.data.transitions
    .filter((row) => row.from_category !== row.to_category)
    .slice(0, 7);
  document.getElementById("transition-list").innerHTML = rows
    .map(
      (row) => `
        <div class="transition">
          <span>${row.from_category}</span>
          <span class="transition__arrow">→</span>
          <span>${row.to_category}</span>
          <strong>${integer.format(row.transitions)}</strong>
        </div>`
    )
    .join("");
}

function renderInsights() {
  document.getElementById("insight-grid").innerHTML = state.data.insights
    .map(
      (item) => `
        <article class="insight">
          <span>${item.label}</span>
          <strong>${item.metric}</strong>
          <p>${item.evidence}</p>
          <small>Review → ${item.next_check}</small>
        </article>`
    )
    .join("");
}

function renderExperiments() {
  document.getElementById("experiment-cards").innerHTML =
    state.data.experiment_sizing
      .map(
        (row) => `
          <article class="experiment-card">
            <span>Detect +${row.relative_lift}% relative lift</span>
            <strong>${integer.format(row.sample_per_variant)}</strong>
            <p>sessions per variant</p>
            <small>≈ ${row.estimated_days} days at observed traffic</small>
          </article>`
      )
      .join("");
}

function renderQuality() {
  const quality = [
    ["Click events", state.data.validation.events],
    ["Sessions", state.data.validation.sessions],
    ["Products", state.data.validation.products],
    ["Countries", state.data.validation.countries],
    ["Pipeline", state.data.validation.status],
  ];
  document.getElementById("quality-list").innerHTML = quality
    .map(
      ([label, value]) => `
        <div class="quality-item">
          <dt>${label}</dt>
          <dd>${typeof value === "number" ? integer.format(value) : value}</dd>
        </div>`
    )
    .join("");
}

function render() {
  const rows = filteredSessions();
  renderKPIs(rows);
  renderStages(rows);
  renderDepth(rows);
  renderCategories();
}

function populateFilters() {
  const months = [...new Set(state.data.sessions.map((row) => row.month))].sort();
  const countries = [...new Set(state.data.sessions.map((row) => row.country))].sort();
  document.getElementById("month-filter").innerHTML = [
    '<option value="All">All months</option>',
    ...months.map((month) => `<option value="${month}">${month}</option>`),
  ].join("");
  document.getElementById("country-filter").innerHTML = [
    '<option value="All">All countries</option>',
    ...countries.map(
      (country) => `<option value="${country}">${country}</option>`
    ),
  ].join("");
}

async function init() {
  const response = await fetch("data/dashboard.json");
  if (!response.ok) throw new Error("Dashboard data could not be loaded.");
  state.data = await response.json();
  populateFilters();
  renderPlacement();
  renderTransitions();
  renderInsights();
  renderExperiments();
  renderQuality();
  render();

  document.getElementById("month-filter").addEventListener("change", (event) => {
    state.month = event.target.value;
    render();
  });
  document.getElementById("country-filter").addEventListener("change", (event) => {
    state.country = event.target.value;
    render();
  });
  document.getElementById("reset-filter").addEventListener("click", () => {
    state.month = "All";
    state.country = "All";
    document.getElementById("month-filter").value = "All";
    document.getElementById("country-filter").value = "All";
    render();
  });
}

init().catch((error) => {
  document.body.innerHTML = `<p role="alert">${error.message}</p>`;
  console.error(error);
});
