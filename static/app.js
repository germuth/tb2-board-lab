// TB2 Board Lab — Multi-Board & Multi-Angle Tension Board 2 Studio
// Supports all 8 TB2 configurations (Spray & Mirror × 10×8, 12×8, 10×12, 12×12) at 15°–70°,
// First-Run Setup Wizard, Grade Rating (Sandbag/Upgrade) + 1–3 Star Quality,
// Weekly Training Load & Injury Guardrail, Crew Watchlist, Leaderboards & 2-Way Tension Sync.

const ROLE_INFO = {
  5: { name: "Start", color: "#00dd00", textColor: "#041606", short: "START", order: 2 },
  6: { name: "Hand", color: "#3b82f6", textColor: "#ffffff", short: "HAND", order: 3 },
  7: { name: "Finish", color: "#ff1744", textColor: "#ffffff", short: "TOP", order: 4 },
  8: { name: "Foot", color: "#d946ef", textColor: "#ffffff", short: "FOOT", order: 1 },
};

const V_GRADES = ["All", "V0", "V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8", "V9", "V10+"];

const FULL_GRADE_SCALE = [
  "V0-", "V0", "V0+",
  "V1-", "V1", "V1+",
  "V2-", "V2", "V2+",
  "V3-", "V3", "V3+",
  "V4", "V4+",
  "V5", "V5+",
  "V6", "V6+",
  "V7",
  "V8", "V8+",
  "V9",
  "V10",
  "V11",
  "V12",
  "V13",
  "V14",
];

const BOARD_ANGLES = [15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70];

const LAYOUT_NAMES = {
  11: "Spray",
  10: "Mirror",
};

const SIZE_NAMES = {
  9: "10×8",
  8: "12×8",
  7: "10×12",
  6: "12×12",
};

const COL_TO_LETTER = {
  "-5": "A", "-4": "B", "-3": "C", "-2": "D", "-1": "E",
  "0": "F", "1": "G", "2": "H", "3": "I", "4": "J", "5": "K",
};

const DEFAULT_BOARD_CONFIG = {
  layout_id: 11,
  size_id: 9,
  angle: 45,
  is_adjustable: false,
  setup_complete: false,
};

const state = {
  isStaticDemo: false,
  boardConfig: { ...DEFAULT_BOARD_CONFIG },
  availableBoards: [],
  capabilities: {},
  boardMeta: {
    layout_id: 11,
    size_id: 9,
    label: "10×8 Spray",
    width: 1080,
    height: 1473,
    col_min: -5,
    col_max: 5,
    row_min: 1,
    row_max: 15,
    layers: ["assets/boards/8x10-tb2-wood.webp", "assets/boards/8x10-tb2-plastic.webp"],
    has_3d_render: true,
    render_img: "assets/boards/board_render_10x8_spray.png",
  },
  catalogMeta: {
    target_angle: 45,
    lo_angle: 40,
    hi_angle: 50,
    total_climbs: 0,
    strict_count: 0,
    classics_count: 0,
  },
  wizardStep: 1,
  wizardDraft: { layout_id: 11, size_id: 9, angle: 45, is_adjustable: false },

  holds: [],
  holdsByPid: {},
  climbs: [],
  climbsByUuid: {},
  filteredClimbs: [],
  activeClimbIdx: 0,
  activeClimb: null,

  // Workspace & Mobile mode
  workspaceMode: "wall", // 'wall' | 'lists' | 'beta' | 'compare' | 'logbook' | 'settings'
  mobileTab: "board", // 'board' | 'climbs' | 'lists' | 'beta' | 'compare' | 'logbook' | 'settings'
  phonePreview: false,

  // Board display state ('render' when 3D render available, else 'official', or 'chalk')
  boardView: "render",
  userPreferredBoardView: null,
  showAllHolds: false,
  holdFilterMode: false,
  selectedHoldFilters: {}, // pid -> role
  activeClimbHoldsSorted: [],
  selectedInspectorIdx: 0,

  // Interactive Draft Climb Setter Mode
  draftSetterMode: false,
  draftBrushRole: 5, // 5 Start, 6 Hand, 7 Finish, 8 Foot
  draftHolds: {}, // pid -> role

  // Filter state
  searchQuery: "",
  selectedGrades: [],
  quickFilter: "all",
  excludeZeroSends: false,
  activeListFilterId: null,

  // User, Beta, Logbook, Lists, Watchlist, Connected Accounts, Leaderboards
  primaryUser: "me",
  betaByClimb: {},
  logbook: [],
  lists: [],
  watchlist: [],
  selectedClimber: "me",
  connectedAccounts: [],
  leaderboardData: { top_fa: [], top_setters: [], top_beta: [], top_fa_10x8: [], top_setters_10x8: [], top_beta_10x8: [] },
  leaderboardTab: "crew", // 'crew' | 'fa' | 'beta' | 'setters'
  loadChartMetric: "points", // 'points' | 'tries'
  listsLayoutScope: "active", // 'active' | 'all'
  activityLayoutScope: "active", // 'active' | 'all'

  // Video Comparator state
  compareLayout: "single", // 'single' | 'sbs' | 'overlay'
  syncPlaying: false,
  playbackSpeed: 1.0,
  syncOffsetB: 0.0,
  overlayAlpha: 0.5,
  localCompareClips: [],

  // Video Trimmer state
  rawDuration: 15.0,
  trimStart: 0.0,
  trimEnd: 10.0,
  currentRawSrc: "",
  currentCroppedSrc: "",

  // Log form state (Activity tab + Top-Right Wall Quick Log + Inline Editor)
  logFormStatus: "sent",
  logFormAttempts: 1,
  logFormRatedGrade: "V2",
  logFormQuality: 2,
  wallQuickLogStatus: "sent",
  wallQuickLogTries: 1,
  wallQuickLogRatedGrade: "V2",
  wallQuickLogQuality: 2,
  pyramidMinAscents: 1,
  editingLogId: null,
  editLogQuality: 2,
};

// ============================================================================
// MULTI-BOARD, MULTI-ANGLE & GRADE RATING HELPERS
// ============================================================================
function getPrimaryUser() {
  return String(state.primaryUser || "me").replace(/^@/, "") || "me";
}

function buildBoardLabel(cfg) {
  const lid = Number(cfg?.layout_id ?? 11);
  const sid = Number(cfg?.size_id ?? 9);
  return `${SIZE_NAMES[sid] || "10×8"} ${LAYOUT_NAMES[lid] || "Spray"}`;
}

function getActiveBoardLabel() {
  return state.boardMeta?.label || buildBoardLabel(state.boardConfig);
}

function getActiveAngle() {
  return Number(state.catalogMeta?.target_angle ?? state.boardConfig?.angle ?? 45);
}

function getLoAngle() {
  const tgt = getActiveAngle();
  if (state.catalogMeta?.lo_angle != null) return Number(state.catalogMeta.lo_angle);
  return Math.max(15, tgt - 5);
}

function getHiAngle() {
  const tgt = getActiveAngle();
  if (state.catalogMeta?.hi_angle != null) return Number(state.catalogMeta.hi_angle);
  return Math.min(70, tgt + 5);
}

function getAngleRangeText() {
  const lo = getLoAngle();
  const hi = getHiAngle();
  return `${lo}°–${hi}°`;
}

function getClimbTargetAscents(c) {
  return Number(c?.a_tgt ?? c?.a45 ?? 0);
}

function getClimbLoAscents(c) {
  return Number(c?.a_lo ?? c?.a40 ?? 0);
}

function getClimbHiAscents(c) {
  return Number(c?.a_hi ?? c?.a50 ?? 0);
}

function getClimbNearbyAscents(c) {
  return getClimbLoAscents(c) + getClimbHiAscents(c);
}

function getClimbTargetGrade(c) {
  return c?.v_tgt || c?.v45 || (getClimbTargetAscents(c) > 0 ? c.g : "—");
}

function getClimbLoGrade(c) {
  return c?.v_lo || c?.v40 || "—";
}

function getClimbHiGrade(c) {
  return c?.v_hi || c?.v50 || "—";
}

function getClimbRawTargetGrade(c) {
  return c?.raw_vtgt || c?.raw_v45 || "";
}

function getClimbRawLoGrade(c) {
  return c?.raw_vlo || c?.raw_v40 || "";
}

function getClimbRawHiGrade(c) {
  return c?.raw_vhi || c?.raw_v50 || "";
}

function isClimbClassic(c) {
  return Boolean(c?.cl_tgt || c?.cladj || c?.cl45);
}

function isLogOnActiveBoard(l) {
  if (!l) return false;
  if (typeof l.on_active_board === "boolean") return l.on_active_board;
  if (typeof l.on_10x8_spray === "boolean") return l.on_10x8_spray;
  return true;
}

function isListItemOnActiveBoard(it) {
  if (!it) return false;
  if (typeof it.on_active_board === "boolean") return it.on_active_board;
  if (typeof it.on_10x8_spray === "boolean") return it.on_10x8_spray;
  return false;
}

function use3DRenderMode() {
  return Boolean(state.boardMeta?.has_3d_render && state.boardView === "render");
}

function gradeToNumeric(gStr) {
  const s = String(gStr || "V0").trim().toUpperCase();
  const m = s.match(/V(\d+)([+-])?/);
  if (!m) return 0;
  let val = parseInt(m[1], 10);
  if (m[2] === "-") val -= 0.3;
  else if (m[2] === "+") val += 0.3;
  return val;
}

function normalizeRatedGrade(gStr) {
  const s = String(gStr || "V2").trim().toUpperCase();
  const exact = FULL_GRADE_SCALE.find(x => x === s);
  if (exact) return exact;
  const targetNum = gradeToNumeric(s);
  let best = FULL_GRADE_SCALE[0];
  let bestDiff = Infinity;
  for (const cand of FULL_GRADE_SCALE) {
    const d = Math.abs(gradeToNumeric(cand) - targetNum);
    if (d < bestDiff) {
      bestDiff = d;
      best = cand;
    }
  }
  return best;
}

function getGradeDiffTag(ratedGrade, consensusGrade) {
  if (!ratedGrade || !consensusGrade) return null;
  const rNum = gradeToNumeric(ratedGrade);
  const cNum = gradeToNumeric(consensusGrade);
  if (rNum < cNum - 0.05) return { kind: "sandbag", label: "Sandbag!" };
  if (rNum > cNum + 0.05) return { kind: "upgrade", label: "Upgrade!" };
  return null;
}

function showCatalogLoading(show, title = "Loading Tension Board 2 catalog...", sub = "") {
  const el = document.getElementById("catalog-loading-overlay");
  if (!el) return;
  el.style.display = show ? "flex" : "none";
  if (title) document.getElementById("clo-title")?.replaceChildren(title);
  if (sub) document.getElementById("clo-sub")?.replaceChildren(sub);
}

// ============================================================================
// APP INITIALIZATION, CONFIG & FIRST-RUN BOARD SETUP WIZARD
// ============================================================================
async function initApp() {
  buildGradeScroller();
  renderWizardAnglePills();
  setupSearchEvents();
  setupVideoSyncListeners();

  const dateInput = document.getElementById("log-date-input");
  if (dateInput && !dateInput.value) {
    dateInput.value = getLocalTodayStr();
  }

  await loadConfig();
  await loadBetaAndLogs();
  renderTopNavbarBoardControls();
  renderListsSection();
  renderLogbookSection();

  if (!state.boardConfig.setup_complete) {
    openBoardSetupWizard(1);
    return;
  }

  await loadCatalogAndRefresh();
}

const STATIC_DEMO_STORAGE_KEY = "tb2_static_demo_state_v1";

function loadStaticDemoState() {
  try {
    const raw = localStorage.getItem(STATIC_DEMO_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        applyServerState({
          logbook: Array.isArray(parsed.logbook) ? parsed.logbook : [],
          lists: Array.isArray(parsed.lists) ? parsed.lists : [],
          watchlist: Array.isArray(parsed.watchlist) ? parsed.watchlist : [],
          beta_by_climb: {},
          connected_accounts: [],
        });
      }
    }
  } catch (_e) {}
}

function saveStaticDemoState() {
  if (!state.isStaticDemo) return;
  try {
    localStorage.setItem(STATIC_DEMO_STORAGE_KEY, JSON.stringify({
      logbook: state.logbook || [],
      lists: state.lists || [],
      watchlist: state.watchlist || [],
    }));
  } catch (_e) {}
}

function showStaticDemoNotice(featureLabel = "This feature") {
  showToast(`🧪 Live Demo: ${featureLabel} requires running TB2 Board Lab locally!`);
}

async function loadConfig() {
  try {
    const res = await fetch("/api/config");
    if (res.ok) {
      const data = await res.json();
      const cfg = data.config || data;
      state.isStaticDemo = false;
      state.boardConfig = {
        ...DEFAULT_BOARD_CONFIG,
        ...cfg,
        layout_id: Number(cfg.layout_id ?? 11),
        size_id: Number(cfg.size_id ?? 9),
        angle: Number(cfg.angle ?? 45),
        is_adjustable: Boolean(cfg.is_adjustable),
        setup_complete: Boolean(cfg.setup_complete),
      };
      if (Array.isArray(data.boards)) {
        state.availableBoards = data.boards;
      }
      if (data.capabilities) {
        state.capabilities = data.capabilities;
      }
      if (data.primary_user) {
        state.primaryUser = String(data.primary_user).replace(/^@/, "");
        if (!state.selectedClimber || state.selectedClimber === "me") {
          state.selectedClimber = state.primaryUser;
        }
      }
      return;
    }
  } catch (_e) {}

  // No local server.py detected — enter Static Demo Mode (GitHub Pages)
  state.isStaticDemo = true;
  state.boardConfig = { ...DEFAULT_BOARD_CONFIG, setup_complete: true };
  const demoPill = document.getElementById("demo-mode-pill");
  if (demoPill) demoPill.style.display = "inline-flex";
}

async function loadCatalogAndRefresh() {
  const lbl = buildBoardLabel(state.boardConfig);
  const ang = Number(state.boardConfig.angle || 45);
  showCatalogLoading(
    true,
    "Loading Tension Board 2 catalog...",
    `Building ${lbl} @ ${ang}° holds, angle-adjusted grades & climb stats (first run may download the snapshot)`
  );
  try {
    await loadCatalog();
    await loadLeaderboards();
    updateBetaChipCount();
    applyBoardGeometryAndLayers();
    renderTopNavbarBoardControls();
    updateDynamicCatalogLabels();
    renderListsSection();
    renderLogbookSection();
    updateFilteredClimbs();
    if (state.filteredClimbs.length > 0) {
      selectClimbByIndex(0, false);
    } else if (state.climbs.length > 0) {
      state.activeClimb = state.climbs[0];
      onActiveClimbChanged(false);
    }
  } catch (err) {
    showToast(`⚠️ Could not load catalog: ${err?.message || "network error"}`);
  } finally {
    showCatalogLoading(false);
  }
}

async function loadCatalog() {
  let res;
  if (state.isStaticDemo) {
    res = await fetch("demo_catalog.json");
  } else {
    const cfg = state.boardConfig;
    const q = new URLSearchParams({
      layout_id: String(cfg.layout_id),
      size_id: String(cfg.size_id),
      angle: String(cfg.angle),
    });
    res = await fetch(`/api/catalog?${q.toString()}`);
  }
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  if (data.board) {
    state.boardMeta = data.board;
  }
  if (data.meta) {
    state.catalogMeta = data.meta;
  }
  state.holds = Array.isArray(data.holds) ? data.holds : [];
  state.holdsByPid = {};
  for (const h of state.holds) {
    if (h.placement_id !== null && h.placement_id !== undefined) {
      state.holdsByPid[h.placement_id] = h;
    }
  }
  state.climbs = Array.isArray(data.climbs) ? data.climbs : [];
  rebuildClimbsMap();

  if (data.leaderboard) {
    state.leaderboardData = { ...state.leaderboardData, ...data.leaderboard };
  }

  // Choose default board view: 3D Render when available (unless user picked official/chalk), else Official Hold Map
  if (state.boardMeta?.has_3d_render) {
    state.boardView = state.userPreferredBoardView || "render";
  } else {
    state.boardView = state.userPreferredBoardView === "chalk" ? "chalk" : "official";
  }

  // Clear hold filters & draft holds if holds changed across boards
  state.selectedHoldFilters = {};
  state.draftHolds = {};
  renderHoldFilterBanner();
}

function renderTopNavbarBoardControls() {
  const lbl = getActiveBoardLabel();
  const ang = getActiveAngle();
  const isAdj = Boolean(state.boardConfig.is_adjustable);

  document.title = `TB2 Board Lab — ${lbl} @ ${ang}°`;
  document.getElementById("navbar-board-label")?.replaceChildren(lbl);

  const angleWrap = document.getElementById("navbar-angle-wrap");
  if (angleWrap) {
    if (isAdj) {
      angleWrap.innerHTML = `
        <select id="navbar-angle-select" class="angle-select-pill" title="Switch adjustable wall angle" onchange="onQuickAngleChange(this.value)">
          ${BOARD_ANGLES.map(a => `<option value="${a}" ${a === ang ? "selected" : ""}>${a}°</option>`).join("")}
        </select>
      `;
    } else {
      angleWrap.innerHTML = `
        <span id="navbar-angle-pill" class="angle-pill clickable" onclick="openBoardSetupWizard(1)" title="Click to change wall angle">${ang}°</span>
      `;
    }
  }

  // Update Settings active board summary card
  document.getElementById("settings-board-lbl")?.replaceChildren(`${lbl} @ ${ang}°`);
  document.getElementById("settings-board-mode-lbl")?.replaceChildren(
    isAdj ? "Adjustable wall (live angle switcher enabled in top bar)" : "Fixed angle wall"
  );
}

async function onQuickAngleChange(val) {
  const newAngle = Math.max(15, Math.min(70, parseInt(val, 10) || 45));
  if (newAngle === Number(state.boardConfig.angle)) return;
  state.boardConfig.angle = newAngle;
  try {
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ angle: newAngle }),
    });
  } catch (_e) {}
  await loadCatalogAndRefresh();
  await loadBetaAndLogs();
  renderListsSection();
  renderLogbookSection();
  showToast(`📐 Switched wall angle to ${newAngle}°`);
}

function updateDynamicCatalogLabels() {
  const lbl = getActiveBoardLabel();
  const ang = getActiveAngle();
  const lo = getLoAngle();
  const hi = getHiAngle();
  const rangeTxt = getAngleRangeText();
  const meta = state.catalogMeta || {};
  const totalClimbs = meta.total_climbs ?? state.climbs.length;
  const strictCount = meta.strict_count ?? state.climbs.filter(c => getClimbTargetAscents(c) > 0).length;
  const classicsCount = meta.classics_count ?? state.climbs.filter(c => isClimbClassic(c)).length;

  // Left filter chips
  const allChip = document.getElementById("chip-filter-all");
  if (allChip) allChip.textContent = `All (${totalClimbs.toLocaleString()})`;
  const strictChip = document.getElementById("chip-strict-angle");
  if (strictChip) strictChip.textContent = `🎯 Strict ${ang}° (${strictCount.toLocaleString()})`;
  const classicsChip = document.getElementById("chip-classics");
  if (classicsChip) classicsChip.innerHTML = `<span class="c-block cl45">C</span> Classics (${classicsCount.toLocaleString()})`;

  // Sort dropdown labels
  document.getElementById("opt-sort-featured")?.replaceChildren(`Featured & ${ang}° Pop`);
  document.getElementById("opt-sort-nearby")?.replaceChildren(`Most Ascents (${rangeTxt})`);
  document.getElementById("opt-sort-target")?.replaceChildren(`Most Ascents (${ang}° Only)`);

  // Legend tooltip
  const adjHint = document.getElementById("legend-adj-hint");
  if (adjHint) adjHint.title = `Angle-adjusted grade from neighboring angles (${lo}° / ${hi}°)`;

  // Draft setter banner title
  document.getElementById("dsb-badge-label")?.replaceChildren(`🛠️ DRAFT CLIMB SETTER (${lbl.toUpperCase()} @ ${ang}°)`);

  // Scope toggles & section headers
  const justBoardTxt = `🎯 Just ${lbl}`;
  document.getElementById("lists-scope-active")?.replaceChildren(justBoardTxt);
  document.getElementById("activity-scope-active")?.replaceChildren(justBoardTxt);
  document.getElementById("lists-user-lbl")?.replaceChildren(`@${getPrimaryUser()}`);
  document.getElementById("lists-page-sub")?.replaceChildren(
    `Synced directly from your Tension Board 2 profile — toggle between your ${lbl} climbs & drafts vs. all board crops/layouts.`
  );
  document.getElementById("aurora-banner-sub")?.replaceChildren(
    `Toggle between your ${lbl} @ ${ang}° sessions vs. your full Tension Board 2 history across all board crops/layouts.`
  );
  document.getElementById("load-chart-title")?.replaceChildren(`⚡ 1. Weekly Climbing Load & Injury Guardrail (${lbl} @ ${ang}°)`);
  document.getElementById("pyr-board-title")?.replaceChildren(lbl);
  document.getElementById("pyr-board-sub")?.replaceChildren(`Click any V-grade bar on either graph to filter the ${lbl} wall to that grade.`);
  document.getElementById("pyr-mine-sub-lbl")?.replaceChildren(`Scaled to your own sends per V-grade on the ${lbl}.`);
  document.getElementById("log-board-angle-lbl")?.replaceChildren(`(${ang}° on ${lbl})`);
  document.getElementById("lb-board-title")?.replaceChildren(`🏆 4. ${lbl} Leaderboards (${rangeTxt})`);
  document.getElementById("lb-board-sub")?.replaceChildren(`Scoped strictly to ${lbl} (${rangeTxt}). Click any climber to inspect their profile.`);
  document.getElementById("lb-tab-fa")?.replaceChildren(`⚡ Top ${lbl} FAs`);
  document.getElementById("lb-tab-beta")?.replaceChildren(`🎬 Top ${lbl} Beta`);
  document.getElementById("ig-angle-check-code")?.replaceChildren(`@ ${ang}° on the Tension Board.`);
  document.getElementById("btn-toggle-unlit")?.replaceChildren(`👁️ Show All ${state.holds.length} Holds on Wall`);

  const betaClimberInput = document.getElementById("input-beta-climber");
  if (betaClimberInput && !betaClimberInput.value) {
    const u = getPrimaryUser();
    betaClimberInput.placeholder = u !== "me" ? `Climber (e.g. @${u})` : "Climber (e.g. @your_handle)";
  }
}

// --- Setup Wizard Controls ---
function renderWizardAnglePills() {
  const wrap = document.getElementById("wiz-angle-pills");
  if (!wrap) return;
  const selAngle = Number(state.wizardDraft.angle ?? 45);
  wrap.innerHTML = BOARD_ANGLES.map(a => `
    <button type="button" class="wiz-angle-pill ${a === selAngle ? "active" : ""}" onclick="selectWizardAngle(${a})">${a}°</button>
  `).join("");
}

function openBoardSetupWizard(step = 1) {
  if (state.isStaticDemo) {
    showStaticDemoNotice("Switching board sizes & angles");
    return;
  }
  state.wizardDraft = {
    layout_id: Number(state.boardConfig.layout_id ?? 11),
    size_id: Number(state.boardConfig.size_id ?? 9),
    angle: Number(state.boardConfig.angle ?? 45),
    is_adjustable: Boolean(state.boardConfig.is_adjustable),
  };
  const closeBtn = document.getElementById("btn-close-setup-wizard");
  if (closeBtn) closeBtn.style.display = state.boardConfig.setup_complete ? "inline-flex" : "none";
  const quickSaveBtn = document.getElementById("btn-wiz-quick-save");
  if (quickSaveBtn) quickSaveBtn.style.display = state.boardConfig.setup_complete ? "inline-flex" : "none";

  const statusEl = document.getElementById("wizard-status-msg");
  if (statusEl) statusEl.textContent = "";

  syncWizardStep1UI();
  setWizardStep(step);
  const modal = document.getElementById("modal-board-setup");
  if (modal) modal.style.display = "flex";
}

function closeBoardSetupWizard() {
  const modal = document.getElementById("modal-board-setup");
  if (modal) modal.style.display = "none";
}

function syncWizardStep1UI() {
  const d = state.wizardDraft;
  document.querySelectorAll(".wiz-option-card[data-layout]").forEach(btn => {
    btn.classList.toggle("active", Number(btn.dataset.layout) === Number(d.layout_id));
  });
  document.querySelectorAll(".wiz-option-card[data-size]").forEach(btn => {
    btn.classList.toggle("active", Number(btn.dataset.size) === Number(d.size_id));
  });
  document.getElementById("wiz-mode-fixed")?.classList.toggle("active", !d.is_adjustable);
  document.getElementById("wiz-mode-adjustable")?.classList.toggle("active", Boolean(d.is_adjustable));
  const hint = document.getElementById("wiz-angle-hint");
  if (hint) {
    hint.textContent = d.is_adjustable
      ? "Adjustable wall adds a live 15°–70° angle switcher right in the top bar so you can change angles mid-session."
      : "Fixed angle locks the catalog to your wall angle and surfaces neighboring ±5° climbs with angle-adjusted grades.";
  }
  renderWizardAnglePills();
  updateWizardSummary();
}

function selectWizardLayout(layoutId) {
  state.wizardDraft.layout_id = Number(layoutId);
  syncWizardStep1UI();
}

function selectWizardSize(sizeId) {
  state.wizardDraft.size_id = Number(sizeId);
  syncWizardStep1UI();
}

function selectWizardAdjustable(isAdj) {
  state.wizardDraft.is_adjustable = Boolean(isAdj);
  syncWizardStep1UI();
}

function selectWizardAngle(angle) {
  state.wizardDraft.angle = Number(angle);
  syncWizardStep1UI();
}

function updateWizardSummary() {
  const el = document.getElementById("wiz-selected-summary");
  if (!el) return;
  const lbl = buildBoardLabel(state.wizardDraft);
  const modeTxt = state.wizardDraft.is_adjustable ? "Adjustable Wall" : "Fixed Angle";
  el.innerHTML = `Selected Board: <strong>${escapeHtml(lbl)} @ ${state.wizardDraft.angle}°</strong> · ${modeTxt}`;
}

function setWizardStep(step) {
  state.wizardStep = step === 2 ? 2 : 1;
  document.getElementById("wiz-ind-1")?.classList.toggle("active", state.wizardStep === 1);
  document.getElementById("wiz-ind-2")?.classList.toggle("active", state.wizardStep === 2);
  const p1 = document.getElementById("wizard-step-1");
  const p2 = document.getElementById("wizard-step-2");
  if (p1) p1.style.display = state.wizardStep === 1 ? "flex" : "none";
  if (p2) p2.style.display = state.wizardStep === 2 ? "flex" : "none";
  if (state.wizardStep === 2) updateWizardSummary();
}

async function completeBoardSetup(shouldConnectTension) {
  const statusEl = document.getElementById("wizard-status-msg");
  const connectBtn = document.getElementById("btn-wiz-connect");
  const skipBtn = document.getElementById("btn-wiz-skip");

  const username = document.getElementById("wiz-login-user")?.value.trim().replace(/^@/, "") || "";
  const password = document.getElementById("wiz-login-pass")?.value || "";

  if (shouldConnectTension && (!username || !password)) {
    if (statusEl) {
      statusEl.style.color = "#fda4af";
      statusEl.textContent = "Enter your Tension username and password, or click 'Skip Login & Start Climbing →'.";
    }
    return;
  }

  if (connectBtn) connectBtn.disabled = true;
  if (skipBtn) skipBtn.disabled = true;

  try {
    const cfgPayload = {
      layout_id: state.wizardDraft.layout_id,
      size_id: state.wizardDraft.size_id,
      angle: state.wizardDraft.angle,
      is_adjustable: state.wizardDraft.is_adjustable,
      setup_complete: true,
    };
    const cfgRes = await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfgPayload),
    });
    const cfgData = await cfgRes.json();
    if (!cfgRes.ok || cfgData.ok === false) {
      throw new Error(cfgData.error || "Could not save board configuration");
    }
    state.boardConfig = { ...state.boardConfig, ...(cfgData.config || cfgPayload), setup_complete: true };

    if (shouldConnectTension) {
      if (statusEl) {
        statusEl.style.color = "#7dd3fc";
        statusEl.textContent = `Signing in @${username} via tensionboardapp2.com & syncing profile...`;
      }
      const loginRes = await fetch("/api/aurora/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const loginData = await loginRes.json();
      if (!loginRes.ok || !loginData.ok) {
        if (statusEl) {
          statusEl.style.color = "#fda4af";
          statusEl.textContent = `Tension login failed: ${loginData.error || "Invalid credentials"}`;
        }
        return;
      }
      document.getElementById("wiz-login-pass").value = "";
      if (loginData.state) applyServerState(loginData.state);
      state.primaryUser = username;
      state.selectedClimber = username;
    }

    closeBoardSetupWizard();
    await loadCatalogAndRefresh();
    await loadBetaAndLogs();
    renderListsSection();
    renderLogbookSection();
    showToast(`✓ Board ready: ${getActiveBoardLabel()} @ ${getActiveAngle()}°!`);
  } catch (err) {
    if (statusEl) {
      statusEl.style.color = "#fda4af";
      statusEl.textContent = `Setup error: ${err?.message || "network error"}`;
    }
  } finally {
    if (connectBtn) connectBtn.disabled = false;
    if (skipBtn) skipBtn.disabled = false;
  }
}

function rebuildClimbsMap() {
  state.climbsByUuid = {};
  for (const c of state.climbs) {
    state.climbsByUuid[c.u] = c;
    state.climbsByUuid[c.u.toLowerCase()] = c;
  }
}

async function loadBetaAndLogs() {
  if (state.isStaticDemo) {
    loadStaticDemoState();
    return;
  }
  try {
    const res = await fetch("/api/state");
    if (res.ok) {
      const data = await res.json();
      applyServerState(data);
      return;
    }
  } catch (_e) {}
}

function applyServerState(data) {
  if (!data) return;
  state.betaByClimb = data.beta_by_climb || state.betaByClimb || {};
  state.logbook = data.logbook || state.logbook || [];
  if (Array.isArray(data.lists)) {
    state.lists = data.lists;
  }
  if (Array.isArray(data.watchlist)) {
    state.watchlist = data.watchlist;
  }
  if (Array.isArray(data.connected_accounts)) {
    state.connectedAccounts = data.connected_accounts;
  }
  if (data.primary_user) {
    const prevPrimary = state.primaryUser;
    state.primaryUser = String(data.primary_user).replace(/^@/, "") || "me";
    if (!state.selectedClimber || state.selectedClimber === "me" || state.selectedClimber === prevPrimary) {
      state.selectedClimber = state.primaryUser;
    }
  } else if (state.connectedAccounts.length > 0 && state.primaryUser === "me") {
    state.primaryUser = state.connectedAccounts[0].username;
    state.selectedClimber = state.primaryUser;
  }
  updateBetaChipCount();
  updateAuroraConnectionUI();
}

async function loadLeaderboards() {
  if (state.isStaticDemo) return;
  try {
    const cfg = state.boardConfig;
    const q = new URLSearchParams({
      layout_id: String(cfg.layout_id),
      size_id: String(cfg.size_id),
      angle: String(cfg.angle),
    });
    const res = await fetch(`/api/leaderboard?${q.toString()}`);
    if (res.ok) {
      state.leaderboardData = await res.json();
      return;
    }
  } catch (_e) {}
}

function updateBetaChipCount() {
  const primaryLower = getPrimaryUser().toLowerCase();
  const activeClimbUuidSet = new Set((state.climbs || []).map(c => c.u.toLowerCase()));
  const cnt = Object.entries(state.betaByClimb || {}).filter(
    ([cu, arr]) => Array.isArray(arr) && arr.length > 0 && (activeClimbUuidSet.size === 0 || activeClimbUuidSet.has(cu.toLowerCase()))
  ).length;
  const chip = document.getElementById("chip-has-beta");
  if (chip) {
    chip.textContent = `🎬 Has Beta (${cnt})`;
  }
  const sentIds = new Set(
    (state.logbook || [])
      .filter(l => l.status === "sent" && (l.climber || primaryLower).toLowerCase() === primaryLower && isLogOnActiveBoard(l))
      .map(l => (l.climb_uuid || "").toLowerCase())
  );
  const sentCnt = (state.climbs && state.climbs.length > 0)
    ? state.climbs.filter(c => sentIds.has(c.u.toLowerCase())).length
    : sentIds.size;
  const sentChip = document.getElementById("chip-sent");
  if (sentChip) {
    sentChip.textContent = sentCnt > 0 ? `✅ Sent (${sentCnt})` : `✅ Sent`;
  }
  const unsentChip = document.getElementById("chip-unsent");
  if (unsentChip) {
    if (state.climbs && state.climbs.length > 0) {
      const unsentCnt = Math.max(0, state.climbs.length - sentCnt);
      unsentChip.textContent = `⭕ Unsent (${unsentCnt.toLocaleString()})`;
    } else {
      unsentChip.textContent = `⭕ Unsent`;
    }
  }
}

function setWorkspaceMode(mode) {
  if (mode === "compare") {
    const c = state.activeClimb;
    const hasBeta = c && ((state.betaByClimb[c.u]?.length || 0) > 0 || state.localCompareClips.length > 0);
    if (!hasBeta) {
      showToast("ℹ️ No beta videos for this climb yet — use '📤 Upload' to add a clip or Instagram Reel!");
    }
  }

  state.workspaceMode = mode;
  document.querySelectorAll(".d-tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.dmode === mode);
  });
  const main = document.getElementById("studio-main");
  if (main) {
    main.className = `studio-main mode-${mode}`;
  }
  if (mode === "lists") renderListsSection();
  if (mode === "logbook") renderLogbookSection();
  if (mode === "compare") {
    renderBetaAndComparator();
  }

  if (mode === "wall") {
    switchMobileTab("board", false);
  } else {
    switchMobileTab(mode, false);
  }
}

function switchMobileTab(tab, syncDesktop = true) {
  state.mobileTab = tab;
  document.querySelectorAll(".mob-nav-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.mobtab === tab);
  });

  const panels = {
    climbs: document.getElementById("panel-climbs"),
    board: document.getElementById("panel-board"),
    lists: document.getElementById("panel-lists"),
    beta: document.getElementById("panel-beta"),
    compare: document.getElementById("panel-compare"),
    logbook: document.getElementById("panel-logbook"),
    settings: document.getElementById("panel-settings"),
  };

  Object.values(panels).forEach(p => p?.classList.remove("active-mobile-tab"));
  panels[tab]?.classList.add("active-mobile-tab");

  if (tab === "lists") renderListsSection();
  if (tab === "logbook") renderLogbookSection();
  if (tab === "compare") {
    renderBetaAndComparator();
  }

  if (syncDesktop) {
    const dMode = (tab === "board" || tab === "climbs") ? "wall" : tab;
    state.workspaceMode = dMode;
    document.querySelectorAll(".d-tab-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.dmode === dMode);
    });
    const main = document.getElementById("studio-main");
    if (main) main.className = `studio-main mode-${dMode}`;
  }
}

function buildGradeScroller() {
  const scroller = document.getElementById("grade-scroller");
  if (!scroller) return;
  scroller.innerHTML = V_GRADES.map(g => {
    const isActive = g === "All"
      ? state.selectedGrades.length === 0
      : state.selectedGrades.includes(g);
    return `
      <button class="grade-filter-pill ${isActive ? 'active' : ''}"
              onclick="setGradeFilter('${g}')">${g}</button>
    `;
  }).join("");
}

function setGradeFilter(g) {
  if (g === "All") {
    state.selectedGrades = [];
  } else {
    const idx = state.selectedGrades.indexOf(g);
    if (idx >= 0) {
      state.selectedGrades.splice(idx, 1);
    } else {
      state.selectedGrades.push(g);
    }
  }
  buildGradeScroller();
  updateFilteredClimbs();
}

function setQuickFilter(qf) {
  state.quickFilter = qf;
  document.querySelectorAll(".filter-chip[data-filter]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.filter === qf);
  });
  updateFilteredClimbs();
}

function toggleExcludeZeroSends() {
  state.excludeZeroSends = !state.excludeZeroSends;
  document.getElementById("btn-exclude-zero")?.classList.toggle("active", state.excludeZeroSends);
  updateFilteredClimbs();
}

function setupSearchEvents() {
  const input = document.getElementById("climb-search-input");
  const clearBtn = document.getElementById("btn-clear-search");
  if (input) {
    // Prevent browser password/username autofill from injecting a saved username when clicking away
    input.addEventListener("input", (e) => {
      const val = e.target.value;
      const isAutofill = e.inputType === "insertReplacementText" || document.activeElement !== input;
      if (isAutofill) {
        input.value = state.searchQuery;
        return;
      }
      state.searchQuery = val.trim();
      if (clearBtn) clearBtn.style.display = state.searchQuery ? "block" : "none";
      updateFilteredClimbs();
    });

    input.addEventListener("change", () => {
      if (document.activeElement !== input && input.value.trim() !== state.searchQuery) {
        input.value = state.searchQuery;
      }
    });
  }

  window.addEventListener("keydown", (e) => {
    if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      stepClimb(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      stepClimb(-1);
    } else if (e.key === " ") {
      if (state.workspaceMode === "compare" || state.mobileTab === "compare") {
        e.preventDefault();
        toggleSyncPlay();
      }
    }
  });
}

function clearSearch() {
  state.searchQuery = "";
  const input = document.getElementById("climb-search-input");
  const clearBtn = document.getElementById("btn-clear-search");
  if (input) input.value = "";
  if (clearBtn) clearBtn.style.display = "none";
  updateFilteredClimbs();
}

function updateFilteredClimbs() {
  const q = state.searchQuery.toLowerCase();
  const selectedGrades = state.selectedGrades;
  const qf = state.quickFilter;
  const sortMode = document.getElementById("climb-sort-select")?.value || "featured";
  const filterPids = Object.keys(state.selectedHoldFilters).map(Number);
  const primaryLower = getPrimaryUser().toLowerCase();
  const sentSet = new Set(
    state.logbook
      .filter(l => l.status === "sent" && (l.climber || primaryLower).toLowerCase() === primaryLower)
      .map(l => (l.climb_uuid || "").toLowerCase())
  );

  let activeListSet = null;
  if (state.activeListFilterId) {
    const lst = state.lists.find(l => l.id === state.activeListFilterId);
    if (lst) {
      activeListSet = new Set((lst.climb_uuids || []).map(u => u.toLowerCase()));
    }
  }

  const list = state.climbs.filter(c => {
    if (activeListSet && !activeListSet.has(c.u.toLowerCase())) {
      return false;
    }
    if (q) {
      if (!c.n.toLowerCase().includes(q) && !c.s.toLowerCase().includes(q)) return false;
    }
    if (selectedGrades.length > 0) {
      const matchesGrade = selectedGrades.some(gf => {
        if (gf === "V10+") {
          const vNum = parseInt(c.v.replace("V", ""), 10);
          return !isNaN(vNum) && vNum >= 10;
        }
        return c.v === gf;
      });
      if (!matchesGrade) return false;
    }
    if (qf === "strict_angle" || qf === "only45") {
      if (!(getClimbTargetAscents(c) > 0)) return false;
    } else if (qf === "classics" || qf === "classic_adj" || qf === "benchmark") {
      if (!isClimbClassic(c)) return false;
    } else if (qf === "beta") {
      if (!(state.betaByClimb[c.u]?.length > 0)) return false;
    } else if (qf === "sent") {
      if (!sentSet.has(c.u.toLowerCase())) return false;
    } else if (qf === "unsent") {
      if (sentSet.has(c.u.toLowerCase())) return false;
    }
    if (state.excludeZeroSends) {
      if (getClimbTargetAscents(c) + getClimbNearbyAscents(c) === 0 && !c.draft && !c.is_draft) return false;
    }
    if (filterPids.length > 0) {
      const climbHoldSet = new Set(c.h.map(x => x[0]));
      for (const reqPid of filterPids) {
        if (!climbHoldSet.has(reqPid)) return false;
      }
    }
    return true;
  });

  list.sort((a, b) => {
    const aTgt = getClimbTargetAscents(a);
    const bTgt = getClimbTargetAscents(b);
    const aNb = getClimbNearbyAscents(a);
    const bNb = getClimbNearbyAscents(b);
    if (sortMode === "featured") {
      if (primaryLower && primaryLower !== "me") {
        const aMine = a.s.toLowerCase() === primaryLower ? 0 : 1;
        const bMine = b.s.toLowerCase() === primaryLower ? 0 : 1;
        if (aMine !== bMine) return aMine - bMine;
      }
      const aBeta = (state.betaByClimb[a.u]?.length || 0) > 0 ? 0 : 1;
      const bBeta = (state.betaByClimb[b.u]?.length || 0) > 0 ? 0 : 1;
      if (aBeta !== bBeta) return aBeta - bBeta;
      return bTgt - aTgt || bNb - aNb || (b.at || 0) - (a.at || 0);
    } else if (sortMode === "nearby") {
      return (bTgt + bNb) - (aTgt + aNb) || bTgt - aTgt || bNb - aNb || (b.at || 0) - (a.at || 0);
    } else if (sortMode === "asc_tgt" || sortMode === "asc45") {
      return bTgt - aTgt || bNb - aNb || (b.at || 0) - (a.at || 0);
    } else if (sortMode === "asctotal") {
      return (b.at || 0) - (a.at || 0) || bTgt - aTgt || bNb - aNb;
    } else if (sortMode === "grade_asc") {
      return (a.d || 0) - (b.d || 0) || bTgt - aTgt || bNb - aNb || (b.at || 0) - (a.at || 0);
    } else if (sortMode === "grade_desc") {
      return (b.d || 0) - (a.d || 0) || bTgt - aTgt || bNb - aNb || (b.at || 0) - (a.at || 0);
    } else if (sortMode === "quality") {
      return (b.q || 0) - (a.q || 0) || bTgt - aTgt || bNb - aNb || (b.at || 0) - (a.at || 0);
    }
    return 0;
  });

  state.filteredClimbs = list;
  renderClimbList();
}

function formatAscentSummary(c) {
  if (c.draft || c.is_draft) return `Draft @${getActiveAngle()}°`;
  const aTgt = getClimbTargetAscents(c);
  const aNb = getClimbNearbyAscents(c);
  const tot = Math.max(c.at || 0, aTgt + aNb);
  return `${tot.toLocaleString()} asc`;
}

function renderClimbList() {
  const container = document.getElementById("climb-list-container");
  const countLbl = document.getElementById("climbs-count-label");
  if (!container) return;

  if (countLbl) {
    const fLen = state.filteredClimbs.length;
    const tLen = state.climbs.length;
    countLbl.textContent = fLen === tLen
      ? `${tLen.toLocaleString()} climbs`
      : `${fLen.toLocaleString()} / ${tLen.toLocaleString()} climbs`;
  }

  const sentSet = new Set(state.logbook.filter(l => l.status === "sent").map(l => l.climb_uuid));
  const triedSet = new Set(state.logbook.filter(l => l.status === "attempt").map(l => l.climb_uuid));
  const slice = state.filteredClimbs.slice(0, 180);

  if (slice.length === 0) {
    container.innerHTML = `
      <div style="padding:1.5rem 0.75rem; text-align:center; color:var(--text-muted); font-size:0.78125rem;">
        No climbs match your filters.<br/>
        <button class="btn-secondary-action" style="margin-top:0.625rem;" onclick="resetAllClimbFilters()">Reset Filters</button>
      </div>
    `;
    return;
  }

  container.innerHTML = slice.map(c => {
    const isActive = state.activeClimb && state.activeClimb.u === c.u;
    const hasBeta = (state.betaByClimb[c.u]?.length || 0) > 0;
    const isSent = sentSet.has(c.u);
    const isTried = !isSent && triedSet.has(c.u);
    const isAdj = Boolean(c.adj);
    const isClassic = isClimbClassic(c);
    const vClass = (c.v || "v0").toLowerCase();
    const bmAngleStr = (c.bma && c.bma.length > 0) ? ` @ ${c.bma.join("/")}°` : "";

    return `
      <div class="climb-card ${isActive ? 'active' : ''}" onclick="selectClimbByUuid('${c.u}', true)">
        <div class="cc-left">
          <span class="grade-pill ${vClass}">${c.g}</span>
          <div class="cc-body">
            <span class="cc-name">${escapeHtml(c.n)}</span>
            <div class="cc-sub">
              <span>@${escapeHtml(c.s)}</span>
              <span>·</span>
              <span>${formatAscentSummary(c)}</span>
            </div>
          </div>
        </div>
        <div class="cc-badges">
          ${isSent ? '<span class="emo-badge sent-emo" title="Sent">✅</span>' : ''}
          ${isTried ? '<span class="emo-badge tried-emo" title="Tried / Projecting">⚡</span>' : ''}
          ${hasBeta ? `<span class="emo-badge beta-emo" title="Review / Compare Beta (${state.betaByClimb[c.u].length})" onclick="openClimbBeta('${c.u}', event)">🎬</span>` : ''}
          ${isClassic ? `<span class="c-block cl45" title="Official Tension Classic${bmAngleStr}">C</span>` : ''}
          ${isAdj ? `<span class="emo-badge adj" title="Angle-adjusted grade: ${escapeHtml(c.adj || '')}">📐</span>` : ''}
        </div>
      </div>
    `;
  }).join("");
}

function openClimbBeta(uuid, evt) {
  if (evt) evt.stopPropagation();
  selectClimbByUuid(uuid, false);
  setWorkspaceMode("compare");
}

function resetAllClimbFilters() {
  state.searchQuery = "";
  state.selectedGrades = [];
  state.quickFilter = "all";
  state.excludeZeroSends = false;
  state.selectedHoldFilters = {};
  state.activeListFilterId = null;
  const input = document.getElementById("climb-search-input");
  if (input) input.value = "";
  buildGradeScroller();
  document.querySelectorAll(".filter-chip[data-filter]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.filter === "all");
  });
  document.getElementById("btn-exclude-zero")?.classList.remove("active");
  renderListFilterBanner();
  renderHoldFilterBanner();
  updateFilteredClimbs();
}

function selectClimbByUuid(uuid, switchToBoardOnMobile = false) {
  const idx = state.filteredClimbs.findIndex(c => c.u.toLowerCase() === String(uuid).toLowerCase());
  if (idx >= 0) {
    selectClimbByIndex(idx, switchToBoardOnMobile);
  } else {
    const fullClimb = state.climbsByUuid[uuid] || state.climbsByUuid[String(uuid).toLowerCase()];
    if (fullClimb) {
      state.activeClimb = fullClimb;
      onActiveClimbChanged(switchToBoardOnMobile);
    }
  }
}

function selectClimbByIndex(idx, switchToBoardOnMobile = false) {
  if (state.filteredClimbs.length === 0) return;
  const clamped = Math.max(0, Math.min(state.filteredClimbs.length - 1, idx));
  state.activeClimbIdx = clamped;
  state.activeClimb = state.filteredClimbs[clamped];
  onActiveClimbChanged(switchToBoardOnMobile);
}

function stepClimb(delta) {
  if (state.filteredClimbs.length === 0) return;
  let nextIdx = state.activeClimbIdx + delta;
  if (nextIdx < 0) nextIdx = state.filteredClimbs.length - 1;
  if (nextIdx >= state.filteredClimbs.length) nextIdx = 0;
  selectClimbByIndex(nextIdx, false);
}

function onActiveClimbChanged(switchToBoardOnMobile) {
  const c = state.activeClimb;
  if (!c) return;

  const list = [];
  for (const [pid, role] of c.h) {
    const h = state.holdsByPid[pid];
    if (h) list.push({ hold: h, role, pid });
  }
  list.sort((a, b) => (a.hold.row - b.hold.row) || (a.hold.col - b.hold.col));
  state.activeClimbHoldsSorted = list;

  const startIdx = list.findIndex(item => item.role === 5);
  state.selectedInspectorIdx = startIdx >= 0 ? startIdx : 0;

  // Initialize personal grade rating steppers automatically to the climb's consensus grade
  const defaultRated = normalizeRatedGrade(c.g || c.v || "V2");
  state.wallQuickLogRatedGrade = defaultRated;
  state.logFormRatedGrade = defaultRated;
  renderWallQuickLogRatingUI();
  renderLogFormRatingUI();

  renderHeaderActiveClimb();
  renderListTagPopover();
  renderClimbList();
  renderBoardOverlay();
  renderHoldInspector();
  renderBetaAndComparator();
  renderAutoCropCaption();
  renderLogbookSection();

  if (switchToBoardOnMobile && (window.innerWidth < 1024 || state.phonePreview)) {
    switchMobileTab("board");
  }
}

function renderHeaderActiveClimb() {
  const c = state.activeClimb;
  if (!c) return;

  const tgtAngle = getActiveAngle();
  const loAngle = getLoAngle();
  const hiAngle = getHiAngle();
  const hasLo = loAngle !== tgtAngle;
  const hasHi = hiAngle !== tgtAngle;

  const isSent = state.logbook.some(l => l.climb_uuid === c.u && l.status === "sent");
  const isTried = !isSent && state.logbook.some(l => l.climb_uuid === c.u && l.status === "attempt");
  const betaCount = (state.betaByClimb[c.u] || []).length;
  const hasAnyBeta = betaCount > 0 || state.localCompareClips.length > 0;
  document.getElementById("hdr-beta-cnt")?.replaceChildren(String(betaCount));
  document.getElementById("right-beta-cnt")?.replaceChildren(String(betaCount));

  document.querySelectorAll('[data-dmode="compare"], [data-mobtab="compare"]').forEach(btn => {
    btn.classList.toggle("disabled-tab", !hasAnyBeta);
  });
  const watchBtn = document.getElementById("btn-right-watch-beta");
  if (watchBtn) {
    watchBtn.classList.toggle("disabled-tab", !hasAnyBeta);
  }

  const inListsCount = state.lists.filter(l => (l.climb_uuids || []).some(u => u.toLowerCase() === c.u.toLowerCase())).length;
  const listBtn = document.getElementById("btn-add-to-list");
  if (listBtn) {
    listBtn.textContent = inListsCount > 0 ? `📋 Lists (${inListsCount})` : "📋 + List";
    listBtn.classList.toggle("active", inListsCount > 0);
  }

  const adjInfo = c.adj ? ` · 📐 ${c.adj}` : "";
  const statusEmoji = isSent ? " · ✅" : (isTried ? " · ⚡" : "");
  const nmEmoji = c.nm ? " · 🚫 No Match" : "";
  const aTgt = getClimbTargetAscents(c);
  const aLo = getClimbLoAscents(c);
  const aHi = getClimbHiAscents(c);
  const tot = Math.max(c.at || 0, aTgt + aLo + aHi);
  const setAngle = c.sa || tgtAngle;
  const deskMetaTxt = `@${c.s} · Set @ ${setAngle}° · ${tot.toLocaleString()} asc`;
  const mobMetaTxt = `@${c.s} · Set @ ${setAngle}° · ${tot.toLocaleString()} asc`;

  for (const prefix of ["hdr-climb", "mob-hdr"]) {
    const gradeEl = document.getElementById(`${prefix}-grade`);
    const nameEl = document.getElementById(`${prefix}-name`);
    const metaEl = document.getElementById(`${prefix}-meta`);
    if (gradeEl) {
      gradeEl.textContent = c.g;
      gradeEl.className = `grade-pill ${(c.v || "v0").toLowerCase()}`;
    }
    if (nameEl) nameEl.textContent = c.n;
    if (metaEl) metaEl.textContent = prefix === "mob-hdr" ? `${mobMetaTxt}${nmEmoji}${adjInfo}${statusEmoji}` : deskMetaTxt;
  }

  // Expanded top-right climb details box (#right-climb-details-box)
  const detailsBox = document.getElementById("right-climb-details-box");
  if (detailsBox) {
    const qualVal = (c.q || 3.0).toFixed(1);
    const starsStr = "★".repeat(Math.max(1, Math.min(3, Math.round(c.q || 3))));
    const isClassic = isClimbClassic(c);
    const isAdj = Boolean(c.adj);
    const bmAngleLbl = (c.bma && c.bma.length > 0) ? ` @ ${c.bma.join("/")}°` : "";

    const badges = [
      `<span class="rcd-pill qual" title="Average Quality Rating (1–3 stars)">${starsStr} ${qualVal}</span>`,
    ];
    if (isSent) badges.push(`<span class="rcd-pill sent">✅ Sent</span>`);
    else if (isTried) badges.push(`<span class="rcd-pill tried">⚡ Tried</span>`);
    if (c.nm) {
      badges.push(`<span class="rcd-pill nomatch" title="No matching hands on the same hold (official Tension setter rule)">🚫 NO MATCH</span>`);
    } else {
      badges.push(`<span class="rcd-pill match-ok" title="Matching hands is permitted on this climb">🤝 Match OK</span>`);
    }
    if (isClassic) {
      badges.push(`<span class="rcd-pill classic-pill" title="Official Tension Benchmark Classic${bmAngleLbl}"><span class="c-block cl45">C</span> Classic${escapeHtml(bmAngleLbl)}</span>`);
    }
    if (isAdj && c.adj) {
      badges.push(`<span class="rcd-pill adj" title="Monotonic angle-adjusted ${tgtAngle}° grade">📐 ${escapeHtml(c.adj)}</span>`);
    }

    const descHtml = c.desc
      ? `<div class="rcd-notes-box" title="Setter description / rules">📝 ${escapeHtml(c.desc)}</div>`
      : "";

    const saRef = c.sa_ref || c.sa || tgtAngle;
    const domA = c.dom_a || tgtAngle;
    const aSa = c.a_sa || 0;
    const nearbySet = new Set([tgtAngle]);
    if (hasLo) nearbySet.add(loAngle);
    if (hasHi) nearbySet.add(hiAngle);
    const showSaCol = !nearbySet.has(saRef) && aSa > 0;

    const isBm = (ang) => Array.isArray(c.bma) && c.bma.includes(ang);
    const cTag = `<span class="c-block cl45" style="font-size:0.5625rem; padding:1px 0.21875rem; margin-left:0.1875rem;" title="Official Tension Classic Benchmark">C</span>`;

    const rawLo = getClimbRawLoGrade(c);
    const rawTgt = getClimbRawTargetGrade(c);
    const rawHi = getClimbRawHiGrade(c);
    const vLoSub = rawLo
      ? `${escapeHtml(getClimbLoGrade(c))}<span class="rcd-raw-sub">raw ${escapeHtml(rawLo)}</span>`
      : escapeHtml(getClimbLoGrade(c));
    const vTgtSub = rawTgt
      ? `${escapeHtml(getClimbTargetGrade(c))}<span class="rcd-raw-sub">raw ${escapeHtml(rawTgt)}</span>`
      : escapeHtml(getClimbTargetGrade(c));
    const vHiSub = rawHi
      ? `${escapeHtml(getClimbHiGrade(c))}<span class="rcd-raw-sub">raw ${escapeHtml(rawHi)}</span>`
      : escapeHtml(getClimbHiGrade(c));

    const cols = [];
    if (showSaCol) {
      cols.push(`
        <div class="rcd-asc-cell" title="Ascents & grade at ${saRef}° (${isBm(saRef) ? "Official Classic Benchmark" : (domA === saRef ? "Most-Sent Anchor Angle" : "Setter Angle")})">
          <span class="rcd-asc-lbl">@ ${saRef}°${isBm(saRef) ? cTag : (domA === saRef ? " ★" : "")}</span>
          <span class="rcd-asc-val">${aSa.toLocaleString()}</span>
          <span class="rcd-asc-sub">${escapeHtml(c.v_sa || "—")}</span>
        </div>
      `);
    }
    if (hasLo) {
      cols.push(`
        <div class="rcd-asc-cell" title="${isBm(loAngle) ? `Official Classic Benchmark at ${loAngle}°` : (domA === loAngle ? "Most-sent angle" : `Ascents at ${loAngle}°`)}">
          <span class="rcd-asc-lbl">@ ${loAngle}°${isBm(loAngle) ? cTag : (domA === loAngle ? " ★" : "")}</span>
          <span class="rcd-asc-val">${aLo.toLocaleString()}</span>
          <span class="rcd-asc-sub">${vLoSub}</span>
        </div>
      `);
    }
    // ONLY the target angle cell receives the blue highlight (.primary-45)
    cols.push(`
      <div class="rcd-asc-cell primary-45" title="Your ${tgtAngle}° wall">
        <span class="rcd-asc-lbl">@ ${tgtAngle}°${isBm(tgtAngle) ? cTag : (domA === tgtAngle ? " ★" : "")}</span>
        <span class="rcd-asc-val">${aTgt.toLocaleString()}</span>
        <span class="rcd-asc-sub">${vTgtSub}</span>
      </div>
    `);
    if (hasHi) {
      cols.push(`
        <div class="rcd-asc-cell" title="${isBm(hiAngle) ? `Official Classic Benchmark at ${hiAngle}°` : (domA === hiAngle ? "Most-sent angle" : `Ascents at ${hiAngle}°`)}">
          <span class="rcd-asc-lbl">@ ${hiAngle}°${isBm(hiAngle) ? cTag : (domA === hiAngle ? " ★" : "")}</span>
          <span class="rcd-asc-val">${aHi.toLocaleString()}</span>
          <span class="rcd-asc-sub">${vHiSub}</span>
        </div>
      `);
    }

    const colClass = cols.length === 4 ? "four-cols" : (cols.length === 2 ? "two-cols" : "");
    detailsBox.innerHTML = `
      <div class="rcd-badges-row">${badges.join("")}</div>
      ${descHtml}
      <div class="rcd-asc-grid ${colClass}">
        ${cols.join("")}
      </div>
    `;
  }
}

// ============================================================================
// LISTS, PROJECTS & INTERACTIVE DRAFT CLIMB SETTER ON THE 3D WALL
// ============================================================================
function toggleListTagPopover(evt) {
  if (evt) evt.stopPropagation();
  const pop = document.getElementById("list-tag-popover");
  if (!pop) return;
  const isOpen = pop.style.display !== "none";
  pop.style.display = isOpen ? "none" : "flex";
  if (!isOpen) renderListTagPopover();
}

function renderListTagPopover() {
  const container = document.getElementById("list-tag-options");
  const c = state.activeClimb;
  if (!container || !c) return;

  container.innerHTML = state.lists.map(lst => {
    const inList = (lst.climb_uuids || []).some(u => u.toLowerCase() === c.u.toLowerCase());
    return `
      <button class="ltp-opt-btn ${inList ? 'in-list' : ''}" onclick="toggleClimbInList('${lst.id}', '${c.u}')">
        <span>${escapeHtml(lst.icon || '📋')} ${escapeHtml(lst.name)}</span>
        <span>${inList ? '✓ Saved' : '+ Add'}</span>
      </button>
    `;
  }).join("");
}

async function toggleClimbInList(listId, climbUuid) {
  try {
    const res = await fetch("/api/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle_climb", list_id: listId, climb_uuid: climbUuid }),
    });
    if (res.ok) {
      const data = await res.json();
      applyServerState(data.state);
    }
  } catch (e) {
    const lst = state.lists.find(l => l.id === listId);
    if (lst) {
      const idx = lst.climb_uuids.findIndex(u => u.toLowerCase() === climbUuid.toLowerCase());
      if (idx >= 0) lst.climb_uuids.splice(idx, 1);
      else lst.climb_uuids.unshift(climbUuid);
    }
  }
  renderHeaderActiveClimb();
  renderListTagPopover();
  renderListsSection();
  if (state.activeListFilterId === listId) {
    updateFilteredClimbs();
  }
}

async function createNewClimbList() {
  const icon = document.getElementById("new-list-icon")?.value.trim() || "📌";
  const name = document.getElementById("new-list-name")?.value.trim() || "";
  const description = document.getElementById("new-list-desc")?.value.trim() || `Custom ${getActiveBoardLabel()} list`;
  if (!name) {
    showToast("Enter a list name first!");
    return;
  }
  try {
    const res = await fetch("/api/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", name, icon, description }),
    });
    if (res.ok) {
      const data = await res.json();
      applyServerState(data.state);
    }
  } catch (e) {
    state.lists.push({ id: `list_${Date.now()}`, name, icon, description, climb_uuids: [] });
  }
  document.getElementById("new-list-name").value = "";
  document.getElementById("new-list-desc").value = "";
  renderListsSection();
  renderListTagPopover();
  showToast(`✓ Created list "${name}"!`);
}

async function deleteClimbList(listId) {
  try {
    const res = await fetch("/api/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", list_id: listId }),
    });
    if (res.ok) {
      const data = await res.json();
      applyServerState(data.state);
    }
  } catch (e) {
    state.lists = state.lists.filter(l => l.id !== listId);
  }
  if (state.activeListFilterId === listId) {
    clearActiveListFilter();
  }
  renderListsSection();
  renderListTagPopover();
}

function loadListOntoWall(listId) {
  state.activeListFilterId = listId;
  renderListFilterBanner();
  updateFilteredClimbs();
  if (state.filteredClimbs.length > 0) {
    selectClimbByIndex(0, false);
  }
  setWorkspaceMode("wall");
  const lst = state.lists.find(l => l.id === listId);
  if (lst) {
    showToast(`📋 Loaded "${lst.name}" (${state.filteredClimbs.length} climbs) onto Wall!`);
  }
}

function clearActiveListFilter() {
  state.activeListFilterId = null;
  renderListFilterBanner();
  updateFilteredClimbs();
}

function renderListFilterBanner() {
  const banner = document.getElementById("list-filter-banner");
  const titleEl = document.getElementById("list-filter-title");
  if (!banner || !titleEl) return;
  if (!state.activeListFilterId) {
    banner.style.display = "none";
    return;
  }
  const lst = state.lists.find(l => l.id === state.activeListFilterId);
  if (!lst) {
    banner.style.display = "none";
    return;
  }
  banner.style.display = "flex";
  titleEl.textContent = `${lst.icon || '📋'} List: ${lst.name} (${(lst.climb_uuids || []).length})`;
}

function setListsLayoutScope(scope) {
  state.listsLayoutScope = scope === "all" ? "all" : "active";
  document.getElementById("lists-scope-active")?.classList.toggle("active", state.listsLayoutScope !== "all");
  document.getElementById("lists-scope-all")?.classList.toggle("active", state.listsLayoutScope === "all");
  renderListsSection();
}

function renderListsSection() {
  const grid = document.getElementById("lists-cards-grid");
  if (!grid) return;

  const boardLabel = getActiveBoardLabel();
  const onlyActive = state.listsLayoutScope !== "all";
  let hiddenOtherLists = 0;
  let hiddenOtherClimbs = 0;

  if (!state.lists || state.lists.length === 0) {
    grid.innerHTML = `
      <div class="list-card" style="border-top: 0.1875rem solid #38bdf8; justify-content:center; align-items:center; text-align:center; padding:1.375rem;">
        <div style="font-size:0.84375rem; font-weight:800; color:#f8fafc;">📋 No Saved Lists or Circuits Yet</div>
        <p class="muted-hint" style="margin:0.375rem 0 0.75rem;">
          Create a custom list above, set a Draft Climb, or connect your Tension Board 2 account to pull your synced circuits!
        </p>
        <div style="display:flex; gap:0.5rem; flex-wrap:wrap; justify-content:center;">
          <button class="btn-primary-action" style="flex:0 0 auto;" onclick="openAuroraSyncModal()">🔗 Connect Tension Account</button>
          <button class="btn-secondary-action" onclick="startDraftClimbFromLists()">🛠️ Set Draft Climb</button>
        </div>
      </div>
    `;
    return;
  }

  const cardsHtml = state.lists.map(lst => {
    const activeBoardClimbs = (lst.climb_uuids || [])
      .map(u => state.climbsByUuid[u] || state.climbsByUuid[String(u).toLowerCase()])
      .filter(Boolean);

    const itemsMap = new Map();
    for (const c of activeBoardClimbs) {
      itemsMap.set(c.u.toLowerCase(), {
        uuid: c.u,
        name: c.n,
        setter: c.s,
        g: c.g,
        v: c.v,
        layout_name: boardLabel,
        on_active_board: true,
        climbObj: c,
      });
    }
    for (const it of (lst.items || [])) {
      const k = String(it.uuid || "").toLowerCase();
      if (!k) continue;
      const cObj = state.climbsByUuid[it.uuid] || state.climbsByUuid[k];
      if (cObj) {
        itemsMap.set(k, {
          uuid: cObj.u,
          name: cObj.n,
          setter: cObj.s,
          g: cObj.g,
          v: cObj.v,
          layout_name: boardLabel,
          on_active_board: true,
          climbObj: cObj,
          notes: it.notes || cObj.notes || "",
        });
      } else {
        itemsMap.set(k, {
          uuid: it.uuid,
          name: it.name || "Untitled Climb",
          setter: it.setter || "unknown",
          g: it.g || "V2",
          v: it.v || "V2",
          layout_name: it.layout_name || "Other Layout",
          on_active_board: false,
          ascents: it.ascents || 0,
        });
      }
    }
    const allItems = Array.from(itemsMap.values());
    const nActive = allItems.filter(x => x.on_active_board).length;
    const nOther = allItems.length - nActive;
    const visibleItems = onlyActive ? allItems.filter(x => x.on_active_board) : allItems;

    if (onlyActive && nOther > 0) {
      hiddenOtherClimbs += nOther;
    }
    if (onlyActive && visibleItems.length === 0 && nOther > 0) {
      hiddenOtherLists++;
      return "";
    }

    return `
      <div class="list-card" style="border-top: 0.1875rem solid ${escapeHtml(lst.color || '#38bdf8')};">
        <div class="lc-header">
          <div>
            <div class="lc-title-row">
              <span class="lc-icon">${escapeHtml(lst.icon || '🔗')}</span>
              <span class="lc-title">${escapeHtml(lst.name)}</span>
              <span class="lc-count">${visibleItems.length} ${visibleItems.length === 1 ? 'climb' : 'climbs'}</span>
            </div>
            <p class="muted-hint" style="margin-top:0.1875rem;">${escapeHtml(lst.description || '')}</p>
          </div>
          <div class="lc-actions">
            ${lst.id === "drafts" ? `
              <button class="btn-xs-ghost" onclick="startDraftClimbFromLists()">🛠️ + Set Draft</button>
            ` : ''}
            ${nActive > 0 ? `
              <button class="btn-load-list" onclick="loadListOntoWall('${lst.id}')">🧗 Load ${nActive} on Wall</button>
            ` : (allItems.length > 0 ? `
              <span class="layout-badge mirror-12x8" title="All climbs in this circuit are on another board crop/layout">Other Layout</span>
            ` : '')}
            ${!lst.is_tension_circuit && lst.id !== "drafts" ? `
              <button class="btn-xs-ghost" onclick="deleteClimbList('${lst.id}')" title="Delete list">🗑️</button>
            ` : ''}
          </div>
        </div>

        <div class="lc-climbs-list">
          ${visibleItems.length === 0 ? `
            <div class="muted-hint" style="padding:0.75rem 0.375rem; text-align:center;">
              Empty ${escapeHtml(boardLabel)} list — click <b>📋 + List</b> on the Wall right sidebar to add climbs!
            </div>
          ` : visibleItems.map(it => {
            if (it.on_active_board && it.climbObj) {
              const c = it.climbObj;
              const hasBeta = (state.betaByClimb[c.u]?.length || 0) > 0;
              return `
                <div class="lc-climb-item" onclick="selectClimbByUuid('${c.u}', true); setWorkspaceMode('wall');">
                  <div class="lc-item-left">
                    <span class="grade-pill ${(c.v || 'v0').toLowerCase()}">${c.g}</span>
                    <div style="min-width:0; flex:1;">
                      <div style="font-size:0.78125rem; font-weight:800; display:flex; align-items:center; gap:0.375rem;">
                        <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(c.n)}</span>
                        <span class="layout-badge spray-10x8">${escapeHtml(boardLabel)}</span>
                      </div>
                      <div style="font-size:0.65625rem; color:var(--text-muted);">
                        @${escapeHtml(c.s)} · ${formatAscentSummary(c)}${it.notes ? ` · "${escapeHtml(it.notes)}"` : ''} ${hasBeta ? `· 🎬 ${state.betaByClimb[c.u].length}` : ''}
                      </div>
                    </div>
                  </div>
                  <button class="btn-rm-climb" title="Remove from ${escapeHtml(lst.name)}"
                          onclick="event.stopPropagation(); toggleClimbInList('${lst.id}', '${c.u}')">✕</button>
                </div>
              `;
            }
            return `
              <div class="lc-climb-item" style="opacity:0.86;" onclick="showToast('ℹ️ &quot;${escapeHtml(it.name)}&quot; is on ${escapeHtml(it.layout_name)} (not on ${escapeHtml(boardLabel)})')">
                <div class="lc-item-left">
                  <span class="grade-pill ${(it.v || 'v2').toLowerCase()}">${escapeHtml(it.g)}</span>
                  <div style="min-width:0; flex:1;">
                    <div style="font-size:0.78125rem; font-weight:800; display:flex; align-items:center; gap:0.375rem;">
                      <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(it.name)}</span>
                      <span class="layout-badge mirror-12x8">${escapeHtml(it.layout_name)}</span>
                    </div>
                    <div style="font-size:0.65625rem; color:var(--text-muted);">
                      @${escapeHtml(it.setter)} · ${(it.ascents || 0).toLocaleString()} ascents on ${escapeHtml(it.layout_name)}
                    </div>
                  </div>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }).filter(Boolean).join("");

  const hiddenHintHtml = (onlyActive && (hiddenOtherLists > 0 || hiddenOtherClimbs > 0)) ? `
    <div class="list-card" style="border-top: 0.1875rem dashed #64748b; justify-content:center; align-items:center; text-align:center; padding:1.125rem;">
      <div style="font-size:0.8125rem; font-weight:800; color:#e2e8f0;">
        🌐 ${hiddenOtherLists} circuits (${hiddenOtherClimbs} climbs) on other layouts are hidden by "Just ${escapeHtml(boardLabel)}"
      </div>
      <p class="muted-hint" style="margin:0.375rem 0 0.75rem;">
        Switch the top toggle to <b>All Board Crops / Layouts</b> to browse your full Tension circuits across every layout.
      </p>
      <button class="btn-secondary-action" onclick="setListsLayoutScope('all')">
        🌐 Show All Board Crops / Layouts
      </button>
    </div>
  ` : "";

  grid.innerHTML = cardsHtml + hiddenHintHtml;
}

function startDraftClimbFromLists() {
  setWorkspaceMode("wall");
  toggleDraftSetterMode(true);
}

function toggleDraftSetterMode(forceVal) {
  state.draftSetterMode = typeof forceVal === "boolean" ? forceVal : !state.draftSetterMode;
  if (state.draftSetterMode) {
    state.holdFilterMode = false;
    document.getElementById("btn-hold-search-mode")?.classList.remove("active");
    document.getElementById("hold-search-state-txt")?.replaceChildren("OFF");
    showToast("🛠️ Draft Climb Setter ON: click any hold on the wall to light it up!");
  }
  document.getElementById("btn-draft-setter-mode")?.classList.toggle("active", state.draftSetterMode);
  const banner = document.getElementById("draft-setter-banner");
  if (banner) {
    banner.style.display = state.draftSetterMode ? "flex" : "none";
  }
  updateDraftHoldCountUI();
  renderBoardOverlay();
}

function setDraftBrushRole(role) {
  state.draftBrushRole = role;
  document.querySelectorAll(".dsb-brush[data-role]").forEach(btn => {
    btn.classList.toggle("active", Number(btn.dataset.role) === role);
  });
}

function clearDraftHolds() {
  state.draftHolds = {};
  updateDraftHoldCountUI();
  renderBoardOverlay();
}

function updateDraftHoldCountUI() {
  const cnt = Object.keys(state.draftHolds).length;
  document.getElementById("draft-hold-cnt")?.replaceChildren(String(cnt));
}

async function saveNewDraftClimb() {
  const name = document.getElementById("draft-climb-name")?.value.trim() || "New Draft Climb";
  const vGrade = document.getElementById("draft-climb-grade")?.value || "V2";
  const pushToTension = Boolean(document.getElementById("draft-push-tension")?.checked);
  const holdsArr = Object.entries(state.draftHolds).map(([pid, role]) => [Number(pid), Number(role)]);

  if (holdsArr.length < 2) {
    showToast("Click at least 2 holds on the wall before saving your draft climb!");
    return;
  }

  const fullGrade = vGrade;

  try {
    const res = await fetch("/api/draft-climb", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        v_grade: vGrade,
        full_grade: fullGrade,
        angle: getActiveAngle(),
        holds: holdsArr,
        setter: getPrimaryUser(),
        is_draft: true,
        push_to_tension: pushToTension,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.climb) {
        state.climbs.unshift(data.climb);
        rebuildClimbsMap();
      }
      applyServerState(data.state);
      toggleDraftSetterMode(false);
      document.getElementById("draft-climb-name").value = "";
      state.draftHolds = {};
      updateFilteredClimbs();
      if (data.climb) {
        selectClimbByUuid(data.climb.u, false);
      }
      showToast(`✓ Saved "${name}" (${fullGrade}) to "Draft Climbs"!`);
    }
  } catch (e) {
    showToast("Error saving draft climb.");
  }
}

// ============================================================================
// 100vh FULL-HEIGHT MULTI-BOARD VIRTUAL LED WALL & HOLD ZOOM INSPECTOR
// ============================================================================
function renderBoardAxes() {
  const board = state.boardMeta || {};
  const colMin = Number(board.col_min ?? -5);
  const colMax = Number(board.col_max ?? 5);
  const rowMin = Number(board.row_min ?? 1);
  const rowMax = Number(board.row_max ?? 15);
  const colCount = Math.max(1, colMax - colMin + 1);
  const rowCount = Math.max(1, rowMax - rowMin + 1);

  // Measure exact bolt column X% and row Y% from active board hold coordinates
  // so axis labels align pixel-for-pixel with the crosshair lines and bolt holes.
  const colSums = {};
  const colCnts = {};
  const rowSums = {};
  const rowCnts = {};
  for (const h of state.holds || []) {
    const { x, y } = getHoldPctCoords(h);
    const cNum = Number(h.col);
    if (Number.isInteger(cNum) && Number.isFinite(x)) {
      colSums[cNum] = (colSums[cNum] || 0) + x;
      colCnts[cNum] = (colCnts[cNum] || 0) + 1;
    }
    const rNum = Number(h.row);
    if (Number.isInteger(rNum) && Number.isFinite(y)) {
      rowSums[rNum] = (rowSums[rNum] || 0) + y;
      rowCnts[rNum] = (rowCnts[rNum] || 0) + 1;
    }
  }

  // 1. Dynamically generate top axis (#axis-top-letters) at exact bolt column X%
  const axisTop = document.getElementById("axis-top-letters");
  if (axisTop) {
    axisTop.classList.toggle("wide-board", colCount > 11);
    const colsHtml = [];
    for (let c = colMin; c <= colMax; c++) {
      const xPct = colCnts[c] ? (colSums[c] / colCnts[c]) : (((c - colMin + 0.5) / colCount) * 100);
      colsHtml.push(`<span style="left:${xPct.toFixed(3)}%;">${c}</span>`);
    }
    axisTop.innerHTML = colsHtml.join("");
  }

  // 2. Dynamically generate BOTH side axes (row_max down to row_min) at exact bolt row Y%
  const rowsHtml = [];
  for (let r = rowMax; r >= rowMin; r--) {
    const yPct = rowCnts[r] ? (rowSums[r] / rowCnts[r]) : (((rowMax - r + 0.5) / rowCount) * 100);
    rowsHtml.push(`<span style="top:${yPct.toFixed(3)}%;">${r}</span>`);
  }
  const rowsJoined = rowsHtml.join("");
  document.querySelectorAll(".axis-side").forEach(sideEl => {
    sideEl.classList.toggle("tall-board", rowCount > 15);
    sideEl.innerHTML = rowsJoined;
  });
}

function applyBoardGeometryAndLayers() {
  const board = state.boardMeta || {};

  // 1 & 2. Render exact bolt-aligned top & side axes
  renderBoardAxes();

  // 3. Populate stacked official WebP board layers over dark slate chalkboard (#131926)
  const layersEl = document.getElementById("board-layers");
  if (layersEl) {
    const layers = Array.isArray(board.layers) ? board.layers : [];
    layersEl.innerHTML = layers.map(src => `<img class="board-layer-img" src="${escapeHtml(src)}" alt="" />`).join("");
  }

  // 4. Populate 3D render image if supported on this board (10x8 Spray)
  const bgImg = document.getElementById("board-bg-img");
  if (bgImg) {
    bgImg.src = board.has_3d_render ? (board.render_img || "assets/boards/board_render_10x8_spray.png") : "";
    bgImg.alt = `${board.label || "Tension Board 2"} Wall`;
  }

  // 5. Show/hide 3D Render option in Settings based on board.has_3d_render
  const renderBtn = document.getElementById("btn-view-render");
  if (renderBtn) {
    renderBtn.style.display = board.has_3d_render ? "" : "none";
  }

  setBoardView(state.boardView, false);
}

function setBoardView(view, rememberPref = true) {
  const board = state.boardMeta || {};
  let resolvedView = view || (board.has_3d_render ? "render" : "official");
  if (resolvedView === "render" && !board.has_3d_render) {
    resolvedView = "official";
  }
  state.boardView = resolvedView;
  if (rememberPref) {
    state.userPreferredBoardView = resolvedView;
  }

  document.querySelectorAll(".view-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === resolvedView);
  });

  const vp = document.getElementById("board-viewport");
  const img = document.getElementById("board-bg-img");
  const layersEl = document.getElementById("board-layers");
  const svg = document.getElementById("board-overlay-svg");

  const isRender = use3DRenderMode();
  const isChalk = resolvedView === "chalk";

  if (vp) {
    vp.classList.toggle("chalk-mode", isChalk);
    const vpW = isRender ? 1035 : Number(board.width || 1080);
    const vpH = isRender ? 1395 : Number(board.height || 1473);
    vp.style.setProperty("--board-w", String(vpW));
    vp.style.setProperty("--board-h", String(vpH));
  }

  if (img) {
    img.style.display = isRender ? "block" : "none";
  }
  if (layersEl) {
    layersEl.style.display = isRender ? "none" : "block";
  }

  if (svg) {
    const svgW = isRender ? 1000 : Number(board.width || 1080);
    const svgH = isRender ? 1348 : Number(board.height || 1473);
    svg.setAttribute("viewBox", `0 0 ${svgW} ${svgH}`);
  }
  renderBoardAxes();

  renderBoardOverlay();
  renderHoldInspector();
}

function getHoldPctCoords(h) {
  if (!h) return { x: 50, y: 50 };
  if (use3DRenderMode() && h.ren_x != null && h.ren_y != null) {
    return { x: Number(h.ren_x), y: Number(h.ren_y) };
  }
  if (h.x_pct != null && h.y_pct != null) {
    return { x: Number(h.x_pct), y: Number(h.y_pct) };
  }
  return { x: Number(h.ren_x ?? 50), y: Number(h.ren_y ?? 50) };
}

function toggleShowAllHolds() {
  state.showAllHolds = !state.showAllHolds;
  document.getElementById("btn-toggle-unlit")?.classList.toggle("active", state.showAllHolds);
  renderBoardOverlay();
}

function toggleHoldFilterMode() {
  state.holdFilterMode = !state.holdFilterMode;
  if (state.holdFilterMode && state.draftSetterMode) {
    toggleDraftSetterMode(false);
  }
  document.getElementById("btn-hold-search-mode")?.classList.toggle("active", state.holdFilterMode);
  document.getElementById("hold-search-state-txt")?.replaceChildren(state.holdFilterMode ? "ON" : "OFF");
  renderBoardOverlay();
  if (state.holdFilterMode) {
    showToast("🎯 Tap any hold on the wall to filter climbs using that hold!");
  }
}

function clearHoldFilters() {
  state.selectedHoldFilters = {};
  renderHoldFilterBanner();
  renderBoardOverlay();
  updateFilteredClimbs();
}

function formatHoldTensionCoord(h) {
  if (!h) return "";
  return `${h.col_str},${h.row_str}`;
}

function getHoldMoonSecondary(h) {
  if (!h || !h.moon_coord) return "";
  const tc = formatHoldTensionCoord(h);
  return h.moon_coord === tc ? "" : h.moon_coord;
}

function renderHoldFilterBanner() {
  const banner = document.getElementById("hold-filter-banner");
  const pillsEl = document.getElementById("hold-filter-pills");
  if (!banner || !pillsEl) return;
  const pids = Object.keys(state.selectedHoldFilters).map(Number);
  if (pids.length === 0) {
    banner.style.display = "none";
    return;
  }
  banner.style.display = "flex";
  pillsEl.innerHTML = pids.map(pid => {
    const h = state.holdsByPid[pid];
    const mSec = getHoldMoonSecondary(h);
    const idSuffix = h?.hold_id ? ` (${h.hold_id})` : "";
    return `<span class="hfb-pill" onclick="toggleHoldInFilter(${pid})"><b>${h ? `${h.col_str},${h.row_str}` : pid}</b>${mSec ? ` <span style="font-size:0.5625rem; opacity:0.7;">${mSec}</span>` : ""}${idSuffix} ✕</span>`;
  }).join("");
}

function toggleHoldInFilter(pid) {
  if (pid in state.selectedHoldFilters) delete state.selectedHoldFilters[pid];
  else state.selectedHoldFilters[pid] = 0;
  renderHoldFilterBanner();
  renderBoardOverlay();
  updateFilteredClimbs();
}

function getHoldOutlinePath(h) {
  if (use3DRenderMode()) return h.path_render || "";
  return "";
}

function renderBoardOverlay() {
  const svg = document.getElementById("board-overlay-svg");
  if (!svg || (!state.activeClimb && !state.draftSetterMode)) return;

  const board = state.boardMeta || {};
  const isRender = use3DRenderMode();
  const W = isRender ? 1000 : Number(board.width || 1080);
  const H = isRender ? 1348 : Number(board.height || 1473);
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

  // Scale hold markers cleanly for 12ft wide boards (17 cols) vs 8ft wide boards (11 cols)
  const colSpan = Math.max(11, Number(board.col_max ?? 5) - Number(board.col_min ?? -5) + 1);
  const densityScale = 11 / colSpan; // 1.0 on 8ft wide, ~0.65 on 12ft wide

  const activeHoldsPairs = state.draftSetterMode
    ? Object.entries(state.draftHolds).map(([pid, role]) => [Number(pid), Number(role)])
    : (state.activeClimb?.h || []);

  const activeRoleByPid = {};
  for (const [pid, role] of activeHoldsPairs) {
    activeRoleByPid[pid] = role;
  }

  const inspectedItem = state.activeClimbHoldsSorted[state.selectedInspectorIdx];
  const inspectedPid = (!state.draftSetterMode && inspectedItem) ? inspectedItem.pid : null;

  let html = `
    <defs>
      <filter id="led-glow" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="5.5" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  `;

  if (inspectedItem && !state.draftSetterMode) {
    const { x, y } = getHoldPctCoords(inspectedItem.hold);
    const cx = (x / 100) * W;
    const cy = (y / 100) * H;
    html += `
      <line x1="0" y1="${cy.toFixed(1)}" x2="${W}" y2="${cy.toFixed(1)}" stroke="#ffffff" stroke-width="1.3" stroke-opacity="0.32" stroke-dasharray="6 5" />
      <line x1="${cx.toFixed(1)}" y1="0" x2="${cx.toFixed(1)}" y2="${H}" stroke="#ffffff" stroke-width="1.3" stroke-opacity="0.32" stroke-dasharray="6 5" />
    `;
  }

  if (state.showAllHolds || state.holdFilterMode || state.draftSetterMode) {
    const unlitR = Math.max(7, Math.round(13 * densityScale));
    const filtR = Math.max(13, Math.round(22 * densityScale));
    for (const h of state.holds) {
      const pid = h.placement_id;
      if (pid in activeRoleByPid && !state.holdFilterMode) continue;
      const { x, y } = getHoldPctCoords(h);
      const cx = (x / 100) * W;
      const cy = (y / 100) * H;
      const isFiltered = pid in state.selectedHoldFilters;
      const outlinePath = getHoldOutlinePath(h);

      html += `
        <g style="cursor:pointer;" onclick="onBoardHoldClick(${pid})">
          ${outlinePath ? `
            <path d="${outlinePath}"
                  fill="${isFiltered ? 'rgba(251, 191, 36, 0.35)' : 'rgba(15, 23, 42, 0.32)'}"
                  stroke="${isFiltered ? '#fbbf24' : 'rgba(148, 163, 184, 0.55)'}"
                  stroke-width="${isFiltered ? 4 : 1.6}"
                  stroke-linejoin="round" stroke-linecap="round" />
          ` : `
            <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${isFiltered ? filtR : unlitR}"
                    fill="${isFiltered ? 'rgba(251, 191, 36, 0.35)' : 'rgba(15, 23, 42, 0.45)'}"
                    stroke="${isFiltered ? '#fbbf24' : 'rgba(148, 163, 184, 0.55)'}"
                    stroke-width="${isFiltered ? 3.5 : 1.5}" />
          `}
        </g>
      `;
    }
  }

  const holdsToRender = state.draftSetterMode
    ? activeHoldsPairs.map(([pid, role]) => ({ hold: state.holdsByPid[pid], role, pid })).filter(x => x.hold)
    : state.activeClimbHoldsSorted;

  holdsToRender.forEach((item, idx) => {
    const { hold, role, pid } = item;
    const rInfo = ROLE_INFO[role] || ROLE_INFO[6];
    const { x, y } = getHoldPctCoords(hold);
    const cx = (x / 100) * W;
    const cy = (y / 100) * H;
    const isSelected = pid === inspectedPid;
    const isFiltered = pid in state.selectedHoldFilters;
    const outlinePath = getHoldOutlinePath(hold);

    const baseR = Math.max(17, Math.round((isSelected ? 30 : 25) * densityScale));
    let topY = cy - baseR;
    let botY = cy + baseR;
    let selRadius = baseR + Math.max(5, Math.round(7 * densityScale));
    if (outlinePath && Array.isArray(hold.bbox_render)) {
      const [minX, minY, maxX, maxY] = hold.bbox_render;
      topY = minY;
      botY = maxY;
      selRadius = Math.max((maxX - minX) / 2, (maxY - minY) / 2, 18) + 8;
    }

    const pillH = Math.max(17, Math.round(21 * Math.max(0.78, densityScale)));
    const labelOffset = Math.max(10, Math.round(12 * Math.max(0.78, densityScale)));
    const labelY = topY - labelOffset - pillH / 2 > 6 ? topY - labelOffset : botY + labelOffset + 3;
    const tCoord = `${hold.col_str},${hold.row_str}`;
    const fontBig = Math.max(11.5, 14.5 * Math.max(0.78, densityScale));
    const pillW = tCoord.length * (fontBig * 0.64) + 12;
    const clampedX = Math.max(pillW / 2 + 4, Math.min(W - pillW / 2 - 4, cx));

    html += `
      <g style="cursor:pointer;" onclick="onBoardHoldClick(${pid}, ${idx})">
        ${outlinePath ? `
          <path d="${outlinePath}"
                fill="none" stroke="${rInfo.color}"
                stroke-width="${isSelected ? 10 : 8}" stroke-opacity="0.48"
                stroke-linejoin="round" stroke-linecap="round"
                filter="url(#led-glow)" />
          <path d="${outlinePath}"
                fill="${rInfo.color}" fill-opacity="0.14"
                stroke="${rInfo.color}"
                stroke-width="${isSelected ? 5.2 : 4.2}"
                stroke-linejoin="round" stroke-linecap="round" />
        ` : `
          <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${baseR + 4}"
                  fill="none" stroke="${rInfo.color}" stroke-width="${(3.8 * Math.max(0.8, densityScale)).toFixed(1)}" stroke-opacity="0.45" filter="url(#led-glow)" />
          <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${baseR}"
                  fill="${rInfo.color}" fill-opacity="0.12"
                  stroke="${rInfo.color}" stroke-width="${((isSelected ? 5.2 : 4.2) * Math.max(0.8, densityScale)).toFixed(1)}" />
        `}
        ${isSelected ? `
          <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${selRadius.toFixed(1)}"
                  fill="none" stroke="#ffffff" stroke-width="2.4" stroke-dasharray="6 4" />
        ` : ''}
        ${isFiltered ? `
          <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(selRadius + 4).toFixed(1)}"
                  fill="none" stroke="#fbbf24" stroke-width="3.5" />
        ` : ''}
        <rect x="${(clampedX - pillW / 2).toFixed(1)}" y="${(labelY - pillH / 2).toFixed(1)}"
              width="${pillW.toFixed(1)}" height="${pillH}" rx="5"
              fill="#090d14" fill-opacity="0.94" stroke="${rInfo.color}" stroke-width="1.6" />
        <text x="${clampedX.toFixed(1)}" y="${labelY.toFixed(1)}"
              dominant-baseline="central" text-anchor="middle"
              font-family="ui-monospace, SFMono-Regular, monospace"
              fill="#ffffff" font-size="${fontBig.toFixed(1)}" font-weight="900">${tCoord}</text>
      </g>
    `;
  });

  svg.innerHTML = html;
}

function onBoardHoldClick(pid, sortedIdx = -1) {
  if (state.draftSetterMode) {
    const curRole = state.draftHolds[pid];
    if (curRole === state.draftBrushRole) {
      const order = [5, 6, 7, 8, 0];
      const next = order[(order.indexOf(curRole) + 1) % order.length];
      if (next === 0) delete state.draftHolds[pid];
      else state.draftHolds[pid] = next;
    } else if (curRole) {
      delete state.draftHolds[pid];
    } else {
      state.draftHolds[pid] = state.draftBrushRole;
    }
    updateDraftHoldCountUI();
    renderBoardOverlay();
    return;
  }
  if (state.holdFilterMode) {
    toggleHoldInFilter(pid);
    return;
  }
  if (sortedIdx >= 0) {
    state.selectedInspectorIdx = sortedIdx;
    renderBoardOverlay();
    renderHoldInspector();
  }
}

function stepInspectorHold(delta) {
  const n = state.activeClimbHoldsSorted.length;
  if (n === 0) return;
  state.selectedInspectorIdx = (state.selectedInspectorIdx + delta + n) % n;
  renderBoardOverlay();
  renderHoldInspector();
}

function buildHoldInspectorThumbHtml(hold) {
  const board = state.boardMeta || {};
  const isRender = use3DRenderMode();
  let { x, y } = getHoldPctCoords(hold);
  const bw = isRender ? 1035 : Number(board.width || 1080);
  const bh = isRender ? 1395 : Number(board.height || 1473);
  const colSpan = Math.max(11, Number(board.col_max ?? 5) - Number(board.col_min ?? -5) + 1);
  let zoomPct = Math.round(1450 * (colSpan / 11));

  // Adaptive per-hold zoom using exact hold silhouette bbox when available:
  // frames tiny footholds tightly (~2100%) while keeping large jugs unclipped (~600-900%).
  if (isRender && Array.isArray(hold.bbox_render) && hold.bbox_render.length === 4) {
    const [minX, minY, maxX, maxY] = hold.bbox_render;
    const spanXPct = ((maxX - minX) / 1000) * 100;
    const spanYPct = ((maxY - minY) / 1348) * 100 * (bh / bw);
    const maxSpanPct = Math.max(spanXPct, spanYPct, 2.2);
    zoomPct = Math.round(Math.max(580, Math.min(2100, (72 / maxSpanPct) * 100)));
    x = (((minX + maxX) / 2) / 1000) * 100;
    y = (((minY + maxY) / 2) / 1348) * 100;
  }

  const imgs = isRender
    ? [board.render_img || "assets/boards/board_render_10x8_spray.png"]
    : (Array.isArray(board.layers) ? board.layers : []);

  if (imgs.length === 0) {
    return `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-weight:900;color:#38bdf8;">${escapeHtml(formatHoldTensionCoord(hold))}</div>`;
  }

  return `
    <div class="hi-thumb-zoom">
      <div class="hi-thumb-zoom-inner" style="width:${zoomPct}%; aspect-ratio:${bw} / ${bh}; transform:translate(${(-x).toFixed(2)}%, ${(-y).toFixed(2)}%);">
        ${imgs.map(src => `<img src="${escapeHtml(src)}" alt="" />`).join("")}
      </div>
    </div>
  `;
}

function renderHoldInspector() {
  const card = document.getElementById("active-hold-Inspector");
  if (!card) return;
  const item = state.activeClimbHoldsSorted[state.selectedInspectorIdx];
  if (!item) {
    card.innerHTML = "";
    return;
  }

  const { hold, role } = item;
  const rInfo = ROLE_INFO[role] || ROLE_INFO[6];
  const total = state.activeClimbHoldsSorted.length;
  const moonSec = getHoldMoonSecondary(hold);
  const holdTitle = hold.hold_id ? escapeHtml(hold.hold_id) : `Hold #${hold.placement_id}`;
  const materialTxt = escapeHtml(hold.material || "Hold");
  const dirTxt = hold.direction
    ? `${escapeHtml(hold.direction)}${hold.degrees != null ? ` (${hold.degrees}°)` : ""}`
    : `Col ${escapeHtml(hold.col_str)}, Row ${escapeHtml(hold.row_str)}`;

  card.innerHTML = `
    <div class="hi-main-row">
      <div class="hi-thumb-wrap" style="border-color:${rInfo.color};">
        ${buildHoldInspectorThumbHtml(hold)}
      </div>
      <div class="hi-info">
        <div class="hi-top-row" style="white-space:nowrap; gap:0.3125rem;">
          <span class="hi-role-tag" style="background:${rInfo.color}; color:${rInfo.textColor || '#fff'};">${rInfo.short} ${state.selectedInspectorIdx + 1}/${total}</span>
          <span class="hi-coord-tension-big" style="white-space:nowrap;">${escapeHtml(hold.col_str)},${escapeHtml(hold.row_str)}</span>
        </div>
        <div class="hi-sub-row">
          <strong>${holdTitle}</strong> (${materialTxt})<br/>
          ${dirTxt}
        </div>
      </div>
    </div>
    <div class="hi-step-btns">
      <button class="btn-hi-step" onclick="stepInspectorHold(-1)">‹ Prev Hold</button>
      <button class="btn-hi-step" onclick="stepInspectorHold(1)">Next Hold ›</button>
    </div>
  `;
}

// ============================================================================
// IN-TAB INSTAGRAM REEL PROXY (/api/ig-video) & UNIFIED REVIEW/COMPARE BETA
// ============================================================================
function extractShortcode(url) {
  const m = String(url || "").match(/instagram\.com\/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : "";
}

function getBetaVideoStreamSrc(b, climbName) {
  if (b.video_src) return b.video_src;
  const sc = b.ig_shortcode || extractShortcode(b.ig_url);
  if (sc) {
    const isCarouselPost = String(b.ig_url || "").includes("/p/");
    const cParam = climbName ? `&climb=${encodeURIComponent(climbName)}` : "";
    const pParam = isCarouselPost ? "&post=1" : "";
    return `/api/ig-video?shortcode=${encodeURIComponent(sc)}${cParam}${pParam}`;
  }
  return "";
}

function formatClipOptionLabel(p) {
  const t = String(p?.title || "").trim();
  const handle = p?.climber || `@${getPrimaryUser()}`;
  if (/^(send|attempt\b)/i.test(t)) {
    return `${t} (${handle})`;
  }
  return `${p?.climber || "@climber"} — ${t}`;
}

function formatClipBadgeLabel(p, fallback = "Video") {
  if (!p) return fallback;
  const t = String(p.title || "").trim();
  const handle = p.climber || `@${getPrimaryUser()}`;
  if (/^(send|attempt\b)/i.test(t)) {
    return `${t} · ${handle}`;
  }
  return p.climber || fallback;
}

function renderBetaAndComparator() {
  const c = state.activeClimb;
  if (!c) return;
  const ang = getActiveAngle();

  document.getElementById("beta-climb-title")?.replaceChildren(`${c.n} (${c.g})`);
  document.getElementById("cmp-climb-title")?.replaceChildren(`${c.n} (${c.g} @ ${ang}°)`);

  const climbBetas = state.betaByClimb[c.u] || [];
  const playableBetas = climbBetas
    .map((b, i) => ({
      id: b.id || `beta_${i}`,
      climber: b.climber || "@climber",
      title: b.title || `${b.angle || ang}° Beta (${b.grade || c.g})`,
      is_mine: Boolean(b.is_mine),
      session_status: b.session_status || "",
      notes: b.notes || "",
      video_src: getBetaVideoStreamSrc(b, c.n),
      shortcode: b.ig_shortcode || extractShortcode(b.ig_url) || "",
      is_ig: Boolean(b.ig_shortcode || extractShortcode(b.ig_url)),
    }))
    .filter(b => Boolean(b.video_src));

  const playable = [
    ...state.localCompareClips,
    ...playableBetas,
  ];

  state.currentPlayableClips = playable;

  // Automatically default to 1-Video Review mode when there is only 1 beta video, and Side-by-Side when there are >= 2!
  if (playable.length <= 1) {
    state.compareLayout = "single";
  } else if (state.compareLayout === "single") {
    state.compareLayout = "sbs";
  }

  const selA = document.getElementById("select-video-a");
  const selB = document.getElementById("select-video-b");
  if (selA && selB) {
    if (playable.length === 0) {
      selA.innerHTML = `<option value="0">No beta clips yet</option>`;
      selB.innerHTML = `<option value="0">No beta clips yet</option>`;
    } else {
      const opts = playable.map((p, i) => `<option value="${i}">${escapeHtml(formatClipOptionLabel(p))}</option>`).join("");
      selA.innerHTML = opts;
      selB.innerHTML = opts;
      selA.value = "0";
      selB.value = playable.length > 1 ? "1" : "0";
      applySelectedCompareVideos();
    }
  }

  setCompareLayout(state.compareLayout);
}

function loadLocalCompareFile(slot, evt) {
  const file = evt.target.files?.[0];
  if (!file) return;
  const objUrl = URL.createObjectURL(file);
  const clip = {
    id: `local_${Date.now()}`,
    climber: "Local Video",
    title: file.name,
    video_src: objUrl,
    shortcode: `local_${file.name}`,
  };
  state.localCompareClips.unshift(clip);
  if ((state.currentPlayableClips?.length || 0) >= 1) {
    state.compareLayout = "sbs";
  }
  renderHeaderActiveClimb();
  renderBetaAndComparator();
  if (slot === "a") {
    document.getElementById("select-video-a").value = "0";
  } else {
    document.getElementById("select-video-b").value = "0";
  }
  applySelectedCompareVideos();
  showToast(`Loaded ${file.name} into Video ${slot.toUpperCase()}!`);
}

function onSelectCompareVideo() {
  applySelectedCompareVideos();
}

function getActiveClipPair() {
  const playable = state.currentPlayableClips || [];
  const idxA = Number(document.getElementById("select-video-a")?.value || 0);
  const idxB = Number(document.getElementById("select-video-b")?.value || 0);
  return {
    clipA: playable[idxA] || playable[0] || null,
    clipB: playable[idxB] || playable[0] || null,
    idxA,
    idxB,
  };
}

function applySelectedCompareVideos() {
  const { clipA, clipB } = getActiveClipPair();

  const vidA = document.getElementById("video-player-a");
  const vidB = document.getElementById("video-player-b");
  const wasPlaying = Boolean(state.syncPlaying || (vidA && !vidA.paused));

  if (vidA && clipA) {
    if (vidA.getAttribute("src") !== clipA.video_src) {
      vidA.src = clipA.video_src;
    }
    const lblA = formatClipBadgeLabel(clipA, "Video A");
    document.getElementById("tag-video-a")?.replaceChildren(lblA);
  }
  if (vidB && clipB) {
    if (vidB.getAttribute("src") !== clipB.video_src) {
      vidB.src = clipB.video_src;
    }
    const lblB = formatClipBadgeLabel(clipB, "Video B");
    document.getElementById("tag-video-b")?.replaceChildren(lblB);
  }
  const tNow = vidA?.currentTime || 0;
  syncVideoBFromTimeA(tNow, true);
  if (wasPlaying) {
    if (vidA) vidA.play().catch(() => {});
    if (vidB && state.compareLayout !== "single") vidB.play().catch(() => {});
  }
}

function setCompareLayout(mode) {
  state.compareLayout = mode;
  document.querySelectorAll(".cmp-mode-btn[data-cmpmode]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.cmpmode === mode);
  });
  const stage = document.getElementById("compare-stage");
  if (stage) stage.className = `compare-stage mode-${mode}`;
  const selGrid = document.getElementById("compare-selectors-grid");
  if (selGrid) selGrid.classList.toggle("single-mode", mode === "single");
  const slotBSelector = document.getElementById("cmp-select-box-b");
  if (slotBSelector) {
    slotBSelector.style.display = mode === "single" ? "none" : "flex";
  }
  const slotB = document.getElementById("slot-video-b");
  if (slotB) {
    slotB.style.display = mode === "single" ? "none" : "flex";
    slotB.style.opacity = mode === "overlay" ? String(state.overlayAlpha) : "1";
  }
  const alphaRow = document.getElementById("overlay-alpha-row");
  if (alphaRow) alphaRow.style.display = mode === "overlay" ? "flex" : "none";
  const offsetCtrl = document.getElementById("sync-offset-ctrl-box");
  if (offsetCtrl) offsetCtrl.style.display = mode === "single" ? "none" : "flex";
}

function updateOverlayAlpha(val) {
  state.overlayAlpha = Number(val) / 100;
  document.getElementById("overlay-alpha-val")?.replaceChildren(`${val}%`);
  const slotB = document.getElementById("slot-video-b");
  if (slotB && state.compareLayout === "overlay") slotB.style.opacity = String(state.overlayAlpha);
}

// ============================================================================
// SYNCED VIDEO PLAYBACK CONTROLS (1-VIDEO REVIEW / SIDE-BY-SIDE / GHOST OVERLAY)
// ============================================================================
function syncVideoBFromTimeA(tA, forceSeek = false) {
  const vidA = document.getElementById("video-player-a");
  const vidB = document.getElementById("video-player-b");
  if (!vidA || !vidB || state.compareLayout === "single") return;
  const durB = (vidB.duration && isFinite(vidB.duration)) ? vidB.duration : 16.0;
  const targetTB = Math.max(0, Math.min(durB, (tA || 0) + (state.syncOffsetB || 0)));
  if (forceSeek || vidA.paused || Math.abs((vidB.currentTime || 0) - targetTB) > 0.35) {
    vidB.currentTime = targetTB;
  }
  vidB.playbackRate = state.playbackSpeed || 1.0;
  if (!vidA.paused && vidB.paused && vidB.readyState >= 2) {
    vidB.play().catch(() => {});
  }
}

function setupVideoSyncListeners() {
  const vidA = document.getElementById("video-player-a");
  const vidB = document.getElementById("video-player-b");
  if (!vidA || !vidB) return;

  const syncFromVidA = () => {
    const tA = vidA.currentTime || 0;
    const durA = (vidA.duration && isFinite(vidA.duration)) ? vidA.duration : 16.0;
    document.getElementById("time-pill-a")?.replaceChildren(`${tA.toFixed(2)}s`);
    const scrubber = document.getElementById("sync-scrubber");
    if (scrubber) {
      scrubber.max = String(durA.toFixed(2));
      scrubber.value = String(tA.toFixed(2));
    }
    document.getElementById("sync-time-readout")?.replaceChildren(`${tA.toFixed(1)}s / ${durA.toFixed(1)}s`);
    syncVideoBFromTimeA(tA, false);
  };

  vidA.addEventListener("timeupdate", syncFromVidA);
  vidA.addEventListener("seeked", syncFromVidA);
  vidA.addEventListener("loadedmetadata", syncFromVidA);

  vidB.addEventListener("timeupdate", () => {
    const tB = vidB.currentTime || 0;
    document.getElementById("time-pill-b")?.replaceChildren(`${tB.toFixed(2)}s`);
  });
}

function toggleSyncPlay() {
  const vidA = document.getElementById("video-player-a");
  const vidB = document.getElementById("video-player-b");
  const btn = document.getElementById("btn-sync-play");
  if (!vidA || !vidB) return;

  if (vidA.paused) {
    vidA.playbackRate = state.playbackSpeed;
    syncVideoBFromTimeA(vidA.currentTime || 0, true);
    vidA.play().catch(() => {});
    if (state.compareLayout !== "single") {
      vidB.play().catch(() => {});
    }
    state.syncPlaying = true;
    if (btn) btn.textContent = "⏸ Pause";
  } else {
    vidA.pause();
    vidB.pause();
    state.syncPlaying = false;
    if (btn) btn.textContent = "▶ Play Sync";
  }
}

function stepFrames(frameDelta) {
  const vidA = document.getElementById("video-player-a");
  const vidB = document.getElementById("video-player-b");
  const btn = document.getElementById("btn-sync-play");
  if (!vidA || !vidB) return;
  vidA.pause();
  vidB.pause();
  state.syncPlaying = false;
  if (btn) btn.textContent = "▶ Play Sync";

  const dt = frameDelta * 0.05;
  const durA = vidA.duration || 16.1;
  const nextA = Math.max(0, Math.min(durA, vidA.currentTime + dt));
  vidA.currentTime = nextA;
  syncVideoBFromTimeA(nextA, true);
}

function restartSyncVideos() {
  const vidA = document.getElementById("video-player-a");
  const vidB = document.getElementById("video-player-b");
  if (!vidA || !vidB) return;
  vidA.currentTime = 0;
  syncVideoBFromTimeA(0, true);
}

function scrubSyncVideos(val) {
  const vidA = document.getElementById("video-player-a");
  const vidB = document.getElementById("video-player-b");
  if (!vidA || !vidB) return;
  const t = Number(val);
  vidA.currentTime = t;
  syncVideoBFromTimeA(t, true);
}

function setPlaybackSpeed(spd) {
  state.playbackSpeed = spd;
  document.querySelectorAll(".spd-btn[data-spd]").forEach(btn => {
    btn.classList.toggle("active", Number(btn.dataset.spd) === spd);
  });
  const vidA = document.getElementById("video-player-a");
  const vidB = document.getElementById("video-player-b");
  if (vidA) vidA.playbackRate = spd;
  if (vidB) vidB.playbackRate = spd;
}

function updateSyncOffset(val) {
  state.syncOffsetB = Number(val);
  const sign = state.syncOffsetB >= 0 ? "+" : "";
  document.getElementById("sync-dt-val")?.replaceChildren(`${sign}${state.syncOffsetB.toFixed(1)}s`);
  const vidA = document.getElementById("video-player-a");
  if (vidA) {
    syncVideoBFromTimeA(vidA.currentTime || 0, true);
  }
}

// ============================================================================
// SESSION VIDEO TRIMMER & AURORA INSTAGRAM CAPTION FORMATTER (UPLOAD TAB)
// ============================================================================
function onTrimSliderChange() {
  const sEl = document.getElementById("slider-trim-start");
  const eEl = document.getElementById("slider-trim-end");
  if (!sEl || !eEl) return;
  let s = Number(sEl.value);
  let e = Number(eEl.value);
  if (e <= s + 0.8) {
    e = Math.min(state.rawDuration, s + 0.8);
    eEl.value = String(e);
  }
  state.trimStart = s;
  state.trimEnd = e;
  document.getElementById("lbl-trim-start")?.replaceChildren(`${s.toFixed(1)}s`);
  document.getElementById("lbl-trim-end")?.replaceChildren(`${e.toFixed(1)}s`);
  document.getElementById("trim-window-badge")?.replaceChildren(
    `Trim: ${s.toFixed(1)}s → ${e.toFixed(1)}s (${(e - s).toFixed(1)}s)`
  );
}

function renderAutoCropCaption() {
  const c = state.activeClimb;
  if (!c) return;
  const ang = getActiveAngle();
  const caption = `"${c.n}" @ ${ang}° on the Tension Board. @tensionclimbing #tensionboard #climbing #bouldering ${c.v}`;
  const box = document.getElementById("ig-caption-box");
  if (box) box.value = caption;

  const dl = document.getElementById("link-download-cropped");
  if (dl) {
    if (state.currentCroppedSrc) {
      dl.style.display = "inline-flex";
      dl.href = state.currentCroppedSrc;
      dl.download = `${c.n.replace(/[^A-Za-z0-9]+/g, "_")}_${ang}deg_${c.v}.mp4`;
    } else {
      dl.style.display = "none";
    }
  }
}

async function handleVideoUpload(evt) {
  if (state.isStaticDemo) {
    showStaticDemoNotice("Uploading & trimming videos");
    return;
  }
  const file = evt.target.files?.[0];
  if (!file) return;
  showToast("📹 Uploading & trimming session clip with ffmpeg...");
  const reader = new FileReader();
  reader.onload = async () => {
    await executeAutoCropRequest(reader.result, null, null, true);
  };
  reader.readAsDataURL(file);
}

async function runBackendAutoCrop(saveToClimb = true) {
  if (state.isStaticDemo) {
    showStaticDemoNotice("Trimming videos with ffmpeg");
    return;
  }
  if (!state.currentRawSrc) {
    showToast("Upload a raw session video first!");
    return;
  }
  showToast("✂️ Trimming active climb clip with ffmpeg & adding to Beta...");
  await executeAutoCropRequest("", state.trimStart, state.trimEnd, saveToClimb);
}

async function executeAutoCropRequest(videoBase64, trimStart, trimEnd, saveToClimb = false) {
  const c = state.activeClimb;
  if (!c) {
    showToast("Select a climb first!");
    return;
  }
  const ang = getActiveAngle();
  try {
    const res = await fetch("/api/upload-video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        climb_uuid: c.u,
        climb_name: c.n,
        v_grade: c.g || c.v,
        angle: ang,
        video_base64: videoBase64,
        source_video: state.currentRawSrc,
        trim_start: trimStart,
        trim_end: trimEnd,
        save_to_climb: Boolean(saveToClimb),
      }),
    });
    if (res.ok) {
      const data = await res.json();
      state.rawDuration = data.duration;
      state.trimStart = data.trim_start;
      state.trimEnd = data.trim_end;
      state.currentRawSrc = data.raw_src;
      state.currentCroppedSrc = data.video_src;
      if (data.state) {
        applyServerState(data.state);
      }

      const sEl = document.getElementById("slider-trim-start");
      const eEl = document.getElementById("slider-trim-end");
      if (sEl && eEl) {
        sEl.max = String(state.rawDuration);
        eEl.max = String(state.rawDuration);
        sEl.value = String(state.trimStart);
        eEl.value = String(state.trimEnd);
      }
      onTrimSliderChange();
      renderAutoCropCaption();
      renderHeaderActiveClimb();
      renderClimbList();
      renderBetaAndComparator();
      showToast(`✓ Trimmed ${state.trimStart}s–${state.trimEnd}s & added to ${c.n} Beta!`);
    } else {
      const errData = await res.json().catch(() => ({}));
      showToast(`⚠️ ${errData.error || "Could not process video"}`);
    }
  } catch (e) {
    showToast("⚠️ Network error uploading video.");
  }
}

function copyIgCaption() {
  const box = document.getElementById("ig-caption-box");
  if (!box) return;
  navigator.clipboard?.writeText(box.value);
  showToast("📋 Copied Aurora-compatible Instagram caption!");
}

async function submitNewBetaLink() {
  if (state.isStaticDemo) {
    showStaticDemoNotice("Streaming Instagram beta videos");
    return;
  }
  const c = state.activeClimb;
  if (!c) return;
  const primary = getPrimaryUser();
  const ang = getActiveAngle();
  const igUrl = document.getElementById("input-beta-url")?.value.trim() || "";
  const climber = document.getElementById("input-beta-climber")?.value.trim() || `@${primary}`;
  const title = document.getElementById("input-beta-title")?.value.trim() || `${ang}° Beta Reel`;
  const notes = document.getElementById("input-beta-notes")?.value.trim() || "";
  const caption = `"${c.n}" @ ${ang}° on the Tension Board. @tensionclimbing #tensionboard #climbing #bouldering ${c.v}`;
  const sc = extractShortcode(igUrl);

  const payload = {
    climb_uuid: c.u,
    climber,
    is_mine: climber.replace(/^@/, "").toLowerCase() === primary.toLowerCase(),
    angle: ang,
    grade: c.g,
    title,
    ig_url: igUrl,
    ig_shortcode: sc,
    video_src: sc ? `/api/ig-video?shortcode=${encodeURIComponent(sc)}` : "",
    caption,
    notes,
  };

  try {
    const res = await fetch("/api/beta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = await res.json();
      applyServerState(data.state);
    }
  } catch (e) {
    if (!state.betaByClimb[c.u]) state.betaByClimb[c.u] = [];
    state.betaByClimb[c.u].unshift({ ...payload, id: `local_${Date.now()}` });
  }

  document.getElementById("input-beta-url").value = "";
  document.getElementById("input-beta-title").value = "";
  document.getElementById("input-beta-notes").value = "";
  renderHeaderActiveClimb();
  renderClimbList();
  renderBetaAndComparator();
  showToast(`✓ Attached Instagram Reel to ${c.n} — opening Review / Compare Beta!`);
  setWorkspaceMode("compare");
}

// ============================================================================
// TOP-RIGHT WALL QUICK LOG (SEND/ATTEMPT + GRADE RATING + 1–3 STARS) & ACTIVITY LOGBOOK
// ============================================================================
function setWallQuickLogStatus(st, logIfAlreadyActive = false) {
  const wasAlreadyAttempt = state.wallQuickLogStatus === "attempt" && st === "attempt";
  state.wallQuickLogStatus = st;
  const sentBtn = document.getElementById("btn-wql-sent");
  const attBtn = document.getElementById("btn-wql-attempt");
  const subBtn = document.getElementById("btn-wql-submit");
  const ratingRow = document.getElementById("wql-rating-row");

  if (sentBtn) {
    sentBtn.classList.toggle("active-sent", st === "sent");
    sentBtn.classList.toggle("active", st === "sent");
  }
  if (attBtn) {
    attBtn.classList.toggle("active-attempt", st === "attempt");
    attBtn.classList.toggle("active", st === "attempt");
  }
  if (ratingRow) {
    ratingRow.style.display = st === "sent" ? "flex" : "none";
  }
  if (subBtn) {
    subBtn.textContent = st === "sent" ? "+ Log Send" : "+ Log Attempt";
    subBtn.classList.toggle("mode-sent", st === "sent");
    subBtn.classList.toggle("mode-attempt", st === "attempt");
  }
  if (logIfAlreadyActive && wasAlreadyAttempt) {
    submitWallQuickLog();
  }
}

function adjustWallQuickLogTries(delta) {
  state.wallQuickLogTries = Math.max(1, state.wallQuickLogTries + delta);
  document.getElementById("wql-tries-val")?.replaceChildren(String(state.wallQuickLogTries));
}

function adjustWallQuickLogGrade(delta) {
  const cur = normalizeRatedGrade(state.wallQuickLogRatedGrade || state.activeClimb?.g || "V2");
  const idx = Math.max(0, FULL_GRADE_SCALE.indexOf(cur));
  const nextIdx = Math.max(0, Math.min(FULL_GRADE_SCALE.length - 1, idx + delta));
  state.wallQuickLogRatedGrade = FULL_GRADE_SCALE[nextIdx];
  renderWallQuickLogRatingUI();
}

function setWallQuickLogQuality(stars) {
  state.wallQuickLogQuality = Math.max(1, Math.min(3, Number(stars) || 2));
  renderWallQuickLogRatingUI();
}

function renderWallQuickLogRatingUI() {
  const gradeEl = document.getElementById("wql-grade-val");
  const diffEl = document.getElementById("wql-grade-diff-badge");
  const rated = state.wallQuickLogRatedGrade || state.activeClimb?.g || "V2";
  if (gradeEl) gradeEl.textContent = rated;

  if (diffEl) {
    const diff = getGradeDiffTag(rated, state.activeClimb?.g);
    if (diff) {
      diffEl.style.display = "inline-flex";
      diffEl.textContent = diff.label;
      diffEl.className = `grade-diff-pill ${diff.kind}`;
    } else {
      diffEl.style.display = "none";
    }
  }

  document.querySelectorAll("#wql-stars-picker .star-btn").forEach(btn => {
    btn.classList.toggle("active", Number(btn.dataset.star) <= (state.wallQuickLogQuality || 2));
  });
}

function adjustLogFormGrade(delta) {
  const cur = normalizeRatedGrade(state.logFormRatedGrade || state.activeClimb?.g || "V2");
  const idx = Math.max(0, FULL_GRADE_SCALE.indexOf(cur));
  const nextIdx = Math.max(0, Math.min(FULL_GRADE_SCALE.length - 1, idx + delta));
  state.logFormRatedGrade = FULL_GRADE_SCALE[nextIdx];
  renderLogFormRatingUI();
}

function setLogFormQuality(stars) {
  state.logFormQuality = Math.max(1, Math.min(3, Number(stars) || 2));
  renderLogFormRatingUI();
}

function renderLogFormRatingUI() {
  const gradeEl = document.getElementById("log-rated-grade-val");
  const diffEl = document.getElementById("log-grade-diff-badge");
  const rated = state.logFormRatedGrade || state.activeClimb?.g || "V2";
  if (gradeEl) gradeEl.textContent = rated;

  if (diffEl) {
    const diff = getGradeDiffTag(rated, state.activeClimb?.g);
    if (diff) {
      diffEl.style.display = "inline-flex";
      diffEl.textContent = diff.label;
      diffEl.className = `grade-diff-pill ${diff.kind}`;
    } else {
      diffEl.style.display = "none";
    }
  }

  document.querySelectorAll("#log-stars-picker .star-btn").forEach(btn => {
    btn.classList.toggle("active", Number(btn.dataset.star) <= (state.logFormQuality || 2));
  });
}

function getLocalTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function submitWallQuickLog() {
  const c = state.activeClimb;
  if (!c) return;
  const noteInput = document.getElementById("wql-note-input");
  const notes = noteInput?.value.trim() || "";
  const dateVal = getLocalTodayStr();
  const climber = state.selectedClimber || getPrimaryUser();
  const isSent = state.wallQuickLogStatus === "sent";
  const ratedGrade = isSent ? (state.wallQuickLogRatedGrade || c.g) : "";
  const quality = isSent ? (state.wallQuickLogQuality || 2) : 2;

  const payload = {
    climber,
    climb_uuid: c.u,
    climb_name: c.n,
    setter: c.s,
    angle: getActiveAngle(),
    v_grade: c.v,
    full_grade: c.g,
    rated_grade: ratedGrade,
    quality,
    status: state.wallQuickLogStatus,
    attempts: state.wallQuickLogTries,
    date: dateVal,
    notes,
    push_to_tension: true,
  };

  let pushed = false;
  if (state.isStaticDemo) {
    state.logbook.unshift({ ...payload, id: `log_${Date.now()}`, on_active_board: true });
    saveStaticDemoState();
  } else {
    try {
      const res = await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        applyServerState(data.state);
        pushed = Boolean(data.push?.pushed);
      }
    } catch (e) {
      state.logbook.unshift({ ...payload, id: `log_${Date.now()}` });
    }
  }

  if (noteInput) noteInput.value = "";
  state.wallQuickLogTries = 1;
  document.getElementById("wql-tries-val")?.replaceChildren("1");
  renderHeaderActiveClimb();
  renderClimbList();
  renderLogbookSection();
  const ratingNote = isSent ? ` · ${ratedGrade} ${"★".repeat(quality)}` : "";
  showToast(
    `✓ Logged ${isSent ? 'Send ✅' : 'Attempt ⚡'} (${payload.attempts} ${payload.attempts === 1 ? 'try' : 'tries'}${ratingNote})${notes ? ` — "${notes}"` : ''} on "${c.n}"${pushed ? ' & pushed to Tension!' : '!'}`
  );
}

function setLogFormStatus(st) {
  state.logFormStatus = st;
  document.getElementById("btn-status-sent")?.classList.toggle("active", st === "sent");
  document.getElementById("btn-status-attempt")?.classList.toggle("active", st === "attempt");
  const ratingRow = document.getElementById("log-rating-row");
  if (ratingRow) ratingRow.style.display = st === "sent" ? "flex" : "none";
}

function adjustLogAttempts(delta) {
  state.logFormAttempts = Math.max(1, state.logFormAttempts + delta);
  document.getElementById("log-attempts-val")?.replaceChildren(String(state.logFormAttempts));
}

async function quickLogSend() {
  state.logFormStatus = "sent";
  state.logFormAttempts = 1;
  await submitLogEntry();
}

async function submitLogEntry() {
  const c = state.activeClimb;
  if (!c) return;
  const notes = document.getElementById("log-notes-input")?.value.trim() || "";
  const dateVal = document.getElementById("log-date-input")?.value || getLocalTodayStr();
  const pushToTension = Boolean(document.getElementById("chk-push-tension")?.checked);
  const climber = state.selectedClimber || getPrimaryUser();
  const isSent = state.logFormStatus === "sent";
  const ratedGrade = isSent ? (state.logFormRatedGrade || c.g) : "";
  const quality = isSent ? (state.logFormQuality || 2) : 2;

  const payload = {
    climber,
    climb_uuid: c.u,
    climb_name: c.n,
    setter: c.s,
    angle: getActiveAngle(),
    v_grade: c.v,
    full_grade: c.g,
    rated_grade: ratedGrade,
    quality,
    status: state.logFormStatus,
    attempts: state.logFormAttempts,
    date: dateVal,
    notes,
    push_to_tension: pushToTension,
  };

  let pushed = false;
  if (state.isStaticDemo) {
    state.logbook.unshift({ ...payload, id: `log_${Date.now()}`, on_active_board: true });
    saveStaticDemoState();
  } else {
    try {
      const res = await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        applyServerState(data.state);
        pushed = Boolean(data.push?.pushed);
      }
    } catch (e) {
      state.logbook.unshift({ ...payload, id: `log_${Date.now()}` });
    }
  }

  const notesInput = document.getElementById("log-notes-input");
  if (notesInput) notesInput.value = "";
  renderHeaderActiveClimb();
  renderClimbList();
  renderLogbookSection();
  showToast(
    `✓ Logged ${isSent ? 'Send' : 'Attempt'} on "${c.n}" for @${climber}${pushed ? ' & pushed to Tension App!' : '!'}`
  );
}

function selectWatchlistClimber(username) {
  state.selectedClimber = String(username || getPrimaryUser()).replace(/^@/, "");
  if (!state.watchlist.some(w => w.username.toLowerCase() === state.selectedClimber.toLowerCase())) {
    state.watchlist.push({
      username: state.selectedClimber,
      label: `@${state.selectedClimber}`,
      role: `${getActiveBoardLabel()} Climber`,
      is_me: state.selectedClimber.toLowerCase() === getPrimaryUser().toLowerCase(),
    });
  }
  renderLogbookSection();
}

async function addWatchlistClimber() {
  const input = document.getElementById("input-watch-user");
  const raw = (input?.value || "").trim().replace(/^@/, "");
  if (!raw) {
    showToast("Enter a Tension / Instagram username to track!");
    return;
  }
  try {
    const res = await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add", username: raw, role: "Tracked Climber" }),
    });
    if (res.ok) {
      const data = await res.json();
      applyServerState(data.state);
    }
  } catch (e) {
    state.watchlist.push({ username: raw, label: `@${raw}`, role: "Tracked Climber", is_me: false });
  }
  if (input) input.value = "";
  state.selectedClimber = raw;
  renderLogbookSection();
  showToast(`✓ Added @${raw} to your ${getActiveBoardLabel()} Watchlist!`);
}

async function removeWatchlistClimber(username, evt) {
  if (evt) evt.stopPropagation();
  try {
    const res = await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove", username }),
    });
    if (res.ok) {
      const data = await res.json();
      applyServerState(data.state);
    }
  } catch (e) {
    state.watchlist = state.watchlist.filter(w => w.username.toLowerCase() !== username.toLowerCase());
  }
  if (state.selectedClimber.toLowerCase() === username.toLowerCase()) {
    state.selectedClimber = getPrimaryUser();
  }
  renderLogbookSection();
}

function setLoadChartMetric(metric) {
  state.loadChartMetric = metric;
  document.getElementById("btn-load-pts")?.classList.toggle("active", metric === "points");
  document.getElementById("btn-load-tries")?.classList.toggle("active", metric === "tries");
  renderWeeklyLoadChart();
}

function parseVNumber(vStr) {
  const n = parseInt(String(vStr || "V0").replace(/[^0-9]/g, ""), 10);
  return isNaN(n) ? 0 : n;
}

function computeEntryMechanicalLoad(entry) {
  const vNum = parseVNumber(entry.v_grade);
  const tries = Math.max(1, Number(entry.attempts || 1));
  return tries * (vNum + 1);
}

function getMondayOfDateStr(dateStr) {
  const fallback = getLocalTodayStr();
  const d = new Date(`${dateStr || fallback}T12:00:00Z`);
  if (isNaN(d.getTime())) return getMondayOfDateStr(fallback);
  const day = d.getUTCDay(); // 0 Sun .. 6 Sat
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

function setActivityLayoutScope(scope) {
  state.activityLayoutScope = scope === "all" ? "all" : "active";
  document.getElementById("activity-scope-active")?.classList.toggle("active", state.activityLayoutScope !== "all");
  document.getElementById("activity-scope-all")?.classList.toggle("active", state.activityLayoutScope === "all");
  renderLogbookSection();
}

function getScopedClimberLogs(username) {
  const primaryLower = getPrimaryUser().toLowerCase();
  const uLower = String(username || primaryLower).replace(/^@/, "").toLowerCase();
  const onlyActive = state.activityLayoutScope !== "all";
  return state.logbook.filter(l => {
    if ((l.climber || primaryLower).toLowerCase() !== uLower) return false;
    if (onlyActive && !isLogOnActiveBoard(l)) return false;
    return true;
  });
}

function renderWeeklyLoadChart() {
  const chartEl = document.getElementById("weekly-load-chart");
  const bannerEl = document.getElementById("acwr-status-banner");
  if (!chartEl || !bannerEl) return;

  const climber = state.selectedClimber || getPrimaryUser();
  const boardLabel = getActiveBoardLabel();
  const entries = getScopedClimberLogs(climber);

  // Anchor the rightmost week to the current week (or latest logged date if newer)
  let latestMonday = getMondayOfDateStr(getLocalTodayStr());
  for (const e of entries) {
    const m = getMondayOfDateStr(e.date);
    if (m > latestMonday) latestMonday = m;
  }

  // Build 8 weekly buckets ending at latestMonday
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const wkStart = new Date(latestMonday.getTime() - i * 7 * 86400000);
    const key = wkStart.toISOString().slice(0, 10);
    const mo = wkStart.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
    const da = wkStart.getUTCDate();
    weeks.push({
      key,
      label: i === 0 ? `This Wk (${mo} ${da})` : `${mo} ${da}`,
      isCurrent: i === 0,
      pts: { v0: 0, v2: 0, v4: 0, v6: 0, total: 0 },
      tries: { v0: 0, v2: 0, v4: 0, v6: 0, total: 0 },
    });
  }
  const wkByKey = Object.fromEntries(weeks.map(w => [w.key, w]));

  for (const e of entries) {
    const mKey = getMondayOfDateStr(e.date).toISOString().slice(0, 10);
    const wk = wkByKey[mKey];
    if (!wk) continue;
    const vNum = parseVNumber(e.v_grade);
    const tries = Math.max(1, Number(e.attempts || 1));
    const loadPts = computeEntryMechanicalLoad(e);
    const zone = vNum <= 1 ? "v0" : (vNum <= 3 ? "v2" : (vNum <= 5 ? "v4" : "v6"));
    wk.pts[zone] += loadPts;
    wk.pts.total = Math.round((wk.pts.total + loadPts) * 10) / 10;
    wk.tries[zone] += tries;
    wk.tries.total += tries;
  }

  const metricKey = state.loadChartMetric === "tries" ? "tries" : "pts";
  const unit = metricKey === "tries" ? "tries" : "pts";

  const acuteLoad = weeks[7][metricKey].total;
  const prior4 = weeks.slice(3, 7).map(w => w[metricKey].total).filter(v => v > 0);
  const starterBaseline = metricKey === "tries" ? 12 : 25;
  const chronicLoad = prior4.length > 0
    ? prior4.reduce((a, b) => a + b, 0) / prior4.length
    : starterBaseline;
  const safeCeiling = Math.round(chronicLoad * 1.3 * 10) / 10;
  const acwr = chronicLoad > 0 ? acuteLoad / chronicLoad : 1.0;

  let statusClass = "sweet-spot";
  let statusIcon = "🟢";
  let statusTitle = "Safe Progression Zone (Sweet Spot)";
  let statusAdvice = `Current week (${acuteLoad} ${unit}) is right inside your safe tendon adaptation budget (≤ ${safeCeiling} ${unit}/wk).`;

  if (prior4.length === 0 && acuteLoad > 0 && acuteLoad <= safeCeiling) {
    statusClass = "sweet-spot";
    statusIcon = "🟢";
    statusTitle = "Week 1 Baseline Session Logged (Safe Ramp)";
    statusAdvice = `Your first ${boardLabel} session (${acuteLoad} ${unit}) sets a healthy baseline. Keep Week 1 total under ~${safeCeiling} ${unit} to protect finger pulleys.`;
  } else if (acwr > 1.35) {
    statusClass = "spike-warn";
    statusIcon = "🔴";
    statusTitle = "High Weekly Load Spike (> 1.35× Chronic Baseline)";
    statusAdvice = `This week (${acuteLoad} ${unit}) exceeds the 1.3× safe ramp ceiling (${safeCeiling} ${unit}). Consider a deload or feet-on V0–V1 session next.`;
  } else if (acuteLoad === 0) {
    statusClass = "building";
    statusIcon = "🔵";
    statusTitle = `No ${boardLabel} Sessions Logged Yet for @${climber}`;
    statusAdvice = `Log a send/attempt below or click "🔗 Manage Accounts" to pull @${climber}'s Tension history.`;
  }

  bannerEl.className = `acwr-banner ${statusClass}`;
  bannerEl.innerHTML = `
    <div>
      <strong>${statusIcon} ${escapeHtml(statusTitle)}</strong>
      <div style="font-size:0.6875rem; opacity:0.9; margin-top:0.125rem;">${escapeHtml(statusAdvice)}</div>
    </div>
    <span class="acwr-badge-pill">ACWR: ${acwr.toFixed(2)}× · Ceiling: ${safeCeiling} ${unit}</span>
  `;

  const maxVal = Math.max(...weeks.map(w => w[metricKey].total), safeCeiling * 1.15, 10);
  const ceilingBottomPct = Math.min(88, Math.max(15, Math.round((safeCeiling / maxVal) * 100)));

  chartEl.innerHTML = `
    <div class="safe-ceiling-line" style="bottom:${ceilingBottomPct}%;">
      <span class="safe-ceiling-lbl">Safe 1.3× Ramp Ceiling (${safeCeiling} ${unit})</span>
    </div>
    ${weeks.map(w => {
      const m = w[metricKey];
      const tot = m.total;
      const barH = tot > 0 ? Math.max(10, Math.round((tot / maxVal) * 105)) : 4;
      const p0 = tot > 0 ? (m.v0 / tot) * 100 : 0;
      const p2 = tot > 0 ? (m.v2 / tot) * 100 : 0;
      const p4 = tot > 0 ? (m.v4 / tot) * 100 : 0;
      const p6 = tot > 0 ? (m.v6 / tot) * 100 : 0;
      return `
        <div class="wlc-col ${w.isCurrent ? 'current-wk' : ''}">
          <span class="wlc-val">${tot > 0 ? tot : ''}</span>
          <div class="wlc-bar-stack" style="height:${barH}px;" title="${w.label}: ${tot} ${unit}">
            <div class="wlc-seg z-v0" style="height:${p0}%;"></div>
            <div class="wlc-seg z-v2" style="height:${p2}%;"></div>
            <div class="wlc-seg z-v4" style="height:${p4}%;"></div>
            <div class="wlc-seg z-v6" style="height:${p6}%;"></div>
          </div>
          <span class="wlc-lbl">${w.label}</span>
        </div>
      `;
    }).join("")}
  `;
}

function getClimberBoardStats(username) {
  const uLower = String(username || "").replace(/^@/, "").toLowerCase();
  const logs = getScopedClimberLogs(username);
  const sends = logs.filter(l => l.status === "sent");
  const totalTries = logs.reduce((acc, l) => acc + (l.attempts || 1), 0);

  const setClimbs = state.climbs.filter(c => c.s.toLowerCase() === uLower);

  const topFaList = state.leaderboardData.top_fa || state.leaderboardData.top_fa_10x8 || [];
  const faRow = topFaList.find(r => r.username.toLowerCase() === uLower);
  const faCount = faRow
    ? (faRow.fa_nearby ?? faRow.fa_40_50 ?? faRow.fa_count_40_50 ?? 0)
    : setClimbs.filter(c => getClimbTargetAscents(c) + getClimbNearbyAscents(c) > 0).length;

  const betaReels = [];
  for (const [cu, arr] of Object.entries(state.betaByClimb)) {
    for (const b of arr) {
      if (String(b.climber || "").replace(/^@/, "").toLowerCase() === uLower) {
        const cl = state.climbsByUuid[cu] || state.climbsByUuid[cu.toLowerCase()];
        betaReels.push({ ...b, climb: cl });
      }
    }
  }

  return { username: String(username || "").replace(/^@/, ""), logs, sends, totalTries, setClimbs, faCount, betaReels };
}

function renderWatchlistBar() {
  const container = document.getElementById("watchlist-pills-container");
  if (!container) return;

  const boardLabel = getActiveBoardLabel();
  const ang = getActiveAngle();
  const primary = getPrimaryUser();
  const list = (state.watchlist && state.watchlist.length > 0)
    ? state.watchlist
    : [{ username: primary, label: `@${primary}`, role: `${boardLabel} @ ${ang}°`, is_me: true }];

  container.innerHTML = list.map(w => {
    const isSelected = w.username.toLowerCase() === (state.selectedClimber || primary).toLowerCase();
    const st = getClimberBoardStats(w.username);
    const loadPts = st.logs.reduce((acc, e) => acc + computeEntryMechanicalLoad(e), 0);
    const statTxt = `${st.sends.length} Sends · ${st.totalTries} Tries · ${loadPts} pts`;
    const roleLabel = w.is_me
      ? `${boardLabel} @ ${ang}°`
      : (w.role || "Tracked Climber");
    return `
      <div class="wl-card ${isSelected ? 'active' : ''}" onclick="selectWatchlistClimber('${escapeHtml(w.username)}')">
        <div class="wl-card-left">
          <div class="wl-avatar">${w.is_me ? '👑' : '🧗'}</div>
          <div>
            <div class="wl-user-name">@${escapeHtml(w.username)}</div>
            <div class="wl-user-role">${escapeHtml(roleLabel)}</div>
          </div>
        </div>
        <div class="wl-card-right">
          <span class="wl-stat-badge">${statTxt}</span>
          ${!w.is_me ? `<span class="wl-rm" title="Remove from watchlist" onclick="removeWatchlistClimber('${escapeHtml(w.username)}', event)">✕</span>` : ''}
        </div>
      </div>
    `;
  }).join("");
}

function setLeaderboardTab(tab) {
  state.leaderboardTab = tab;
  document.querySelectorAll(".lb-tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.lbtab === tab);
  });
  renderLeaderboardTable();
}

function renderLeaderboardTable() {
  const wrap = document.getElementById("leaderboard-table-wrap");
  if (!wrap) return;
  const tab = state.leaderboardTab;
  const boardLabel = getActiveBoardLabel();
  const ang = getActiveAngle();
  const rangeTxt = getAngleRangeText();
  const selectedLower = (state.selectedClimber || getPrimaryUser()).toLowerCase();

  if (tab === "crew") {
    const baseList = (state.watchlist && state.watchlist.length > 0)
      ? state.watchlist
      : [{ username: getPrimaryUser(), role: `${boardLabel} @ ${ang}°` }];
    const crewRows = baseList.map(w => {
      const st = getClimberBoardStats(w.username);
      const loadPts = st.logs.reduce((acc, e) => acc + computeEntryMechanicalLoad(e), 0);
      return {
        username: w.username,
        role: w.role,
        sends: st.sends.length,
        tries: st.totalTries,
        loadPts: Math.round(loadPts * 10) / 10,
        faCount: st.faCount,
        setCount: st.setClimbs.length,
        betaCount: st.betaReels.length,
      };
    }).sort((a, b) => b.sends - a.sends || b.betaCount - a.betaCount || b.faCount - a.faCount);

    wrap.innerHTML = crewRows.map((r, i) => {
      const isAct = r.username.toLowerCase() === selectedLower;
      return `
        <div class="lb-row ${isAct ? 'active-climber' : ''}" onclick="selectWatchlistClimber('${escapeHtml(r.username)}')">
          <div class="lb-left">
            <span class="lb-rank ${i < 3 ? 'top-3' : ''}">${i + 1}</span>
            <div>
              <div class="lb-user">@${escapeHtml(r.username)}</div>
              <div class="lb-meta">${r.sends} logged sends · ${r.faCount} FAs · ${r.betaCount} IG Reels · ${r.setCount} set</div>
            </div>
          </div>
          <div class="lb-right">
            <span class="lb-stat-pill">${r.sends > 0 ? `${r.sends} Sends (${r.loadPts} pts)` : (r.betaCount > 0 ? `${r.betaCount} Reels` : `${r.faCount} FAs`)}</span>
          </div>
        </div>
      `;
    }).join("");
    return;
  }

  if (tab === "fa") {
    const rows = state.leaderboardData.top_fa || state.leaderboardData.top_fa_10x8 || [];
    wrap.innerHTML = rows.map((r, i) => {
      const isAct = r.username.toLowerCase() === selectedLower;
      const faTgt = r.fa_tgt ?? r.fa_45 ?? r.fa_count_45 ?? 0;
      const faNearby = r.fa_nearby ?? r.fa_40_50 ?? r.fa_count_40_50 ?? 0;
      const latestTxt = Array.isArray(r.latest) ? ` · Latest: "${r.latest[1]}" (${r.latest[2]})` : "";
      return `
        <div class="lb-row ${isAct ? 'active-climber' : ''}" onclick="selectWatchlistClimber('${escapeHtml(r.username)}')">
          <div class="lb-left">
            <span class="lb-rank ${i < 3 ? 'top-3' : ''}">${i + 1}</span>
            <div>
              <div class="lb-user">@${escapeHtml(r.username)}</div>
              <div class="lb-meta">${faTgt} FAs @ ${ang}° · ${faNearby} FAs @ ${rangeTxt}${escapeHtml(latestTxt)}</div>
            </div>
          </div>
          <div class="lb-right">
            <span class="lb-stat-pill">⚡ ${faNearby} FAs</span>
          </div>
        </div>
      `;
    }).join("") || `<div class="muted-hint" style="padding:0.75rem;">No FA leaderboard rows yet for ${escapeHtml(boardLabel)}.</div>`;
    return;
  }

  if (tab === "beta") {
    const rows = state.leaderboardData.top_beta || state.leaderboardData.top_beta_10x8 || [];
    wrap.innerHTML = rows.map((r, i) => {
      const isAct = r.username.toLowerCase() === selectedLower;
      const cnt = r.reels_count ?? r.beta_reels ?? 0;
      return `
        <div class="lb-row ${isAct ? 'active-climber' : ''}" onclick="selectWatchlistClimber('${escapeHtml(r.username)}')">
          <div class="lb-left">
            <span class="lb-rank ${i < 3 ? 'top-3' : ''}">${i + 1}</span>
            <div>
              <div class="lb-user">@${escapeHtml(r.username)}</div>
              <div class="lb-meta">Instagram Beta Reels on ${escapeHtml(boardLabel)} climbs</div>
            </div>
          </div>
          <div class="lb-right">
            <span class="lb-stat-pill">🎬 ${cnt} Reels</span>
          </div>
        </div>
      `;
    }).join("") || `<div class="muted-hint" style="padding:0.75rem;">Attach Instagram Reels or import beta links to populate the ${escapeHtml(boardLabel)} beta leaderboard.</div>`;
    return;
  }

  if (tab === "setters") {
    const rows = state.leaderboardData.top_setters || state.leaderboardData.top_setters_10x8 || [];
    wrap.innerHTML = rows.map((r, i) => {
      const isAct = r.username.toLowerCase() === selectedLower;
      const cCnt = r.climbs_count ?? r.climbs_set ?? 0;
      const topTxt = Array.isArray(r.top_climb) ? ` · Top: "${r.top_climb[0]}" (${r.top_climb[2]})` : "";
      return `
        <div class="lb-row ${isAct ? 'active-climber' : ''}" onclick="selectWatchlistClimber('${escapeHtml(r.username)}')">
          <div class="lb-left">
            <span class="lb-rank ${i < 3 ? 'top-3' : ''}">${i + 1}</span>
            <div>
              <div class="lb-user">@${escapeHtml(r.username)}</div>
              <div class="lb-meta">${cCnt} climbs set on ${escapeHtml(boardLabel)}${escapeHtml(topTxt)}</div>
            </div>
          </div>
          <div class="lb-right">
            <span class="lb-stat-pill">🛠️ ${(r.total_ascents || 0).toLocaleString()} asc</span>
          </div>
        </div>
      `;
    }).join("") || `<div class="muted-hint" style="padding:0.75rem;">No setters found for ${escapeHtml(boardLabel)}.</div>`;
  }
}

function setPyramidMinAscents(minAsc) {
  state.pyramidMinAscents = Number(minAsc) || 1;
  document.getElementById("btn-pyr-min1")?.classList.toggle("active", state.pyramidMinAscents === 1);
  document.getElementById("btn-pyr-min5")?.classList.toggle("active", state.pyramidMinAscents === 5);
  renderLogbookSection();
}

function startEditLogEntry(logId, evt) {
  if (evt) evt.stopPropagation();
  const isClosing = state.editingLogId === logId;
  state.editingLogId = isClosing ? null : logId;
  if (!isClosing) {
    const entry = state.logbook.find(l => l.id === logId);
    state.editLogQuality = Math.max(1, Math.min(3, Number(entry?.quality || 2)));
  }
  renderLogbookSection();
  if (!isClosing) {
    setTimeout(() => {
      const ta = document.getElementById(`edit-log-notes-${logId}`);
      if (ta) {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }
    }, 20);
  }
}

function setEditLogQuality(logId, stars, evt) {
  if (evt) evt.stopPropagation();
  state.editLogQuality = Math.max(1, Math.min(3, Number(stars) || 2));
  document.querySelectorAll(`#edit-log-stars-${CSS.escape(logId)} .star-btn`).forEach(btn => {
    btn.classList.toggle("active", Number(btn.dataset.star) <= state.editLogQuality);
  });
}

function onEditLogStatusChange(logId, statusVal) {
  const grp = document.getElementById(`edit-log-rating-grp-${logId}`);
  if (grp) grp.style.display = statusVal === "sent" ? "inline-flex" : "none";
}

function cancelEditLogEntry(evt) {
  if (evt) evt.stopPropagation();
  state.editingLogId = null;
  renderLogbookSection();
}

async function saveEditedLogEntry(logId, evt) {
  if (evt) evt.stopPropagation();
  const notesEl = document.getElementById(`edit-log-notes-${logId}`);
  const triesEl = document.getElementById(`edit-log-tries-${logId}`);
  const statusEl = document.getElementById(`edit-log-status-${logId}`);
  const gradeEl = document.getElementById(`edit-log-rated-grade-${logId}`);
  const notes = notesEl ? notesEl.value.trim() : "";
  const attempts = Math.max(1, parseInt(triesEl?.value || "1", 10) || 1);
  const status = statusEl?.value === "attempt" ? "attempt" : "sent";
  const rated_grade = status === "sent" ? (gradeEl?.value || "") : "";
  const quality = status === "sent" ? (state.editLogQuality || 2) : 2;

  try {
    const res = await fetch("/api/log/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        log_id: logId,
        notes,
        attempts,
        status,
        rated_grade,
        quality,
        push_to_tension: true,
      }),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      state.editingLogId = null;
      applyServerState(data.state);
      renderHeaderActiveClimb();
      renderClimbList();
      renderLogbookSection();
      showToast(data.push?.pushed ? "✓ Updated log & synced to Tension!" : "✓ Saved activity log update!");
      return;
    }
    showToast(`⚠️ ${data.error || "Could not update log entry"}`);
  } catch (e) {
    showToast("⚠️ Network error saving log update");
  }
}

function renderLogbookSection() {
  const c = state.activeClimb;
  if (c) {
    document.getElementById("log-climb-name-lbl")?.replaceChildren(c.n);
    const gl = document.getElementById("log-climb-grade-lbl");
    if (gl) {
      gl.textContent = c.g;
      gl.className = `grade-pill ${(c.v || "v0").toLowerCase()}`;
    }
  }

  const primary = getPrimaryUser();
  const climber = state.selectedClimber || primary;
  const boardLabel = getActiveBoardLabel();
  const rangeTxt = getAngleRangeText();
  const ang = getActiveAngle();

  document.getElementById("lbl-log-climber")?.replaceChildren(`@${climber}`);
  document.getElementById("pyr-climber-lbl")?.replaceChildren(`@${climber}`);
  document.getElementById("pyr-mine-user")?.replaceChildren(`@${climber}`);

  renderWatchlistBar();
  renderWeeklyLoadChart();
  renderLeaderboardTable();

  const st = getClimberBoardStats(climber);
  const hdrEl = document.getElementById("selected-climber-header");
  if (hdrEl) {
    const isPrimary = climber.toLowerCase() === primary.toLowerCase();
    hdrEl.innerHTML = `
      <div>
        <div class="sch-title">${isPrimary ? `👑 Your ${escapeHtml(boardLabel)} Logbook & Activity (@${escapeHtml(climber)})` : `🧗 @${escapeHtml(climber)} — ${escapeHtml(boardLabel)} Profile & Activity`}</div>
        <div class="sch-sub">
          ${st.sends.length} logged sends · ${st.totalTries} tries · ${st.faCount} FAs on ${escapeHtml(boardLabel)} · ${st.setClimbs.length} climbs set · ${st.betaReels.length} IG Beta Reels
        </div>
      </div>
      <button class="btn-xs-ghost" onclick="openAuroraSyncModal('${escapeHtml(climber)}')">🔗 Sync @${escapeHtml(climber)}</button>
    `;
  }

  const statsGrid = document.getElementById("logbook-stats-grid");
  if (statsGrid) {
    statsGrid.innerHTML = `
      <div class="stat-box">
        <div class="stat-val">${st.sends.length}</div>
        <div class="stat-lbl">Logged Sends</div>
      </div>
      <div class="stat-box">
        <div class="stat-val">${st.faCount || st.setClimbs.length}</div>
        <div class="stat-lbl">${escapeHtml(boardLabel)} FAs / Set</div>
      </div>
      <div class="stat-box">
        <div class="stat-val">${st.betaReels.length}</div>
        <div class="stat-lbl">${escapeHtml(boardLabel)} IG Reels</div>
      </div>
    `;
  }

  // Dual Grade Pyramid for selected climber
  const pyrMineEl = document.getElementById("grade-pyramid-mine");
  const pyrCatEl = document.getElementById("grade-pyramid-bars");

  if (pyrMineEl || pyrCatEl) {
    const grades = ["V0", "V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8", "V9", "V10"];
    const catCounts = {};
    const sentCounts = {};
    const sentUniqueSetByGrade = {};
    for (const g of grades) {
      catCounts[g] = 0;
      sentCounts[g] = 0;
      sentUniqueSetByGrade[g] = new Set();
    }

    const minAsc = state.pyramidMinAscents || 1;
    document.getElementById("btn-pyr-min1")?.classList.toggle("active", minAsc === 1);
    document.getElementById("btn-pyr-min5")?.classList.toggle("active", minAsc === 5);
    const catTitleEl = document.getElementById("pyr-cat-title-lbl");
    if (catTitleEl) {
      catTitleEl.textContent = `🌐 ${boardLabel} Catalog Coverage (≥${minAsc} ${minAsc === 1 ? "Send" : "Sends"} @ ${rangeTxt})`;
    }
    const catSubEl = document.getElementById("pyr-cat-sub-lbl");
    if (catSubEl) {
      catSubEl.textContent = minAsc >= 5
        ? `Filtered to established climbs with 5+ ascents at ${rangeTxt} — hides 1–4 send outliers.`
        : `Excludes 0-send climbs — shows how many you've done out of all ${boardLabel} climbs with ≥1 ascent at ${rangeTxt}.`;
    }

    const qualifyingCatalogUuids = new Set();
    let totalSentCatalogClimbs = 0;
    for (const cl of state.climbs) {
      const sendsNearby = getClimbTargetAscents(cl) + getClimbNearbyAscents(cl);
      if (sendsNearby >= minAsc && cl.v in catCounts) {
        catCounts[cl.v]++;
        totalSentCatalogClimbs++;
        qualifyingCatalogUuids.add(cl.u.toLowerCase());
      }
    }

    for (const s of st.sends) {
      if (s.v_grade in sentCounts) {
        sentCounts[s.v_grade]++;
        const cuLow = (s.climb_uuid || "").toLowerCase();
        if (qualifyingCatalogUuids.has(cuLow) || (minAsc === 1 && !cuLow)) {
          sentUniqueSetByGrade[s.v_grade].add(cuLow || (s.climb_name || "").toLowerCase());
        }
      }
    }

    const totalMySends = Object.values(sentCounts).reduce((a, b) => a + b, 0);
    const totalUniqueDone = Object.values(sentUniqueSetByGrade).reduce((a, set) => a + set.size, 0);

    document.getElementById("pyr-mine-total-lbl")?.replaceChildren(
      `${totalMySends} ${totalMySends === 1 ? 'send' : 'sends'}`
    );
    document.getElementById("pyr-cat-total-lbl")?.replaceChildren(
      `${totalUniqueDone} / ${totalSentCatalogClimbs.toLocaleString()} climbs`
    );

    if (pyrMineEl) {
      const maxSent = Math.max(...Object.values(sentCounts), 1);
      pyrMineEl.innerHTML = grades.map(g => {
        const snt = sentCounts[g] || 0;
        const pct = snt > 0 ? Math.max(12, Math.round((snt / maxSent) * 100)) : 0;
        return `
          <div class="pyr-row" style="cursor:pointer;" onclick="setGradeFilter('${g}'); setWorkspaceMode('wall');">
            <span class="pyr-lbl">${g}</span>
            <div class="pyr-track">
              <div class="pyr-fill" style="width:${pct}%; background:linear-gradient(90deg, #16a34a, #4ade80);"></div>
            </div>
            <span class="pyr-cnt">${snt > 0 ? `<b style="color:#4ade80;">${snt}✓</b>` : '<span style="opacity:0.45;">0</span>'}</span>
          </div>
        `;
      }).join("");
    }

    if (pyrCatEl) {
      const maxCat = Math.max(...Object.values(catCounts), 1);
      pyrCatEl.innerHTML = grades.map(g => {
        const tot = catCounts[g] || 0;
        const done = sentUniqueSetByGrade[g]?.size || 0;
        const catPct = tot > 0 ? Math.max(4, Math.round((tot / maxCat) * 100)) : 0;
        const donePctOfRow = tot > 0 && done > 0 ? Math.max(8, Math.round((done / tot) * 100)) : 0;
        return `
          <div class="pyr-row" style="cursor:pointer;" onclick="setGradeFilter('${g}'); setWorkspaceMode('wall');">
            <span class="pyr-lbl">${g}</span>
            <div class="pyr-track" style="position:relative;">
              <div class="pyr-fill" style="width:${catPct}%; opacity:0.32;"></div>
              ${done > 0 ? `<div style="position:absolute; left:0; top:0; bottom:0; width:${Math.max(4, Math.round((catPct * donePctOfRow) / 100))}%; background:#4ade80; border-radius:0.25rem;"></div>` : ''}
            </div>
            <span class="pyr-cnt" style="width:4.625rem;">${done > 0 ? `<b style="color:#4ade80;">${done}</b> / ` : '0 / '}${tot}</span>
          </div>
        `;
      }).join("");
    }
  }

  // Activity feed
  const listEl = document.getElementById("logbook-entries-list");
  if (listEl) {
    const feedHtml = [];
    const primaryLower = primary.toLowerCase();

    for (const l of st.logs) {
      const loadPts = computeEntryMechanicalLoad(l);
      const isOnBoard = isLogOnActiveBoard(l);
      const layoutLbl = l.layout_name || (isOnBoard ? boardLabel : "Other Layout");
      const badgeCls = isOnBoard ? "spray-10x8" : "mirror-12x8";
      const isMine = (l.climber || primaryLower).toLowerCase() === primaryLower;
      const syncChip = (isMine && state.connectedAccounts.length > 0)
        ? (l.synced_to_tension
            ? `<span style="font-size:0.625rem; font-weight:700; color:#4ade80; background:rgba(34,197,94,0.12); border:1px solid rgba(34,197,94,0.28); padding:1px 0.375rem; border-radius:62.4375rem;">✓ Tension</span>`
            : `<span style="font-size:0.625rem; font-weight:700; color:#fcd34d; background:rgba(245,158,11,0.14); border:1px solid rgba(245,158,11,0.32); padding:1px 0.375rem; border-radius:62.4375rem;">⏳ Pending Push</span>`)
        : "";

      const starBadge = (l.status === "sent" && l.quality)
        ? `<span class="log-star-badge" title="Quality rating">${"★".repeat(Math.max(1, Math.min(3, Number(l.quality))))}</span>`
        : "";
      let ratedBadge = "";
      if (l.status === "sent" && l.rated_grade) {
        const diff = getGradeDiffTag(l.rated_grade, l.full_grade);
        if (diff) {
          ratedBadge = `<span class="grade-diff-pill ${diff.kind} log-rated-badge" title="Personal grade rating vs consensus ${escapeHtml(l.full_grade)}">Rated ${escapeHtml(l.rated_grade)} · ${diff.label}</span>`;
        }
      }

      const isEditing = state.editingLogId === l.id;
      const editBtnHtml = `<button type="button" class="btn-edit-log" onclick="startEditLogEntry('${escapeHtml(l.id)}', event)">${l.notes ? '✏️ Edit' : '+ Edit / Note'}</button>`;
      const currentEditRated = normalizeRatedGrade(l.rated_grade || l.full_grade || "V2");
      const editGradeOpts = FULL_GRADE_SCALE.map(g => `<option value="${g}" ${g === currentEditRated ? "selected" : ""}>${g}</option>`).join("");
      const editQuality = isEditing ? (state.editLogQuality || 2) : (l.quality || 2);

      const editorHtml = isEditing ? `
        <div class="log-inline-editor" onclick="event.stopPropagation()">
          <textarea id="edit-log-notes-${escapeHtml(l.id)}" class="log-edit-textarea" rows="2" placeholder="Add beta cues, crux notes, or how it felt...">${escapeHtml(l.notes || "")}</textarea>
          <div class="log-edit-controls">
            <div class="log-edit-left">
              <select id="edit-log-status-${escapeHtml(l.id)}" class="log-edit-select" onchange="onEditLogStatusChange('${escapeHtml(l.id)}', this.value)">
                <option value="sent" ${l.status === "sent" ? "selected" : ""}>✓ Sent</option>
                <option value="attempt" ${l.status !== "sent" ? "selected" : ""}>⚡ Projecting</option>
              </select>
              <label style="font-size:0.6875rem; color:#cbd5e1; display:inline-flex; align-items:center; gap:0.3125rem;">
                Tries:
                <input id="edit-log-tries-${escapeHtml(l.id)}" type="number" min="1" max="99" value="${l.attempts || 1}" style="width:3.25rem; padding:0.1875rem 0.375rem; font-size:0.71875rem; background:#0f172a; border:1px solid #334155; border-radius:0.375rem; color:#fff;" />
              </label>
              <div id="edit-log-rating-grp-${escapeHtml(l.id)}" class="log-edit-rating-grp" style="display:${l.status === "sent" ? "inline-flex" : "none"};">
                <label style="font-size:0.6875rem; color:#cbd5e1; display:inline-flex; align-items:center; gap:0.25rem;">
                  Grade:
                  <select id="edit-log-rated-grade-${escapeHtml(l.id)}" class="log-edit-select">${editGradeOpts}</select>
                </label>
                <div id="edit-log-stars-${escapeHtml(l.id)}" class="star-picker" title="Quality rating (1–3 stars)">
                  <button type="button" class="star-btn ${1 <= editQuality ? "active" : ""}" data-star="1" onclick="setEditLogQuality('${escapeHtml(l.id)}', 1, event)">★</button>
                  <button type="button" class="star-btn ${2 <= editQuality ? "active" : ""}" data-star="2" onclick="setEditLogQuality('${escapeHtml(l.id)}', 2, event)">★</button>
                  <button type="button" class="star-btn ${3 <= editQuality ? "active" : ""}" data-star="3" onclick="setEditLogQuality('${escapeHtml(l.id)}', 3, event)">★</button>
                </div>
              </div>
            </div>
            <div class="log-edit-btns">
              <button type="button" class="btn-xs-ghost" onclick="cancelEditLogEntry(event)">Cancel</button>
              <button type="button" class="btn-primary-action" style="padding:0.3125rem 0.75rem; font-size:0.71875rem;" onclick="saveEditedLogEntry('${escapeHtml(l.id)}', event)">💾 Save</button>
            </div>
          </div>
        </div>
      ` : "";
      feedHtml.push(`
        <div class="reel-card" style="cursor:pointer;" onclick="${isOnBoard ? `selectClimbByUuid('${l.climb_uuid}', true); setWorkspaceMode('wall');` : `showToast('ℹ️ &quot;${escapeHtml(l.climb_name)}&quot; was logged on ${escapeHtml(layoutLbl)} @ ${l.angle || ang}°')`}">
          <div class="rc-top">
            <span class="rc-climber" style="display:flex; align-items:center; gap:0.375rem; flex-wrap:wrap;">
              <span>${l.status === 'sent' ? '✓ SENT' : '⚡ PROJECTING'} · ${escapeHtml(l.climb_name)} (${escapeHtml(l.full_grade)} @ ${l.angle || ang}°)</span>
              <span class="layout-badge ${badgeCls}">${escapeHtml(layoutLbl)}</span>
              ${starBadge}
              ${ratedBadge}
              ${syncChip}
            </span>
            <span style="display:inline-flex; align-items:center; gap:0.5rem;">
              <span style="font-size:0.65625rem; color:var(--text-muted);">${escapeHtml(l.date)} · ${l.attempts} ${l.attempts === 1 ? 'try' : 'tries'} (${loadPts} load pts)</span>
              ${editBtnHtml}
            </span>
          </div>
          ${(!isEditing && l.notes) ? `<div style="font-size:0.75rem; color:#e2e8f0; margin-top:0.25rem; line-height:1.35;">${escapeHtml(l.notes)}</div>` : ''}
          ${editorHtml}
        </div>
      `);
    }

    for (const b of st.betaReels.slice(0, 12)) {
      const cName = b.climb ? b.climb.n : b.title;
      const cGrade = b.climb ? b.climb.g : b.grade;
      const cUuid = b.climb ? b.climb.u : b.climb_uuid;
      feedHtml.push(`
        <div class="reel-card" style="cursor:pointer;" onclick="openClimbBeta('${cUuid}', event)">
          <div class="rc-top">
            <span class="rc-climber">🎬 IG BETA REEL · ${escapeHtml(cName)} (${escapeHtml(cGrade)})</span>
            <span style="font-size:0.65625rem; color:#fda4af;">@${escapeHtml(climber)} @ ${b.angle || ang}° · Watch Reel →</span>
          </div>
        </div>
      `);
    }

    for (const sc of st.setClimbs.slice(0, 10)) {
      feedHtml.push(`
        <div class="reel-card" style="cursor:pointer;" onclick="selectClimbByUuid('${sc.u}', true); setWorkspaceMode('wall');">
          <div class="rc-top">
            <span class="rc-climber">🛠️ SET ON ${escapeHtml(boardLabel.toUpperCase())} · ${escapeHtml(sc.n)} (${escapeHtml(sc.g)})</span>
            <span style="font-size:0.65625rem; color:var(--text-muted);">${formatAscentSummary(sc)} · ★ ${(sc.q || 3.0).toFixed(1)}</span>
          </div>
        </div>
      `);
    }

    if (feedHtml.length === 0) {
      listEl.innerHTML = `
        <div class="reel-card">
          <div class="rc-top">
            <span class="rc-climber">No ${escapeHtml(boardLabel)} sends logged yet for @${escapeHtml(climber)}</span>
          </div>
          <p class="muted-hint">
            Use the <b>Log Session</b> box above or click <b>🔗 Sync @${escapeHtml(climber)}</b> to pull your Tension Board 2 logbook directly from <code>tensionboardapp2.com</code>!
          </p>
        </div>
      `;
    } else {
      listEl.innerHTML = feedHtml.join("");
    }
  }
}

// ============================================================================
// 2-WAY OFFICIAL TENSION APP SYNC MODAL (tensionboardapp2.com)
// ============================================================================
function updateAuroraConnectionUI() {
  const pill = document.getElementById("aurora-conn-pill");
  const listEl = document.getElementById("connected-accounts-list");
  const settingsBtn = document.getElementById("btn-settings-connect-aurora");
  const accts = state.connectedAccounts || [];
  const primaryLower = getPrimaryUser().toLowerCase();

  if (pill) {
    if (accts.length > 0) {
      const pendingCnt = (state.logbook || []).filter(
        l => (l.climber || primaryLower).toLowerCase() === primaryLower && !l.synced_to_tension
      ).length;
      const pendingSuffix = pendingCnt > 0 ? ` · ${pendingCnt} pending push` : " · All synced";
      pill.textContent = `✓ Connected: ${accts.map(a => '@' + a.username).join(', ')}${pendingSuffix}`;
      pill.classList.add("connected");
    } else {
      pill.textContent = "Ready to Connect";
      pill.classList.remove("connected");
    }
  }

  if (settingsBtn) {
    settingsBtn.textContent = accts.length > 0
      ? `🔗 Manage Tension Accounts (${accts.map(a => '@' + a.username).join(', ')})`
      : "🔗 Connect / Manage Tension Board 2 Accounts";
  }

  if (listEl) {
    if (accts.length === 0) {
      listEl.innerHTML = "";
    } else {
      listEl.innerHTML = accts.map(a => `
        <div class="reel-card" style="padding:0.5rem 0.625rem;">
          <div class="rc-top">
            <span style="font-size:0.75rem; font-weight:800; color:#4ade80;">✓ Connected as @${escapeHtml(a.username)} (User ID: ${escapeHtml(a.user_id)})</span>
            <span style="display:inline-flex; align-items:center; gap:0.5rem;">
              <span style="font-size:0.65625rem; color:var(--text-muted);">Last sync: ${escapeHtml(a.last_sync || 'Just now')}</span>
              <button type="button" class="btn-disconnect-acct" onclick="disconnectAuroraAccount('${escapeHtml(a.username)}')">Disconnect</button>
            </span>
          </div>
        </div>
      `).join("");
    }
  }
}

async function disconnectAuroraAccount(username) {
  try {
    const res = await fetch("/api/aurora/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      if (data.state) applyServerState(data.state);
      updateAuroraConnectionUI();
      renderListsSection();
      renderLogbookSection();
      showToast(`✓ Disconnected @${username} from local session.`);
    } else {
      showToast(`⚠️ ${data.error || "Could not disconnect account"}`);
    }
  } catch (e) {
    showToast("⚠️ Network error disconnecting account.");
  }
}

function openAuroraSyncModal(prefillUsername) {
  if (state.isStaticDemo) {
    showStaticDemoNotice("Tension Board 2 login & 2-way sync");
    return;
  }
  const modal = document.getElementById("modal-aurora-sync");
  if (!modal) return;
  if (prefillUsername && prefillUsername !== "me") {
    const uIn = document.getElementById("aurora-login-user");
    if (uIn) uIn.value = prefillUsername.replace(/^@/, "");
  }
  const msg = document.getElementById("aurora-sync-status-msg");
  if (msg) msg.textContent = "";
  updateAuroraConnectionUI();
  modal.style.display = "flex";
}

function closeAuroraSyncModal() {
  const modal = document.getElementById("modal-aurora-sync");
  if (modal) modal.style.display = "none";
}

async function submitAuroraLogin() {
  const username = document.getElementById("aurora-login-user")?.value.trim().replace(/^@/, "") || "";
  const password = document.getElementById("aurora-login-pass")?.value || "";
  const msg = document.getElementById("aurora-sync-status-msg");
  const btn = document.getElementById("btn-submit-aurora-login");

  if (!username || !password) {
    if (msg) {
      msg.style.color = "#fda4af";
      msg.textContent = "Please enter both your Tension Board 2 username and password.";
    }
    return;
  }

  if (btn) btn.textContent = "🔄 Connecting to tensionboardapp2.com...";
  if (msg) {
    msg.style.color = "#7dd3fc";
    msg.textContent = `Authenticating @${username} with https://tensionboardapp2.com/sessions & syncing profile...`;
  }

  try {
    const res = await fetch("/api/aurora/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      if (msg) {
        msg.style.color = "#fda4af";
        msg.textContent = `Tension login error: ${data.error || 'Invalid credentials'}`;
      }
      if (btn) btn.textContent = "🔄 Connect & Sync Tension Profile";
      return;
    }

    applyServerState(data.state);
    state.selectedClimber = username;
    document.getElementById("aurora-login-pass").value = "";
    updateDynamicCatalogLabels();
    renderListsSection();
    renderLogbookSection();
    renderClimbList();

    const addedLogs = data.stats?.added_logs || 0;
    const pushedLogs = data.stats?.pushed_logs || 0;
    const syncedCircuits = data.stats?.synced_circuits || 0;
    if (msg) {
      msg.style.color = "#86efac";
      msg.textContent = `✓ Connected @${username}! Pushed ${pushedLogs} local logs & pulled ${addedLogs} new logs (${syncedCircuits} circuits).`;
    }
    if (btn) btn.textContent = "🔄 Connect & Sync Tension Profile";
    showToast(`✓ Connected @${username} — pushed ${pushedLogs} local logs & pulled ${addedLogs} new logs!`);
    setTimeout(() => closeAuroraSyncModal(), 1200);
  } catch (e) {
    if (msg) {
      msg.style.color = "#fda4af";
      msg.textContent = `Network error: ${e.message}`;
    }
    if (btn) btn.textContent = "🔄 Connect & Sync Tension Profile";
  }
}

async function triggerAuroraPullSync() {
  if (state.isStaticDemo) {
    showStaticDemoNotice("Tension Board 2 account sync");
    return;
  }
  if (!state.connectedAccounts || state.connectedAccounts.length === 0) {
    openAuroraSyncModal();
    return;
  }
  showToast("🔄 Syncing with Tension App (pushing local logs & pulling latest)...");
  try {
    const res = await fetch("/api/aurora/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      applyServerState(data.state);
      updateAuroraConnectionUI();
      renderListsSection();
      renderLogbookSection();
      renderClimbList();
      const pushed = data.pushed_logs || 0;
      const pulled = data.added_logs || 0;
      const failed = data.failed_logs || 0;
      if (failed > 0) {
        const firstErr = (data.push_errors && data.push_errors[0]) ? ` (${data.push_errors[0]})` : "";
        showToast(`⚠️ Pushed ${pushed}, pulled ${pulled}, failed ${failed}${firstErr}`);
      } else if (pushed > 0 || pulled > 0) {
        showToast(`✓ 2-Way Tension Sync: pushed ${pushed} local ${pushed === 1 ? "log" : "logs"} & pulled ${pulled} new ${pulled === 1 ? "log" : "logs"} (${data.synced_circuits} circuits)!`);
      } else {
        showToast(`✓ Up to date with Tension App — all local logs pushed & 0 new remote logs (${data.synced_circuits} circuits)!`);
      }
    } else {
      openAuroraSyncModal();
    }
  } catch (e) {
    showToast("Could not reach Tension sync endpoint.");
  }
}

function togglePhonePreview() {
  state.phonePreview = !state.phonePreview;
  document.body.classList.toggle("phone-preview-mode", state.phonePreview);
  const btn = document.getElementById("btn-phone-preview");
  if (btn) {
    btn.textContent = state.phonePreview ? "🖥️ Desktop" : "📱 Phone UI";
  }
}

function showToast(msg) {
  const el = document.getElementById("toast-banner");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(state._toastTimer);
  state._toastTimer = setTimeout(() => {
    el.classList.remove("show");
  }, 2800);
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

window.addEventListener("DOMContentLoaded", initApp);
