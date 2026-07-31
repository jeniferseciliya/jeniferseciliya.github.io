const menuButton = document.querySelector(".menu-button");
const navigation = document.querySelector(".site-nav");

menuButton?.addEventListener("click", () => {
  const expanded = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!expanded));
  navigation.classList.toggle("open", !expanded);
});

navigation?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    navigation.classList.remove("open");
    menuButton?.setAttribute("aria-expanded", "false");
  });
});

const dashboardModal = document.getElementById("dashboard-modal");
const dashboardFrame = document.getElementById("dashboard-frame");
const dashboardFrameWrap = document.querySelector(".dashboard-frame-wrap");
const dashboardTitle = document.getElementById("dashboard-modal-title");
const dashboardFullLink = document.getElementById("dashboard-full-link");
const dashboardSourceLink = document.getElementById("dashboard-source-link");
const dashboardCloseButton = document.querySelector(".dashboard-close");
const pageRegions = document.querySelectorAll(".site-header, main, footer");
let lastDashboardTrigger = null;

function openDashboard(trigger) {
  if (!dashboardModal || !dashboardFrame) return;

  lastDashboardTrigger = trigger;
  const { dashboard, title, source } = trigger.dataset;
  dashboardFrameWrap?.classList.remove("loaded");
  dashboardTitle.textContent = title;
  dashboardFrame.title = `${title} interactive analytics dashboard`;
  dashboardFrame.src = dashboard;
  dashboardFullLink.href = dashboard;
  dashboardSourceLink.href = source;
  dashboardModal.classList.add("open");
  dashboardModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  pageRegions.forEach((region) => { region.inert = true; });
  dashboardCloseButton?.focus();
}

function closeDashboard() {
  if (!dashboardModal || !dashboardFrame) return;

  dashboardModal.classList.remove("open");
  dashboardModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  pageRegions.forEach((region) => { region.inert = false; });
  dashboardFrame.src = "about:blank";
  dashboardFrameWrap?.classList.remove("loaded");
  lastDashboardTrigger?.focus();
}

document.querySelectorAll(".dashboard-trigger").forEach((trigger) => {
  trigger.addEventListener("click", () => openDashboard(trigger));
});

document.querySelectorAll("[data-dashboard-close]").forEach((control) => {
  control.addEventListener("click", closeDashboard);
});

dashboardFrame?.addEventListener("load", () => {
  if (dashboardFrame.src === "about:blank") return;
  dashboardFrameWrap?.classList.add("loaded");
  if (dashboardModal?.classList.contains("open") && document.activeElement === document.body) {
    dashboardCloseButton?.focus();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && dashboardModal?.classList.contains("open")) {
    closeDashboard();
  }
});

document.getElementById("current-year").textContent = new Date().getFullYear();
