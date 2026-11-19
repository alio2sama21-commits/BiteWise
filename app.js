/* =========================================================================
   BiteWise 3.0 — Bilingual (English Default / Arabic Toggle) NutriTech Engine
   - Instant 1-Click Language Switch (EN LTR <-> AR RTL)
   - Real Google OAuth 2.0 Sign-In + Real 6-Digit Gmail OTP Verification
   - Auto-Save Users to users_database.txt (Local) + Owner-Only Admin Panel
   - Auto (Mifflin-St Jeor) OR Manual Custom Daily Calories Mode
   - 212 Unique-Photo Egyptian Foods + Cohesive Smart Meal Planner (60g+ Lunch Protein)
   ========================================================================= */

const STORAGE_KEYS = {
  USERS: "bitewise_users_v3",
  SESSION: "bitewise_session_v3",
  THEME: "bitewise_theme_v3",
  CONFIG: "bitewise_config_v3",
  LANG: "bitewise_lang_v3",
  CUSTOM_FOOD_PHOTOS: "bitewise_custom_food_photos_v4",
};

const ADMIN_EMAIL = "alio2sama21@gmail.com";
const CLOUD_USERS_TOPIC = "bitewise_users_alio2sama21_v4";
const CLOUD_PHOTOS_TOPIC = "bitewise_photos_alio2sama21_v4";

const REMOVED_PHOTO_PLACEHOLDER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
      <rect width="400" height="300" fill="#18181b"/>
      <circle cx="200" cy="130" r="36" fill="#27272a"/>
      <path d="M185 130h30M200 115v30" stroke="#10b981" stroke-width="4" stroke-linecap="round"/>
      <text x="200" y="205" text-anchor="middle" fill="#a1a1aa" font-family="sans-serif" font-size="15" font-weight="700">No Photo Set (Admin Removed)</text>
    </svg>`
  );

const DB_JSON_PATH = "./egyptian_food_nutrition_with_images_v4.json";

const MACRO_PRESETS = {
  balanced: { p: 0.30, c: 0.45, f: 0.25 },
  high_protein: { p: 0.38, c: 0.37, f: 0.25 },
  low_carb: { p: 0.35, c: 0.25, f: 0.40 },
  bulk: { p: 0.28, c: 0.50, f: 0.22 },
};

const DIARY_SLOT_KEYS = ["breakfast", "lunch", "dinner", "snacks"];

const CURATED_POOLS = {
  breakfast_protein: [158, 160, 21, 16, 1, 14, 15, 22, 27],
  breakfast_carb: [2, 28, 173, 175, 29],
  lunch_protein: [151, 74, 73, 179, 68, 184, 78, 82, 177, 13, 12, 180, 182],
  lunch_carb: [170, 154, 169, 36, 175, 176, 28, 171, 172],
  veggie_side: [85, 190, 191, 192, 44, 48, 52],
  dinner_protein: [21, 182, 16, 158, 151, 78, 184, 27, 1],
  dinner_carb: [173, 28, 175, 176, 2],
  snack: [116, 118, 125, 124, 119, 195, 198, 196, 16, 134, 120, 127],
  budget_protein: [158, 1, 21, 182, 151, 78, 161, 64],
  budget_carb: [28, 154, 176, 2, 175, 36],
};

const state = {
  lang: "en",
  backendOnline: false,
  backendBaseUrl: "",
  smtpConfigured: false,
  config: {
    googleClientId: "",
    smtpEmail: "",
    emailjsServiceId: "",
    emailjsTemplateId: "",
    emailjsPublicKey: "",
  },
  users: [],
  currentUser: null,
  allFoods: [],
  foodById: new Map(),
  categories: [],
  activeCategory: "ALL",
  searchQuery: "",
  sortBy: "default",
  selectedFoodIds: new Set(),
  currentMetrics: null,
  generatedPlans: [],
  activePlanIndex: 0,
  shuffleSeed: 0,
  activeView: "dashboard",
  modalFood: null,
  pendingSignup: null,
  localOtpRecord: null,
  otpTimerHandle: null,
  obCalMode: "auto",
  calcCalMode: "auto",
  customFoodPhotos: {},
  adminPhotoTargetFood: null,
  adminPendingPhotoValue: "",
};

function isAdminUser() {
  const email = String(state.currentUser?.email || "").trim().toLowerCase();
  return email === ADMIN_EMAIL;
}

// ==================== i18n HELPERS ====================
function tr(key) {
  const dict = window.BITEWISE_I18N?.[state.lang] || window.BITEWISE_I18N?.en || {};
  return dict[key] !== undefined ? dict[key] : key;
}

function isAr() {
  return state.lang === "ar";
}

function foodPrimaryName(food) {
  if (!food) return "";
  return isAr() ? (food.name_ar || food.name_en) : (food.name_en || food.name_ar);
}

function foodSecondaryName(food) {
  if (!food) return "";
  return isAr() ? (food.name_en || "") : (food.name_ar || "");
}

function categoryLabel(cat) {
  return tr("categories")?.[cat] || cat;
}

function goalLabel(goal) {
  if (goal === "lose") return tr("goalLose");
  if (goal === "gain") return tr("goalGain");
  return tr("goalMaintain");
}

function mealDisplayName(key) {
  // Backward-compatible normalization for Arabic-saved diary entries
  const mapAr = { "الفطار": "breakfast", "الغداء": "lunch", "العشاء": "dinner", "سناكس": "snacks", "سناك": "snack" };
  const norm = mapAr[key] || key;
  return tr("mealNames")?.[norm] || key;
}

function normalizeDiaryMealKey(mealVal) {
  const map = { "الفطار": "breakfast", "الغداء": "lunch", "العشاء": "dinner", "سناكس": "snacks", "سناك": "snacks", snack: "snacks", snack1: "snacks", snack2: "snacks" };
  return map[mealVal] || (DIARY_SLOT_KEYS.includes(mealVal) ? mealVal : "lunch");
}

function applyLanguage(lang) {
  state.lang = lang === "ar" ? "ar" : "en";
  localStorage.setItem(STORAGE_KEYS.LANG, state.lang);

  document.documentElement.lang = state.lang;
  document.documentElement.dir = isAr() ? "rtl" : "ltr";
  document.title = tr("pageTitle");

  // Update toggle buttons
  ["authLangBtn", "navLangBtn"].forEach((id) => {
    const b = document.getElementById(id);
    if (b) b.textContent = tr("langToggleBtn");
  });

  // Update static data-i18n text, HTML, and placeholders
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const val = tr(el.dataset.i18n);
    if (typeof val === "string") el.textContent = val;
  });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    const val = tr(el.dataset.i18nHtml);
    if (typeof val === "string") el.innerHTML = val;
  });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
    const val = tr(el.dataset.i18nPh);
    if (typeof val === "string") el.placeholder = val;
  });

  // Update Food Modal meal dropdown options
  const fmSlot = document.getElementById("fmMealSlot");
  if (fmSlot) {
    const cur = fmSlot.value;
    fmSlot.innerHTML = DIARY_SLOT_KEYS.map((k) => `<option value="${k}">${mealDisplayName(k)}</option>`).join("");
    fmSlot.value = DIARY_SLOT_KEYS.includes(cur) ? cur : "lunch";
  }

  // Update dynamic status badges
  const badge = document.getElementById("backendStatusBadge");
  if (badge) badge.textContent = state.backendOnline ? tr("statusLocal") : tr("statusLive");
  const fileTag = document.getElementById("udFileSyncBadge");
  if (fileTag) fileTag.textContent = state.backendOnline ? "users_database.txt ✓" : tr("savedLocalTag");

  syncAdminUIVisibility();

  // Re-render all dynamic views cleanly in the new language
  if (!document.getElementById("onboardingView").classList.contains("hidden")) {
    updateOnboardingLivePreview();
  }
  if (state.currentUser && state.currentUser.onboardingComplete) {
    recalculateAndRenderAll();
    renderCategoryPills();
    renderFoods();
    renderPlannerBasket();
    if (state.generatedPlans.length > 0) generateDietPlans(true);
    renderDiary();
  }
}

// ==================== HELPERS & TOAST ====================
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  const el = document.createElement("div");
  el.className = `toast ${type === "error" ? "error" : ""}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transition = "0.25s ease";
    setTimeout(() => el.remove(), 260);
  }, 3400);
}

function extractNutrition(food) {
  const uG = tr("unitGram");
  const uM = tr("unitMl");
  const uP = tr("unitPiece");
  if (!food) {
    return { basis: { calories_kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 }, unitLabel: "100g", unitDisplay: uG, baseQty: 100, isPiece: false };
  }
  if (food.per_100g) return { basis: food.per_100g, unitLabel: "100g", unitDisplay: uG, baseQty: 100, isPiece: false };
  if (food.per_100M) return { basis: food.per_100M, unitLabel: "100ml", unitDisplay: uM, baseQty: 100, isPiece: false };
  if (food.per_1) return { basis: food.per_1, unitLabel: isAr() ? "1 قطعة" : "1 pc", unitDisplay: uP, baseQty: 1, isPiece: true };
  return { basis: { calories_kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 }, unitLabel: "100g", unitDisplay: uG, baseQty: 100, isPiece: false };
}

function getFoodImage(food) {
  if (!food) return "./images/ful_medames.jpg";
  const custom = state.customFoodPhotos?.[food.id];
  if (custom === "__REMOVED__") return REMOVED_PHOTO_PLACEHOLDER;
  if (custom) return custom;
  if (food.photo_url === "__REMOVED__" || food.image_url === "__REMOVED__") return REMOVED_PHOTO_PLACEHOLDER;
  return food?.photo_url || food?.image_url || food?.category_image_url || "./images/ful_medames.jpg";
}

function getFoodFallbackImage(food) {
  const custom = state.customFoodPhotos?.[food?.id];
  if (custom === "__REMOVED__" || food?.photo_url === "__REMOVED__") return REMOVED_PHOTO_PLACEHOLDER;
  return food?.category_image_url || "./images/ful_medames.jpg";
}

function imgTagHtml(food, cls = "") {
  const src = getFoodImage(food);
  const fb = getFoodFallbackImage(food);
  const alt = foodPrimaryName(food).replace(/"/g, "&quot;");
  return `<img class="${cls}" src="${src}" alt="${alt}" loading="lazy" onerror="this.onerror=null;this.src='${fb}';" />`;
}

function syncAdminUIVisibility() {
  const isOwnerEnv =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    new URLSearchParams(window.location.search).get("admin") === "1";
  const isAdmin = isAdminUser();
  const showOwnerControls = isOwnerEnv || isAdmin;

  ["authSettingsBtn", "openSettingsBtn", "openSmtpFromOtp", "udExportUsersBtn"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("hidden", !showOwnerControls);
  });

  const adminBar = document.getElementById("adminFoodsToolbar");
  if (adminBar) {
    adminBar.classList.toggle("hidden", !isAdmin);
    const desc = document.getElementById("adminToolbarDesc");
    const exportBtn = document.getElementById("adminExportFoodsJsBtn");
    if (desc) {
      desc.innerHTML = isAr()
        ? "اضغط على زر <strong>📷 تعديل الصورة</strong> فوق أي أكلة بالأسفل لحذف صورتها أو رفع صورة جديدة مباشرة من الموقع."
        : "Click the <strong>📷 Edit Photo</strong> button on any food card below to remove or replace its image directly from the website.";
    }
    if (exportBtn) {
      exportBtn.textContent = isAr() ? "💾 تحميل ملف foods-data.js المحدث" : "💾 Download Updated foods-data.js";
    }
  }

  const fmAdminBtn = document.getElementById("fmAdminPhotoBtn");
  if (fmAdminBtn) {
    fmAdminBtn.classList.toggle("hidden", !isAdmin);
    fmAdminBtn.textContent = isAr() ? "📷 تعديل الصورة" : "📷 Edit Photo";
  }
}

// ==================== BACKEND, OWNER MODE & CONFIG ====================
async function initBackendAndConfig() {
  let localCfg = {};
  try { localCfg = JSON.parse(localStorage.getItem(STORAGE_KEYS.CONFIG) || "{}"); } catch {}
  const baseCfg = window.BITEWISE_CONFIG || {};
  state.config = {
    ...state.config,
    ...baseCfg,
    googleClientId: localCfg.googleClientId || baseCfg.googleClientId || "",
    smtpEmail: localCfg.smtpEmail || baseCfg.smtpEmail || "",
    emailjsServiceId: localCfg.emailjsServiceId || baseCfg.emailjsServiceId || "",
    emailjsTemplateId: localCfg.emailjsTemplateId || baseCfg.emailjsTemplateId || "",
    emailjsPublicKey: localCfg.emailjsPublicKey || baseCfg.emailjsPublicKey || "",
    cloudWebhookUrl: localCfg.cloudWebhookUrl || baseCfg.cloudWebhookUrl || "",
  };

  // Probe relative /api/health first, then fallback to local server http://localhost:8765 (even when viewing from GitHub Pages on your PC)
  const candidateBases = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? [""]
    : ["http://localhost:8765"];

  for (const base of candidateBases) {
    try {
      const res = await fetch(`${base}/api/health`, { cache: "no-store" });
      if (res.ok) {
        const info = await res.json();
        state.backendOnline = Boolean(info.ok);
        state.backendBaseUrl = base;
        state.smtpConfigured = Boolean(info.smtpConfigured);
        const cfgRes = await fetch(`${base}/api/config`, { cache: "no-store" });
        if (cfgRes.ok) {
          const srvCfg = await cfgRes.json();
          if (srvCfg.googleClientId) state.config.googleClientId = srvCfg.googleClientId;
          if (srvCfg.smtpEmail) state.config.smtpEmail = srvCfg.smtpEmail;
          if (srvCfg.emailjsServiceId) state.config.emailjsServiceId = srvCfg.emailjsServiceId;
          if (srvCfg.emailjsTemplateId) state.config.emailjsTemplateId = srvCfg.emailjsTemplateId;
          if (srvCfg.emailjsPublicKey) state.config.emailjsPublicKey = srvCfg.emailjsPublicKey;
          state.smtpConfigured = Boolean(srvCfg.smtpConfigured);
        }
        break;
      }
    } catch {
      state.backendOnline = false;
    }
  }

  try {
    state.customFoodPhotos = JSON.parse(localStorage.getItem(STORAGE_KEYS.CUSTOM_FOOD_PHOTOS) || "{}");
  } catch {
    state.customFoodPhotos = {};
  }

  syncAdminUIVisibility();

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "a") {
      e.preventDefault();
      openSettingsModal();
    }
  });
}

function compactUserForSync(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    password: u.password || "",
    provider: u.provider || "local",
    picture: u.picture || "",
    emailVerified: Boolean(u.emailVerified),
    age: u.age || 21,
    gender: u.gender || "male",
    height: u.height || 175,
    weight: u.weight || 75,
    activity: u.activity || 1.55,
    goal: u.goal || "maintain",
    calorieMode: u.calorieMode || "auto",
    manualCalories: u.manualCalories || 2200,
    macroPreset: u.macroPreset || "balanced",
    onboardingComplete: Boolean(u.onboardingComplete),
    createdAt: u.createdAt || new Date().toISOString(),
  };
}

async function pullUsersFromCloud() {
  try {
    const res = await fetch(`https://ntfy.sh/${CLOUD_USERS_TOPIC}/json?poll=1&since=all`, { cache: "no-store" });
    if (!res.ok) return [];
    const text = await res.text();
    const map = new Map();
    text.split(/\r?\n/).forEach((line) => {
      if (!line.trim()) return;
      try {
        const env = JSON.parse(line);
        if (env.event === "message" && env.message) {
          const payload = JSON.parse(env.message);
          const list = Array.isArray(payload.users) ? payload.users : payload.user ? [payload.user] : [];
          list.forEach((u) => {
            if (u && u.id) map.set(u.id, u);
          });
        }
      } catch {}
    });
    return [...map.values()];
  } catch {
    return [];
  }
}

async function pushUserToCloud(userObj) {
  try {
    await fetch(`https://ntfy.sh/${CLOUD_USERS_TOPIC}`, {
      method: "POST",
      body: JSON.stringify({ user: compactUserForSync(userObj) }),
    });
  } catch {}
}

async function loadUsers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USERS);
    state.users = raw ? JSON.parse(raw) : [];
  } catch {
    state.users = [];
  }

  const map = new Map();
  state.users.forEach((u) => { if (u && u.id) map.set(u.id, u); });

  // 1. Pull users registered from any device via Cloud Sync
  const cloudUsers = await pullUsersFromCloud();
  cloudUsers.forEach((cu) => {
    const existing = map.get(cu.id);
    map.set(cu.id, existing ? { ...cu, ...existing, diaries: existing.diaries || {} } : { ...cu, diaries: {} });
  });

  // 2. Pull & sync with local server (updates c:\Users\M S I\Desktop\BetWise\users_database.txt automatically!)
  if (state.backendOnline) {
    try {
      const res = await fetch(`${state.backendBaseUrl}/api/users`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.users)) {
          data.users.forEach((su) => {
            if (su && su.id) {
              const existing = map.get(su.id);
              map.set(su.id, existing ? { ...su, ...existing } : su);
            }
          });
        }
      }
    } catch {}
  }

  state.users = [...map.values()];

  if (!state.users.some((u) => u.id === "BW-1001")) {
    state.users.unshift({
      id: "BW-1001",
      name: "Ahmed Mohamed",
      email: "demo@bitewise.eg",
      password: "1234",
      provider: "local",
      picture: "",
      emailVerified: true,
      age: 21,
      gender: "male",
      height: 176,
      weight: 75,
      activity: 1.55,
      goal: "maintain",
      calorieMode: "auto",
      manualCalories: 2400,
      macroPreset: "balanced",
      onboardingComplete: true,
      selectedFoodIds: [1, 151, 154, 158, 21, 85, 116, 195],
      diaries: {},
      createdAt: new Date().toISOString(),
    });
  }
  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(state.users));

  // Backfill any previously-saved browser users to Cloud Sync so accounts created BEFORE this update also appear in users_database.txt
  const cloudIds = new Set(cloudUsers.map((u) => u.id));
  const unsyncedLocalUsers = state.users.filter((u) => u && u.id && u.id !== "BW-1001" && !cloudIds.has(u.id));
  if (unsyncedLocalUsers.length > 0) {
    try {
      fetch(`https://ntfy.sh/${CLOUD_USERS_TOPIC}`, {
        method: "POST",
        body: JSON.stringify({ users: unsyncedLocalUsers.map(compactUserForSync) }),
      });
    } catch {}
  }

  // Push any browser-saved users to local users_database.txt & cloud
  if (state.backendOnline && state.users.length > 0) {
    try {
      fetch(`${state.backendBaseUrl}/api/users/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ users: state.users.map(compactUserForSync) }),
      });
    } catch {}
  }
}

async function persistCurrentUser(userObj = state.currentUser) {
  if (!userObj) return;
  const idx = state.users.findIndex((u) => u.id === userObj.id);
  if (idx !== -1) state.users[idx] = userObj;
  else state.users.push(userObj);

  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(state.users));
  if (state.currentUser && state.currentUser.id === userObj.id) {
    localStorage.setItem(STORAGE_KEYS.SESSION, userObj.id);
  }

  // Always sync to Cloud Channel so admin & local server receive users from all devices
  pushUserToCloud(userObj);

  // Sync to local server users_database.txt if reachable
  if (state.backendOnline) {
    try {
      await fetch(`${state.backendBaseUrl}/api/users/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: compactUserForSync(userObj) }),
      });
    } catch {}
  }
}

function generateUniqueUserId() {
  let num = 1002 + state.users.length;
  while (state.users.some((u) => u.id === `BW-${num}`)) num += 1;
  return `BW-${num}`;
}

async function downloadUsersTextFile() {
  await loadUsers();
  const lines = [
    "==========================================================================",
    `  BITEWISE USERS DATABASE (Exported: ${new Date().toLocaleString("en-GB")})`,
    `  Total Accounts: ${state.users.length}`,
    "==========================================================================",
    "",
  ];
  state.users.forEach((u) => {
    const h = Number(u.height) || 175;
    const w = Number(u.weight) || 75;
    const bmi = (w / ((h / 100) ** 2)).toFixed(1);
    lines.push("--------------------------------------------------------------------------");
    lines.push(`User ID        : ${u.id}`);
    lines.push(`Full Name      : ${u.name}`);
    lines.push(`Email          : ${u.email}`);
    lines.push(`Password       : ${u.password || "(Google OAuth)"}`);
    lines.push(`Auth Provider  : ${u.provider || "local"} | Verified: ${Boolean(u.emailVerified)}`);
    lines.push(`Body Profile   : Gender=${u.gender} | Age=${u.age} | Height=${h}cm | Weight=${w}kg | BMI=${bmi}`);
    lines.push(`Calories Setup : Mode=${u.calorieMode || "auto"} | Manual=${u.manualCalories || 2200} kcal | Goal=${u.goal} | Activity=${u.activity}`);
    lines.push(`Created At     : ${u.createdAt || ""}`);
  });
  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "users_database.txt";
  a.click();
  URL.revokeObjectURL(a.href);
  showToast(isAr() ? "تم تحميل ملف users_database.txt بنجاح!" : "Downloaded users_database.txt!");
}

function getTodayDiary() {
  if (!state.currentUser) return { items: [], waterCups: 0 };
  if (!state.currentUser.diaries) state.currentUser.diaries = {};
  const key = todayKey();
  if (!state.currentUser.diaries[key]) state.currentUser.diaries[key] = { items: [], waterCups: 0 };
  return state.currentUser.diaries[key];
}

// ==================== REAL GOOGLE OAUTH 2.0 SIGN-IN ====================
function triggerRealGoogleSignIn() {
  const clientId = (state.config.googleClientId || "").trim();
  if (!clientId) {
    showToast(isAr() ? "أدخل Google OAuth Client ID أولاً" : "Configure Google OAuth Client ID first", "error");
    openSettingsModal();
    return;
  }

  if (!window.google?.accounts?.oauth2) {
    showToast(isAr() ? "جاري تحميل Google SDK... حاول مجدداً" : "Loading Google SDK... please try again", "error");
    return;
  }

  try {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "openid email profile",
      callback: async (tokenResponse) => {
        if (tokenResponse.error) {
          showAuthAlert(`Google Sign-In failed: ${tokenResponse.error}`);
          return;
        }
        try {
          const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
          });
          if (!profileRes.ok) throw new Error("Failed");
          const gUser = await profileRes.json();
          await completeGoogleSignIn(gUser);
        } catch {
          showAuthAlert(isAr() ? "تعذّر قراءة بيانات حساب Google." : "Could not load your Google profile.");
        }
      },
    });
    tokenClient.requestAccessToken({ prompt: "select_account" });
  } catch {
    showAuthAlert(isAr() ? "خطأ في تشغيل Google OAuth." : "Failed to launch Google OAuth.");
  }
}

async function completeGoogleSignIn(gUser) {
  const email = (gUser.email || "").toLowerCase();
  const name = gUser.name || email.split("@")[0] || "Google User";
  const picture = gUser.picture || "";

  let user = state.users.find((u) => (u.email || "").toLowerCase() === email);
  if (!user) {
    user = {
      id: generateUniqueUserId(),
      name,
      email,
      password: "",
      provider: "google",
      picture,
      emailVerified: true,
      age: 22,
      gender: "male",
      height: 175,
      weight: 75,
      activity: 1.55,
      goal: "maintain",
      calorieMode: "auto",
      manualCalories: 2300,
      macroPreset: "balanced",
      onboardingComplete: false,
      selectedFoodIds: [],
      diaries: {},
      createdAt: new Date().toISOString(),
    };
  } else {
    user.picture = picture || user.picture;
    user.emailVerified = true;
  }

  await persistCurrentUser(user);
  showToast(isAr() ? `تم تسجيل الدخول بحساب Google: ${name}` : `Signed in with Google as ${name}`);
  enterSession(user);
}

// ==================== REAL 6-DIGIT GMAIL OTP ====================
async function sendGmailOtp(email, name) {
  let code = String(Math.floor(100000 + Math.random() * 900000));

  if (state.backendOnline) {
    const res = await fetch("/api/otp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Failed to send OTP");
    if (data.deliveredVia === "gmail_smtp") return data;
    if (data.devOtp) code = String(data.devOtp);
  } else {
    state.localOtpRecord = { email, code, expiresAt: Date.now() + 5 * 60 * 1000 };
  }

  if (state.config.emailjsServiceId && state.config.emailjsTemplateId && state.config.emailjsPublicKey) {
    try {
      const ejRes = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: state.config.emailjsServiceId,
          template_id: state.config.emailjsTemplateId,
          user_id: state.config.emailjsPublicKey,
          template_params: {
            to_email: email,
            email: email,
            user_email: email,
            reply_to: email,
            to_name: name,
            user_name: name,
            name: name,
            otp_code: code,
            passcode: code,
            otp: code,
            code: code,
            message: `Your BiteWise verification code is: ${code}`,
            time: "5 minutes",
          },
        }),
      });
      if (ejRes.ok) {
        return { ok: true, deliveredVia: "emailjs", message: isAr() ? `تم إرسال رمز التحقق إلى ${email}` : `OTP sent to ${email}` };
      }
    } catch {}
  }

  const isLocalHost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  if (!isLocalHost) {
    throw new Error(
      isAr()
        ? "خدمة إرسال كود Gmail غير مفعّلة على الاستضافة بعد — سجّل الدخول مباشرة عبر Google أو فعّل EmailJS في config.js."
        : "Gmail OTP email delivery is not configured on this live site yet — please use Google Sign-In or add EmailJS keys in config.js."
    );
  }

  return {
    ok: true,
    deliveredVia: "local_fallback",
    devOtp: code,
    message: isAr() ? "تم توليد رمز OTP (وضع التطوير المحلي)" : "OTP generated (Local Dev Mode)",
  };
}

async function verifyGmailOtp(email, code) {
  if (state.backendOnline) {
    const res = await fetch("/api/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Invalid OTP code");
    return true;
  }
  const rec = state.localOtpRecord;
  if (!rec || rec.email !== email) throw new Error(isAr() ? "لم يتم طلب رمز لهذا البريد." : "No OTP requested for this email.");
  if (Date.now() > rec.expiresAt) throw new Error(isAr() ? "انتهت صلاحية الرمز." : "OTP expired. Click resend.");
  if (rec.code !== code) throw new Error(isAr() ? "رمز التحقق غير صحيح." : "Invalid 6-digit OTP code.");
  state.localOtpRecord = null;
  return true;
}

function startOtpCountdown(seconds = 300) {
  clearInterval(state.otpTimerHandle);
  let left = seconds;
  const el = document.getElementById("otpTimerText");
  const tick = () => {
    el.textContent = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
    if (left <= 0) clearInterval(state.otpTimerHandle);
    left -= 1;
  };
  tick();
  state.otpTimerHandle = setInterval(tick, 1000);
}

function getOtpInputValue() {
  return [...document.querySelectorAll(".otp-digit")].map((i) => i.value.trim()).join("");
}

function resetOtpBoxes() {
  const inputs = document.querySelectorAll(".otp-digit");
  inputs.forEach((i) => (i.value = ""));
  if (inputs[0]) inputs[0].focus();
}

// ==================== HEALTH METRICS ENGINE ====================
function calculateHealthMetrics({
  gender, age, weight, height, activity, goal,
  calorieMode = "auto", manualCalories = 2200, macroPreset = "balanced",
}) {
  const w = Math.max(30, Number(weight) || 70);
  const h = Math.max(100, Number(height) || 170);
  const a = Math.max(12, Number(age) || 20);
  const act = Number(activity) || 1.55;
  const g = gender === "female" ? "female" : "male";

  const heightM = h / 100;
  const bmi = Math.round((w / (heightM * heightM)) * 10) / 10;

  let bmiLabel = tr("bmiNormal");
  let bmiClass = "normal";
  if (bmi < 18.5) { bmiLabel = tr("bmiUnder"); bmiClass = "under"; }
  else if (bmi < 25) { bmiLabel = tr("bmiNormal"); bmiClass = "normal"; }
  else if (bmi < 30) { bmiLabel = tr("bmiOver"); bmiClass = "over"; }
  else { bmiLabel = tr("bmiObese"); bmiClass = "obese"; }

  let bmiMarkerPct = 50;
  if (bmi <= 15) bmiMarkerPct = 2;
  else if (bmi < 18.5) bmiMarkerPct = ((bmi - 15) / 3.5) * 14;
  else if (bmi < 25) bmiMarkerPct = 14 + ((bmi - 18.5) / 6.5) * 26;
  else if (bmi < 30) bmiMarkerPct = 40 + ((bmi - 25) / 5) * 20;
  else if (bmi < 40) bmiMarkerPct = 60 + ((bmi - 30) / 10) * 40;
  else bmiMarkerPct = 98;

  const idealMin = Math.round(18.5 * heightM * heightM);
  const idealMax = Math.round(24.9 * heightM * heightM);

  const bmr = Math.round(g === "male" ? 10 * w + 6.25 * h - 5 * a + 5 : 10 * w + 6.25 * h - 5 * a - 161);
  const tdee = Math.round(bmr * act);

  let targetCalories = tdee;
  let goalDeltaText = tr("deltaMaintain");
  let proteinGrams, carbsGrams, fatGrams;

  const presetNames = {
    balanced: isAr() ? "متوازن" : "Balanced",
    high_protein: isAr() ? "عالي البروتين" : "High Protein",
    low_carb: isAr() ? "منخفض الكارب" : "Low Carb",
    bulk: isAr() ? "تضخيم" : "Lean Bulk",
  };

  if (calorieMode === "manual") {
    targetCalories = Math.max(1000, Math.min(6000, Math.round(Number(manualCalories) || 2200)));
    const preset = MACRO_PRESETS[macroPreset] || MACRO_PRESETS.balanced;
    proteinGrams = Math.round((targetCalories * preset.p) / 4);
    carbsGrams = Math.round((targetCalories * preset.c) / 4);
    fatGrams = Math.round((targetCalories * preset.f) / 9);
    const diff = targetCalories - tdee;
    goalDeltaText = tr("deltaManual")(diff, presetNames[macroPreset] || presetNames.balanced);
  } else {
    if (goal === "lose") {
      targetCalories = Math.max(1200, tdee - 450);
      goalDeltaText = tr("deltaLose")(tdee - targetCalories);
    } else if (goal === "gain") {
      targetCalories = tdee + 400;
      goalDeltaText = tr("deltaGain");
    }
    const rawProteinG = goal === "maintain" ? w * 1.9 : w * 2.1;
    const maxProteinG = (targetCalories * 0.38) / 4;
    proteinGrams = Math.round(Math.min(rawProteinG, maxProteinG));
    fatGrams = Math.round((targetCalories * 0.25) / 9);
    carbsGrams = Math.round(Math.max(0, targetCalories - proteinGrams * 4 - fatGrams * 9) / 4);
  }

  const proteinKcal = proteinGrams * 4;
  const carbsKcal = carbsGrams * 4;
  const fatKcal = fatGrams * 9;
  const totalMacroKcal = Math.max(1, proteinKcal + carbsKcal + fatKcal);
  const proteinPct = Math.round((proteinKcal / totalMacroKcal) * 100);
  const fatPct = Math.round((fatKcal / totalMacroKcal) * 100);
  const carbsPct = Math.max(0, 100 - proteinPct - fatPct);

  const waterLiters = Math.round(w * 0.035 * 10) / 10;
  const waterCups = Math.max(6, Math.round(waterLiters * 4));
  const fiberGrams = Math.round((targetCalories / 1000) * 14);

  return {
    calorieMode, macroPreset, presetLabel: presetNames[macroPreset] || presetNames.balanced,
    bmi, bmiLabel, bmiClass, bmiMarkerPct, idealMin, idealMax,
    bmr, tdee, activityFactor: act,
    targetCalories, goalDeltaText,
    proteinGrams, proteinKcal, proteinPct,
    carbsGrams, carbsKcal, carbsPct,
    fatGrams, fatKcal, fatPct,
    waterLiters, waterCups, fiberGrams,
  };
}

// ==================== COHESIVE SMART DIET PLANNER (60g+ LUNCH PROTEIN) ====================
function getMealSlotsConfig(structure) {
  const mn = tr("mealNames");
  const mt = tr("mealTimes");
  if (structure === "3") {
    return [
      { key: "breakfast", name: mn.breakfast, time: mt.breakfast, share: 0.27, cls: "slot-breakfast" },
      { key: "lunch", name: mn.lunch, time: mt.lunch, share: 0.45, cls: "slot-lunch", isLunch: true },
      { key: "dinner", name: mn.dinner, time: mt.dinner, share: 0.28, cls: "slot-dinner" },
    ];
  }
  if (structure === "5") {
    return [
      { key: "breakfast", name: mn.breakfast, time: mt.breakfast5, share: 0.22, cls: "slot-breakfast" },
      { key: "snack1", name: mn.snack1, time: mt.snack1, share: 0.10, cls: "slot-snack" },
      { key: "lunch", name: mn.lunch, time: mt.lunch5, share: 0.36, cls: "slot-lunch", isLunch: true },
      { key: "snack2", name: mn.snack2, time: mt.snack2, share: 0.12, cls: "slot-snack" },
      { key: "dinner", name: mn.dinner, time: mt.dinner5, share: 0.20, cls: "slot-dinner" },
    ];
  }
  if (structure === "if168") {
    return [
      { key: "lunch", name: mn.lunch_if, time: mt.lunch_if, share: 0.48, cls: "slot-lunch", isLunch: true },
      { key: "snack", name: mn.snack_if, time: mt.snack_if, share: 0.16, cls: "slot-snack" },
      { key: "dinner", name: mn.dinner, time: mt.dinner, share: 0.36, cls: "slot-dinner" },
    ];
  }
  return [
    { key: "breakfast", name: mn.breakfast, time: mt.breakfast, share: 0.24, cls: "slot-breakfast" },
    { key: "lunch", name: mn.lunch, time: mt.lunch, share: 0.42, cls: "slot-lunch", isLunch: true },
    { key: "snack", name: mn.snack, time: mt.snack, share: 0.12, cls: "slot-snack" },
    { key: "dinner", name: mn.dinner, time: mt.dinner, share: 0.22, cls: "slot-dinner" },
  ];
}

function classifyFoodRole(food) {
  const { basis } = extractNutrition(food);
  const cat = food.category || "";
  const en = (food.name_en || "").toLowerCase();
  if (cat === "Meats, Poultry & Seafood") return "lunch_protein";
  if (cat === "Main Courses & Stews") return (basis.protein_g || 0) >= 12 ? "lunch_protein" : "lunch_carb";
  if (cat === "Salads & Dips") return "veggie_side";
  if (cat === "Fruits" || cat === "Nuts, Seeds & Oils" || cat === "Desserts & Beverages" || cat === "Dunkin' Donuts") return "snack";
  if (cat === "Cheeses & Dairy") return "breakfast_protein";
  if (cat === "Breakfast & Street Food") {
    if (en.includes("oats")) return "breakfast_carb";
    if (en.includes("shawarma") || en.includes("hawawshi") || en.includes("kibda") || en.includes("sogoq")) return "lunch_protein";
    if (en.includes("koshary") || en.includes("batates")) return "lunch_carb";
    return "breakfast_protein";
  }
  if (cat === "Breads, Rice & Pasta") return (en.includes("toast") || en.includes("baladi")) ? "breakfast_carb" : "lunch_carb";
  return "snack";
}

function getPoolFoods(poolName) {
  return (CURATED_POOLS[poolName] || []).map((id) => state.foodById.get(id)).filter(Boolean);
}

function pickFromPool(poolName, excludeIds, offset = 0) {
  const list = getPoolFoods(poolName);
  if (!list.length) return state.allFoods[0];
  for (let i = 0; i < list.length; i++) {
    const f = list[(i + offset) % list.length];
    if (!excludeIds.has(f.id)) { excludeIds.add(f.id); return f; }
  }
  return list[offset % list.length];
}

function buildPlanItem(food, slotKey, slotName, role, amount, isUserPick) {
  const { basis, unitDisplay, isPiece } = extractNutrition(food);
  const rounded = isPiece ? Math.max(0.5, Math.round(amount * 2) / 2) : Math.max(15, Math.round(amount / 5) * 5);
  const factor = isPiece ? rounded : rounded / 100;
  return {
    foodId: food.id, food, name: foodPrimaryName(food),
    image: getFoodImage(food), fallbackImage: getFoodFallbackImage(food),
    slotKey, meal: slotName, role, isUserPick, isPiece,
    amount: rounded, unit: unitDisplay,
    calories: Math.round((basis.calories_kcal || 0) * factor),
    protein: Math.round((basis.protein_g || 0) * factor * 10) / 10,
    carbs: Math.round((basis.carbs_g || 0) * factor * 10) / 10,
    fat: Math.round((basis.fat_g || 0) * factor * 10) / 10,
  };
}

function computePlanTotals(items) {
  return items.reduce(
    (a, it) => ({ calories: a.calories + it.calories, protein: a.protein + it.protein, carbs: a.carbs + it.carbs, fat: a.fat + it.fat }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

function buildCohesivePlan({ title, description, selectedFoods, metrics, structure, minLunchProtein, style, autoComplete, seed = 0 }) {
  const slots = getMealSlotsConfig(structure);
  const usedIds = new Set();

  const userBuckets = { breakfast_protein: [], breakfast_carb: [], lunch_protein: [], lunch_carb: [], veggie_side: [], snack: [] };
  selectedFoods.forEach((f) => { const r = classifyFoodRole(f); if (userBuckets[r]) userBuckets[r].push(f); });
  userBuckets.lunch_protein.sort((a, b) => (extractNutrition(b).basis.protein_g || 0) - (extractNutrition(a).basis.protein_g || 0));

  const pullUser = (b) => {
    while (userBuckets[b]?.length) {
      const f = userBuckets[b].shift();
      if (!usedIds.has(f.id)) { usedIds.add(f.id); return f; }
    }
    return null;
  };

  const mealGroups = [];
  slots.forEach((slot, sIdx) => {
    const slotTargetKcal = metrics.targetCalories * slot.share;
    const rawEntries = [];

    if (slot.key === "breakfast") {
      const pU = pullUser("breakfast_protein");
      const pF = pU || (autoComplete ? pickFromPool(style === "budget" ? "budget_protein" : "breakfast_protein", usedIds, seed + sIdx) : null);
      if (pF) rawEntries.push({ food: pF, role: "breakfast_protein", isUserPick: Boolean(pU), weightShare: 0.55 });

      const cU = pullUser("breakfast_carb");
      const cF = cU || (autoComplete && style !== "low_carb" ? pickFromPool(style === "budget" ? "budget_carb" : "breakfast_carb", usedIds, seed + sIdx) : null);
      if (cF) rawEntries.push({ food: cF, role: "breakfast_carb", isUserPick: Boolean(cU), weightShare: 0.45 });
    } else if (slot.isLunch) {
      const pU = pullUser("lunch_protein");
      const pF = pU || pickFromPool(style === "budget" ? "budget_protein" : "lunch_protein", usedIds, seed);
      if (pF) rawEntries.push({ food: pF, role: "lunch_protein", isUserPick: Boolean(pU), weightShare: 0.56 });

      const cU = pullUser("lunch_carb");
      const cF = cU || (autoComplete && style !== "low_carb" ? pickFromPool(style === "budget" ? "budget_carb" : "lunch_carb", usedIds, seed) : null);
      if (cF) rawEntries.push({ food: cF, role: "lunch_carb", isUserPick: Boolean(cU), weightShare: style === "low_carb" ? 0.15 : 0.34 });

      const vU = pullUser("veggie_side");
      const vF = vU || (autoComplete ? pickFromPool("veggie_side", usedIds, seed) : null);
      if (vF) rawEntries.push({ food: vF, role: "veggie_side", isUserPick: Boolean(vU), weightShare: 0.10 });
    } else if (slot.key === "dinner") {
      const pU = pullUser("lunch_protein") || pullUser("breakfast_protein");
      const pF = pU || (autoComplete ? pickFromPool(style === "budget" ? "budget_protein" : "dinner_protein", usedIds, seed + 2) : null);
      if (pF) rawEntries.push({ food: pF, role: "dinner_protein", isUserPick: Boolean(pU), weightShare: 0.62 });

      const cU = pullUser("lunch_carb") || pullUser("breakfast_carb") || pullUser("veggie_side");
      const cF = cU || (autoComplete ? pickFromPool(style === "low_carb" ? "veggie_side" : "dinner_carb", usedIds, seed + 1) : null);
      if (cF) rawEntries.push({ food: cF, role: style === "low_carb" ? "veggie_side" : "dinner_carb", isUserPick: Boolean(cU), weightShare: 0.38 });
    } else {
      const sU = pullUser("snack");
      const sF = sU || (autoComplete ? pickFromPool("snack", usedIds, seed + sIdx * 2) : null);
      if (sF) rawEntries.push({ food: sF, role: "snack", isUserPick: Boolean(sU), weightShare: 1.0 });
    }

    const sumShare = rawEntries.reduce((s, e) => s + e.weightShare, 0) || 1;
    let builtItems = rawEntries.map((entry) => {
      const { basis, isPiece } = extractNutrition(entry.food);
      const itemTargetKcal = slotTargetKcal * (entry.weightShare / sumShare);
      const kcalPerUnit = isPiece ? Math.max(20, basis.calories_kcal || 80) : Math.max(25, basis.calories_kcal || 100) / 100;
      let qty = itemTargetKcal / kcalPerUnit;
      if (entry.role === "veggie_side") qty = Math.min(200, Math.max(100, qty));
      else if (entry.food.category === "Nuts, Seeds & Oils") qty = Math.min(35, Math.max(15, qty));
      else if (isPiece) qty = Math.min(4, Math.max(1, qty));
      else qty = Math.min(300, Math.max(50, qty));
      return buildPlanItem(entry.food, slot.key, slot.name, entry.role, qty, entry.isUserPick);
    });

    // STRICT GUARANTEE: Lunch Protein >= minLunchProtein (default 60g+)
    if (slot.isLunch && builtItems.length > 0) {
      let lunchProt = builtItems.reduce((s, i) => s + i.protein, 0);
      if (lunchProt < minLunchProtein) {
        let pIdx = builtItems.findIndex((i) => i.role === "lunch_protein");
        if (pIdx === -1) {
          const boostFood = pickFromPool("lunch_protein", usedIds, seed);
          builtItems.unshift(buildPlanItem(boostFood, slot.key, slot.name, "lunch_protein", 200, false));
          pIdx = 0;
        }
        const pItem = builtItems[pIdx];
        const otherProt = builtItems.reduce((s, it, idx) => (idx === pIdx ? s : s + it.protein), 0);
        const neededProt = Math.max(0, minLunchProtein - otherProt);
        const { basis, isPiece } = extractNutrition(pItem.food);
        const protPerUnit = isPiece ? (basis.protein_g || 0) : (basis.protein_g || 0) / 100;
        if (protPerUnit > 0) {
          const reqQty = Math.ceil((neededProt / protPerUnit) / 5) * 5;
          if (!isPiece && reqQty <= 340) {
            builtItems[pIdx] = buildPlanItem(pItem.food, slot.key, slot.name, pItem.role, Math.max(pItem.amount, reqQty), pItem.isUserPick);
          } else {
            builtItems[pIdx] = buildPlanItem(pItem.food, slot.key, slot.name, pItem.role, isPiece ? 3 : 250, pItem.isUserPick);
            const afterProt = builtItems.reduce((s, it) => s + it.protein, 0);
            if (afterProt < minLunchProtein) {
              const boosterFood = state.foodById.get(151) || pickFromPool("lunch_protein", usedIds, seed + 3);
              const bProtPerG = (extractNutrition(boosterFood).basis.protein_g || 25) / 100;
              const bQty = Math.max(80, Math.ceil(((minLunchProtein - afterProt) / bProtPerG) / 5) * 5);
              builtItems.push(buildPlanItem(boosterFood, slot.key, slot.name, "lunch_protein", bQty, false));
            }
          }
        }
      }
    }
    mealGroups.push({ slot, items: builtItems });
  });

  const allBuilt = mealGroups.flatMap((g) => g.items);
  const currentTotalKcal = allBuilt.reduce((s, i) => s + i.calories, 0);
  const lockedKcal = allBuilt.filter((i) => i.slotKey === "lunch" && i.role === "lunch_protein").reduce((s, i) => s + i.calories, 0);
  const flexibleKcal = Math.max(1, currentTotalKcal - lockedKcal);
  const desiredFlexKcal = Math.max(200, metrics.targetCalories - lockedKcal);
  const flexScale = Math.min(1.65, Math.max(0.55, desiredFlexKcal / flexibleKcal));

  mealGroups.forEach((g) => {
    g.items = g.items.map((it) => {
      if ((it.slotKey === "lunch" && it.role === "lunch_protein") || it.role === "veggie_side") return it;
      const newAmt = it.isPiece ? it.amount * flexScale : Math.min(280, Math.max(25, it.amount * flexScale));
      return buildPlanItem(it.food, it.slotKey, it.meal, it.role, newAmt, it.isUserPick);
    });
  });

  const finalItems = mealGroups.flatMap((g) => g.items);
  const totals = computePlanTotals(finalItems);
  const lg = mealGroups.find((g) => g.slot.isLunch);
  const lunchProtein = lg ? Math.round(lg.items.reduce((s, i) => s + i.protein, 0)) : 0;
  const accuracy = Math.max(0, Math.min(100, Math.round(100 - (Math.abs(totals.calories - metrics.targetCalories) / Math.max(1, metrics.targetCalories)) * 100)));

  return { title, description, structure, minLunchProtein, lunchProtein, mealGroups, items: finalItems, totals, accuracy };
}

function generateDietPlans(silent = false) {
  if (!state.currentMetrics || !state.allFoods.length) return;
  const structure = document.getElementById("optMealStructure").value;
  const minLunchProtein = Number(document.getElementById("optLunchProtein").value) || 60;
  const dietStyle = document.getElementById("optDietStyle").value;
  const autoComplete = document.getElementById("optAutoComplete").checked;

  document.getElementById("plannerLunchMinHint").textContent = `${minLunchProtein}g+`;
  const chosenFoods = state.allFoods.filter((f) => state.selectedFoodIds.has(f.id));
  if (!chosenFoods.length && !autoComplete) {
    showToast(isAr() ? "اختر أكلات أولاً أو فعّل الإكمال التلقائي" : "Select foods first or enable Auto-Complete", "error");
    return;
  }

  const s = state.shuffleSeed;
  state.generatedPlans = [
    buildCohesivePlan({ title: tr("planTitle1"), description: tr("planDesc1"), selectedFoods: chosenFoods, metrics: state.currentMetrics, structure, minLunchProtein, style: dietStyle, autoComplete, seed: s }),
    buildCohesivePlan({ title: tr("planTitle2"), description: tr("planDesc2"), selectedFoods: chosenFoods, metrics: state.currentMetrics, structure, minLunchProtein: Math.max(minLunchProtein, 70), style: "high_protein", autoComplete: true, seed: s + 2 }),
    buildCohesivePlan({ title: tr("planTitle3"), description: tr("planDesc3"), selectedFoods: chosenFoods, metrics: state.currentMetrics, structure, minLunchProtein, style: "low_carb", autoComplete: true, seed: s + 4 }),
    buildCohesivePlan({ title: tr("planTitle4"), description: tr("planDesc4"), selectedFoods: chosenFoods, metrics: state.currentMetrics, structure, minLunchProtein, style: "budget", autoComplete: true, seed: s + 1 }),
  ];

  state.activePlanIndex = Math.min(state.activePlanIndex, state.generatedPlans.length - 1);
  document.getElementById("plansEmptyState").classList.add("hidden");
  document.getElementById("plansSection").classList.remove("hidden");
  renderActivePlan();
  if (!silent) showToast(isAr() ? `تم توليد 4 خطط متناسقة (بروتين الغداء +${minLunchProtein}g)!` : `Generated 4 cohesive meal plans (Lunch protein ${minLunchProtein}g+)!`);
}

function swapMealItem(groupIdx, itemIdx) {
  const plan = state.generatedPlans[state.activePlanIndex];
  if (!plan) return;
  const group = plan.mealGroups[groupIdx];
  const oldItem = group.items[itemIdx];
  if (!oldItem) return;

  const pool = getPoolFoods(oldItem.role);
  const currentIds = new Set(plan.mealGroups.flatMap((g) => g.items.map((i) => i.foodId)));
  const candidates = pool.filter((f) => f.id !== oldItem.foodId);
  const nextFood = candidates.find((f) => !currentIds.has(f.id)) || candidates[Math.floor(Math.random() * candidates.length)];
  if (!nextFood) return;

  const { basis, isPiece } = extractNutrition(nextFood);
  let newAmt = 120;
  if (group.slot.isLunch && oldItem.role === "lunch_protein" && (basis.protein_g || 0) > 0) {
    const protPerUnit = isPiece ? basis.protein_g : basis.protein_g / 100;
    newAmt = Math.ceil((Math.max(oldItem.protein, 35) / protPerUnit) / 5) * 5;
  } else {
    const kcalPerUnit = isPiece ? Math.max(25, basis.calories_kcal || 80) : Math.max(25, basis.calories_kcal || 100) / 100;
    newAmt = oldItem.calories / kcalPerUnit;
  }

  group.items[itemIdx] = buildPlanItem(nextFood, oldItem.slotKey, oldItem.meal, oldItem.role, newAmt, false);
  plan.items = plan.mealGroups.flatMap((g) => g.items);
  plan.totals = computePlanTotals(plan.items);
  const lg = plan.mealGroups.find((g) => g.slot.isLunch);
  plan.lunchProtein = lg ? Math.round(lg.items.reduce((s, i) => s + i.protein, 0)) : 0;
  plan.accuracy = Math.max(0, Math.min(100, Math.round(100 - (Math.abs(plan.totals.calories - state.currentMetrics.targetCalories) / Math.max(1, state.currentMetrics.targetCalories)) * 100)));

  renderActivePlan();
  showToast(isAr() ? `تم تبديل "${oldItem.name}" بـ "${foodPrimaryName(nextFood)}"` : `Swapped "${oldItem.name}" with "${foodPrimaryName(nextFood)}"`);
}

function renderActivePlan() {
  const plan = state.generatedPlans[state.activePlanIndex];
  if (!plan) return;

  const tabsEl = document.getElementById("planTabs");
  tabsEl.innerHTML = state.generatedPlans
    .map((p, idx) => `<button type="button" class="plan-tab-btn ${idx === state.activePlanIndex ? "active" : ""}" data-plan-idx="${idx}">${p.title}</button>`)
    .join("");
  tabsEl.querySelectorAll(".plan-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => { state.activePlanIndex = Number(btn.dataset.planIdx); renderActivePlan(); });
  });

  const cardsHtml = plan.mealGroups
    .map((group, gIdx) => {
      const mCals = Math.round(group.items.reduce((s, i) => s + i.calories, 0));
      const mProt = Math.round(group.items.reduce((s, i) => s + i.protein, 0));
      const mCarb = Math.round(group.items.reduce((s, i) => s + i.carbs, 0));
      const mFat = Math.round(group.items.reduce((s, i) => s + i.fat, 0));

      const lunchBadge = group.slot.isLunch
        ? `<span class="lunch-protein-verified">${tr("lunchVerifiedPrefix")} ${mProt}g (${tr("lunchTargetLabel")} ${plan.minLunchProtein}g+)</span>`
        : "";

      const rowsHtml = group.items
        .map(
          (it, iIdx) => `
          <div class="meal-row-item">
            ${imgTagHtml(it.food, "meal-thumb")}
            <div class="meal-item-info">
              <div class="meal-item-title-row">
                <strong>${it.name}</strong>
                <span class="origin-tag ${it.isUserPick ? "user" : "auto"}">${it.isUserPick ? tr("originUser") : tr("originAuto")}</span>
              </div>
              <small><span dir="ltr">${it.calories} kcal • P: ${it.protein}g • C: ${it.carbs}g • F: ${it.fat}g</span></small>
            </div>
            <div class="meal-item-right">
              <span class="meal-portion-tag">${it.amount} ${it.unit}</span>
              <button type="button" class="swap-item-btn" data-swap-g="${gIdx}" data-swap-i="${iIdx}" title="${tr("swapTitle")}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
              </button>
            </div>
          </div>`
        )
        .join("");

      return `
        <article class="meal-card ${group.slot.cls} ${group.slot.isLunch ? "meal-lunch-hero" : ""}">
          <div class="meal-card-head">
            <div class="meal-title-group">
              <span class="meal-slot-dot"></span>
              <div><h4>${group.slot.name}</h4><span class="meal-time-sub">${group.slot.time}</span></div>
            </div>
            <div class="meal-head-badges">
              <span class="meal-kcal-badge" dir="ltr">${mCals} kcal</span>
              ${lunchBadge}
            </div>
          </div>
          <div class="meal-macros-summary">
            <span class="mp">${tr("macroP")}: <b dir="ltr">${mProt}g</b></span>
            <span class="mc">${tr("macroC")}: <b dir="ltr">${mCarb}g</b></span>
            <span class="mf">${tr("macroF")}: <b dir="ltr">${mFat}g</b></span>
          </div>
          ${rowsHtml}
        </article>`;
    })
    .join("");

  document.getElementById("activePlanView").innerHTML = `
    <div class="plan-hero-summary">
      <div>
        <h3>${plan.title} • ${plan.accuracy}% ${tr("matchLabel")}</h3>
        <p>${plan.description}</p>
      </div>
      <div class="plan-totals-pills">
        <div class="pt-pill"><span>${tr("totalKcalLabel")}</span><strong dir="ltr">${Math.round(plan.totals.calories)} / ${state.currentMetrics.targetCalories}</strong></div>
        <div class="pt-pill"><span>${tr("dayProtLabel")}</span><strong dir="ltr">${Math.round(plan.totals.protein)}g</strong></div>
        <div class="pt-pill"><span>${tr("lunchProtStat")}</span><strong dir="ltr">${plan.lunchProtein}g ✓</strong></div>
        <div class="pt-pill"><span>${tr("carbFatStat")}</span><strong dir="ltr">${Math.round(plan.totals.carbs)}g / ${Math.round(plan.totals.fat)}g</strong></div>
      </div>
    </div>
    <div class="meals-grid-modern">${cardsHtml}</div>
  `;

  document.querySelectorAll("[data-swap-g]").forEach((btn) => {
    btn.addEventListener("click", () => swapMealItem(Number(btn.dataset.swapG), Number(btn.dataset.swapI)));
  });
}

// ==================== UI RENDERING ====================
function initTheme() { applyTheme(localStorage.getItem(STORAGE_KEYS.THEME) || "light"); }
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(STORAGE_KEYS.THEME, theme);
  document.querySelectorAll(".icon-moon").forEach((el) => el.classList.toggle("hidden", theme === "dark"));
  document.querySelectorAll(".icon-sun").forEach((el) => el.classList.toggle("hidden", theme !== "dark"));
}

function showScreen(name) {
  document.getElementById("authView").classList.toggle("hidden", name !== "auth");
  document.getElementById("onboardingView").classList.toggle("hidden", name !== "onboarding");
  document.getElementById("appShell").classList.toggle("hidden", name !== "app");
}

function showAuthAlert(msg, type = "error") {
  const box = document.getElementById("authAlert");
  box.textContent = msg;
  box.className = `inline-alert ${type}`;
  box.classList.remove("hidden");
}
function clearAuthAlert() { document.getElementById("authAlert").classList.add("hidden"); }

function switchAuthTab(tab) {
  clearAuthAlert();
  document.getElementById("tabLoginBtn").classList.toggle("active", tab === "login");
  document.getElementById("tabSignupBtn").classList.toggle("active", tab === "signup");
  document.getElementById("loginForm").classList.toggle("hidden", tab !== "login");
  document.getElementById("signupForm").classList.toggle("hidden", tab !== "signup");
  if (tab === "signup") {
    document.getElementById("signupStepDetails").classList.remove("hidden");
    document.getElementById("signupStepOtp").classList.add("hidden");
  }
}

function enterSession(user) {
  state.currentUser = user;
  state.selectedFoodIds = new Set(Array.isArray(user.selectedFoodIds) ? user.selectedFoodIds : []);
  persistCurrentUser(user);
  syncAdminUIVisibility();

  if (!user.onboardingComplete) {
    openOnboardingWizard(user);
    return;
  }

  showScreen("app");
  syncUserHeaderUI();
  syncCalculatorFormFromUser();
  recalculateAndRenderAll();
  renderCategoryPills();
  renderFoods();
  renderPlannerBasket();
  renderDiary();
  switchAppView("dashboard");
}

function setObCalMode(mode) {
  state.obCalMode = mode;
  document.querySelectorAll("[data-ob-cal-mode]").forEach((b) => b.classList.toggle("active", b.dataset.obCalMode === mode));
  document.getElementById("obManualWrap").classList.toggle("hidden", mode !== "manual");
  document.getElementById("obAutoFields").classList.toggle("hidden", mode === "manual");
  updateOnboardingLivePreview();
}

function setCalcCalMode(mode) {
  state.calcCalMode = mode;
  document.querySelectorAll("[data-calc-mode]").forEach((b) => b.classList.toggle("active", b.dataset.calcMode === mode));
  document.getElementById("calcManualPanel").classList.toggle("hidden", mode !== "manual");
  document.getElementById("calcAutoPanel").classList.toggle("hidden", mode === "manual");
}

function openOnboardingWizard(user) {
  showScreen("onboarding");
  document.getElementById("onboardingUserName").textContent = (user.name || "Friend").split(" ")[0];
  document.getElementById("onboardingUserIdChip").textContent = `ID: ${user.id}`;
  document.getElementById("obAge").value = user.age || 21;
  document.getElementById("obHeight").value = user.height || 175;
  document.getElementById("obWeight").value = user.weight || 75;
  document.getElementById("obActivity").value = String(user.activity || 1.55);
  document.getElementById("obManualCalories").value = user.manualCalories || 2200;
  document.getElementById("obMacroPreset").value = user.macroPreset || "balanced";
  setObCalMode(user.calorieMode || "auto");
}

function updateOnboardingLivePreview() {
  const m = calculateHealthMetrics({
    gender: document.querySelector('input[name="obGender"]:checked')?.value || "male",
    goal: document.querySelector('input[name="obGoal"]:checked')?.value || "maintain",
    height: Number(document.getElementById("obHeight").value),
    weight: Number(document.getElementById("obWeight").value),
    age: Number(document.getElementById("obAge").value),
    activity: Number(document.getElementById("obActivity").value),
    calorieMode: state.obCalMode,
    manualCalories: Number(document.getElementById("obManualCalories").value),
    macroPreset: document.getElementById("obMacroPreset").value,
  });
  document.getElementById("obPreviewBmi").textContent = m.bmi.toFixed(1);
  document.getElementById("obPreviewBmiCat").textContent = m.bmiLabel;
  document.getElementById("obPreviewKcal").textContent = `${m.targetCalories.toLocaleString("en-US")} kcal`;
}

function syncUserHeaderUI() {
  const u = state.currentUser;
  if (!u) return;
  const av = document.getElementById("navUserAvatar");
  if (u.picture) av.innerHTML = `<img src="${u.picture}" alt="${u.name}" />`;
  else av.textContent = (u.name || "U").trim().charAt(0).toUpperCase();

  document.getElementById("navUserName").textContent = u.name;
  document.getElementById("navUserId").textContent = u.id;
  document.getElementById("udFullName").textContent = u.name;
  document.getElementById("udEmail").textContent = u.email;
  document.getElementById("udUserId").textContent = `ID: ${u.id}`;
  document.getElementById("dashGreetingName").textContent = u.name.split(" ")[0] || u.name;
  document.getElementById("dashUserIdChip").textContent = `ID: ${u.id}`;
}

function syncCalculatorFormFromUser() {
  const u = state.currentUser;
  if (!u) return;
  document.getElementById("calcGender").value = u.gender || "male";
  document.getElementById("calcAge").value = u.age || 21;
  document.getElementById("calcWeight").value = u.weight || 75;
  document.getElementById("calcHeight").value = u.height || 175;
  document.getElementById("calcActivity").value = String(u.activity || 1.55);
  document.getElementById("calcGoal").value = u.goal || "maintain";
  document.getElementById("calcManualCalories").value = u.manualCalories || 2200;
  document.getElementById("calcMacroPreset").value = u.macroPreset || "balanced";
  setCalcCalMode(u.calorieMode || "auto");
}

function recalculateAndRenderAll() {
  const u = state.currentUser;
  if (!u) return;
  const m = calculateHealthMetrics({
    gender: u.gender, age: u.age, weight: u.weight, height: u.height,
    activity: u.activity, goal: u.goal,
    calorieMode: u.calorieMode || "auto",
    manualCalories: u.manualCalories || 2200,
    macroPreset: u.macroPreset || "balanced",
  });
  state.currentMetrics = m;

  document.getElementById("dashGoalChip").textContent = `${tr("goalChipPrefix")} ${goalLabel(u.goal)}`;
  document.getElementById("dashCalModeChip").textContent = m.calorieMode === "manual" ? tr("calModeManualChip") : tr("calModeAutoChip");
  document.getElementById("macrosModeBadge").textContent = m.calorieMode === "manual" ? `${tr("modeBadgeManual")} (${m.presetLabel})` : tr("modeBadgeAuto");

  document.getElementById("resBmi").textContent = m.bmi.toFixed(1);
  const bmiBadge = document.getElementById("resBmiBadge");
  bmiBadge.textContent = m.bmiLabel;
  bmiBadge.className = `status-pill ${m.bmiClass}`;
  document.getElementById("bmiMarker").style.left = `${m.bmiMarkerPct}%`;
  document.getElementById("resIdealWeight").textContent = `${m.idealMin} – ${m.idealMax} ${tr("kgUnit")}`;

  document.getElementById("resTargetCalories").textContent = m.targetCalories.toLocaleString("en-US");
  document.getElementById("resGoalDelta").textContent = m.goalDeltaText;
  document.getElementById("plannerTargetHint").textContent = `${m.targetCalories.toLocaleString("en-US")} kcal`;

  document.getElementById("resTdee").textContent = m.tdee.toLocaleString("en-US");
  document.getElementById("resBmr").textContent = `${m.bmr.toLocaleString("en-US")} kcal`;
  document.getElementById("resActivityFactor").textContent = `×${m.activityFactor}`;

  document.getElementById("resWaterLiters").textContent = m.waterLiters.toFixed(1);
  document.getElementById("dashWaterTargetCups").textContent = m.waterCups;
  document.getElementById("resFiberTarget").textContent = `${m.fiberGrams}g`;

  document.getElementById("donutCalories").textContent = m.targetCalories.toLocaleString("en-US");
  document.getElementById("outProtein").textContent = `${m.proteinGrams}g`;
  document.getElementById("outProteinPct").textContent = `${m.proteinPct}%`;
  document.getElementById("outProteinKcal").textContent = `${m.proteinKcal} ${tr("proteinHint")}`;
  document.getElementById("barProtein").style.width = `${m.proteinPct}%`;

  document.getElementById("outCarbs").textContent = `${m.carbsGrams}g`;
  document.getElementById("outCarbsPct").textContent = `${m.carbsPct}%`;
  document.getElementById("outCarbsKcal").textContent = `${m.carbsKcal} ${tr("carbsHint")}`;
  document.getElementById("barCarbs").style.width = `${m.carbsPct}%`;

  document.getElementById("outFat").textContent = `${m.fatGrams}g`;
  document.getElementById("outFatPct").textContent = `${m.fatPct}%`;
  document.getElementById("outFatKcal").textContent = `${m.fatKcal} ${tr("fatHint")}`;
  document.getElementById("barFat").style.width = `${m.fatPct}%`;

  const C = 439.82;
  const pLen = (m.proteinPct / 100) * C;
  const cLen = (m.carbsPct / 100) * C;
  const fLen = (m.fatPct / 100) * C;
  document.getElementById("donutProtein").setAttribute("stroke-dasharray", `${pLen} ${C}`);
  document.getElementById("donutCarbs").setAttribute("stroke-dasharray", `${cLen} ${C}`);
  document.getElementById("donutCarbs").setAttribute("stroke-dashoffset", `${-pLen}`);
  document.getElementById("donutFat").setAttribute("stroke-dasharray", `${fLen} ${C}`);
  document.getElementById("donutFat").setAttribute("stroke-dashoffset", `${-(pLen + cLen)}`);

  syncDiaryWidgets();
}

function switchAppView(viewName) {
  state.activeView = viewName;
  document.querySelectorAll(".app-view").forEach((s) => s.classList.toggle("hidden", s.id !== `view-${viewName}`));
  document.querySelectorAll(".nav-tab").forEach((b) => b.classList.toggle("active", b.dataset.view === viewName));
  updateSelectionDock();
  if (viewName === "planner") renderPlannerBasket();
  if (viewName === "diary") renderDiary();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ==================== FOODS EXPLORER ====================
function renderCategoryPills() {
  const container = document.getElementById("categoryPills");
  const counts = {};
  state.allFoods.forEach((f) => { counts[f.category] = (counts[f.category] || 0) + 1; });

  container.innerHTML = [
    `<button type="button" class="cat-pill ${state.activeCategory === "ALL" ? "active" : ""}" data-cat="ALL">${tr("catAll")} <span>(${state.allFoods.length})</span></button>`,
    ...state.categories.map((cat) => `<button type="button" class="cat-pill ${state.activeCategory === cat ? "active" : ""}" data-cat="${cat}">${categoryLabel(cat)} <span>(${counts[cat] || 0})</span></button>`),
  ].join("");

  container.querySelectorAll(".cat-pill").forEach((btn) => {
    btn.addEventListener("click", () => { state.activeCategory = btn.dataset.cat; renderCategoryPills(); renderFoods(); });
  });
}

function renderFoods() {
  const grid = document.getElementById("foodsGrid");
  const q = state.searchQuery.trim().toLowerCase();

  let list = state.allFoods.filter((food) => {
    if (state.activeCategory !== "ALL" && food.category !== state.activeCategory) return false;
    if (!q) return true;
    return (
      (food.name_ar || "").toLowerCase().includes(q) ||
      (food.name_en || "").toLowerCase().includes(q) ||
      (food.category || "").toLowerCase().includes(q) ||
      categoryLabel(food.category).toLowerCase().includes(q)
    );
  });

  if (state.sortBy !== "default") {
    list = [...list].sort((a, b) => {
      const na = extractNutrition(a).basis;
      const nb = extractNutrition(b).basis;
      if (state.sortBy === "protein_desc") return (nb.protein_g || 0) - (na.protein_g || 0);
      if (state.sortBy === "cal_asc") return (na.calories_kcal || 0) - (nb.calories_kcal || 0);
      if (state.sortBy === "cal_desc") return (nb.calories_kcal || 0) - (na.calories_kcal || 0);
      if (state.sortBy === "carbs_asc") return (na.carbs_g || 0) - (nb.carbs_g || 0);
      if (state.sortBy === "selected_first") return (state.selectedFoodIds.has(b.id) ? 1 : 0) - (state.selectedFoodIds.has(a.id) ? 1 : 0);
      return 0;
    });
  }

  document.getElementById("navFoodsTotal").textContent = state.allFoods.length;
  document.getElementById("foodsCountText").textContent = tr("foodsCountFmt")(list.length, state.allFoods.length);

  if (!list.length) {
    grid.innerHTML = `<div class="surface-card empty-state-card" style="grid-column:1/-1;"><h3>${tr("noFoodsFound")}</h3><p>${tr("noFoodsSub")}</p></div>`;
    return;
  }

  const isAdmin = isAdminUser();
  const editPhotoText = isAr() ? "📷 تعديل الصورة" : "📷 Edit Photo";
  const fragment = document.createDocumentFragment();
  list.forEach((food) => {
    const { basis, unitLabel } = extractNutrition(food);
    const isSelected = state.selectedFoodIds.has(food.id);
    const card = document.createElement("article");
    card.className = `food-card-modern ${isSelected ? "selected" : ""}`;
    card.innerHTML = `
      <div class="fc-media" data-open-modal="${food.id}">
        ${imgTagHtml(food)}
        <div class="fc-media-gradient"></div>
        ${isAdmin ? `<button type="button" class="fc-admin-photo-btn" data-admin-photo="${food.id}">${editPhotoText}</button>` : ""}
        <span class="fc-kcal-pill" dir="ltr">${basis.calories_kcal} kcal / ${unitLabel}</span>
        <button type="button" class="fc-select-fab" data-toggle-food="${food.id}">${isSelected ? "✓" : "+"}</button>
      </div>
      <div class="fc-body">
        <div class="fc-titles" data-open-modal="${food.id}">
          <div class="fc-title-ar">${foodPrimaryName(food)}</div>
          <div class="fc-title-en">${foodSecondaryName(food)}</div>
        </div>
        <div class="fc-macros-strip">
          <div class="fc-macro-chip p"><span>${tr("macroP")}</span><strong>${basis.protein_g}g</strong></div>
          <div class="fc-macro-chip c"><span>${tr("macroC")}</span><strong>${basis.carbs_g}g</strong></div>
          <div class="fc-macro-chip f"><span>${tr("macroF")}</span><strong>${basis.fat_g}g</strong></div>
        </div>
        <div class="fc-actions">
          <button type="button" class="fc-btn ${isSelected ? "active" : ""}" data-toggle-food="${food.id}">${isSelected ? tr("btnInPlan") : tr("btnAddPlan")}</button>
          <button type="button" class="fc-btn log" data-open-modal="${food.id}">${tr("btnLogToday")}</button>
        </div>
      </div>
    `;
    fragment.appendChild(card);
  });

  grid.innerHTML = "";
  grid.appendChild(fragment);

  grid.querySelectorAll("[data-admin-photo]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const f = state.foodById.get(Number(btn.dataset.adminPhoto));
      if (f) openAdminPhotoModal(f);
    });
  });
  grid.querySelectorAll("[data-toggle-food]").forEach((btn) => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); toggleFoodSelection(Number(btn.dataset.toggleFood)); });
  });
  grid.querySelectorAll("[data-open-modal]").forEach((el) => {
    el.addEventListener("click", () => { const f = state.foodById.get(Number(el.dataset.openModal)); if (f) openFoodModal(f); });
  });
  updateSelectionDock();
}

function toggleFoodSelection(foodId) {
  if (state.selectedFoodIds.has(foodId)) state.selectedFoodIds.delete(foodId);
  else state.selectedFoodIds.add(foodId);
  if (state.currentUser) {
    state.currentUser.selectedFoodIds = [...state.selectedFoodIds];
    persistCurrentUser();
  }
  renderFoods();
  renderPlannerBasket();
  updateSelectionDock();
}

function updateSelectionDock() {
  const count = state.selectedFoodIds.size;
  document.getElementById("navSelectedBadge").textContent = count;
  document.getElementById("selectedCount").textContent = count;
  document.getElementById("dockSelectedCount").textContent = count;
  const dock = document.getElementById("selectionDock");
  if (count > 0 && state.activeView === "foods") {
    dock.classList.remove("hidden");
    const names = state.allFoods.filter((f) => state.selectedFoodIds.has(f.id)).slice(0, 4).map((f) => foodPrimaryName(f)).join(" • ");
    document.getElementById("dockPreviewNames").textContent = count > 4 ? `${names} +${count - 4}` : names;
  } else {
    dock.classList.add("hidden");
  }
}

function renderPlannerBasket() {
  const container = document.getElementById("selectedChipsContainer");
  const chosen = state.allFoods.filter((f) => state.selectedFoodIds.has(f.id));
  document.getElementById("selectedCount").textContent = chosen.length;
  document.getElementById("navSelectedBadge").textContent = chosen.length;

  if (!chosen.length) {
    container.innerHTML = `<p class="empty-inline">${tr("basketEmpty")}</p>`;
    return;
  }

  container.innerHTML = chosen
    .map((f) => `<span class="food-chip-removable">${imgTagHtml(f)}<span>${foodPrimaryName(f)}</span><button type="button" data-remove-chip="${f.id}">×</button></span>`)
    .join("");
  container.querySelectorAll("[data-remove-chip]").forEach((btn) => {
    btn.addEventListener("click", () => toggleFoodSelection(Number(btn.dataset.removeChip)));
  });
}

// ==================== FOOD MODAL & DIARY ====================
function openFoodModal(food) {
  state.modalFood = food;
  const { unitDisplay, isPiece, baseQty } = extractNutrition(food);
  const imgEl = document.getElementById("fmImage");
  imgEl.src = getFoodImage(food);
  imgEl.onerror = () => { imgEl.onerror = null; imgEl.src = getFoodFallbackImage(food); };
  document.getElementById("fmCategory").textContent = categoryLabel(food.category);
  document.getElementById("fmNameAr").textContent = foodPrimaryName(food);
  document.getElementById("fmNameEn").textContent = foodSecondaryName(food);
  document.getElementById("fmUnitLabel").textContent = unitDisplay;

  const amt = document.getElementById("fmAmount");
  amt.value = isPiece ? 1 : baseQty;
  amt.step = isPiece ? "0.5" : "10";
  amt.min = isPiece ? "0.5" : "5";

  const presets = isPiece ? [0.5, 1, 2, 3] : [50, 100, 150, 200, 250];
  const qp = document.getElementById("fmQuickPortions");
  qp.innerHTML = presets.map((v) => `<button type="button" class="quick-portion-chip" data-qty="${v}">${v} ${unitDisplay}</button>`).join("");
  qp.querySelectorAll(".quick-portion-chip").forEach((b) => b.addEventListener("click", () => { amt.value = b.dataset.qty; updateFoodModalCalc(); }));

  document.getElementById("fmTogglePlanBtn").textContent = state.selectedFoodIds.has(food.id) ? tr("btnRemPlanModal") : tr("btnAddPlanModal");
  updateFoodModalCalc();
  document.getElementById("foodModal").classList.remove("hidden");
}

function updateFoodModalCalc() {
  if (!state.modalFood) return;
  const { basis, isPiece } = extractNutrition(state.modalFood);
  const qty = Math.max(0.5, Number(document.getElementById("fmAmount").value) || 0);
  const factor = isPiece ? qty : qty / 100;
  document.getElementById("fmCalcKcal").textContent = Math.round((basis.calories_kcal || 0) * factor);
  document.getElementById("fmCalcProt").textContent = `${Math.round((basis.protein_g || 0) * factor * 10) / 10}g`;
  document.getElementById("fmCalcCarbs").textContent = `${Math.round((basis.carbs_g || 0) * factor * 10) / 10}g`;
  document.getElementById("fmCalcFat").textContent = `${Math.round((basis.fat_g || 0) * factor * 10) / 10}g`;
  document.getElementById("fmCalcFiber").textContent = `${Math.round((basis.fiber_g || 0) * factor * 10) / 10}g`;
}

function logItemToDiary(entry) {
  const diary = getTodayDiary();
  diary.items.push({ uid: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, ...entry, meal: normalizeDiaryMealKey(entry.meal) });
  persistCurrentUser();
  syncDiaryWidgets();
  if (state.activeView === "diary") renderDiary();
}

function adjustWater(delta) {
  const diary = getTodayDiary();
  diary.waterCups = Math.max(0, Math.min(30, (diary.waterCups || 0) + delta));
  persistCurrentUser();
  syncDiaryWidgets();
}

function syncDiaryWidgets() {
  const m = state.currentMetrics;
  if (!m) return;
  const diary = getTodayDiary();
  const totals = diary.items.reduce(
    (a, it) => ({ calories: a.calories + it.calories, protein: a.protein + it.protein, carbs: a.carbs + it.carbs, fat: a.fat + it.fat }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
  const pct = Math.min(100, Math.round((totals.calories / Math.max(1, m.targetCalories)) * 100));
  document.getElementById("navDiaryPct").textContent = `${pct}%`;
  document.getElementById("dashCalRing").setAttribute("stroke-dashoffset", String(201 - (201 * pct) / 100));
  document.getElementById("dashCalRingPct").textContent = `${pct}%`;
  document.getElementById("dashConsumedKcal").textContent = `${Math.round(totals.calories)} kcal`;
  document.getElementById("dashWaterCups").textContent = diary.waterCups || 0;

  document.getElementById("diaryCalRing").setAttribute("stroke-dashoffset", String(364.4 - (364.4 * pct) / 100));
  document.getElementById("diaryConsumedVal").textContent = Math.round(totals.calories).toLocaleString("en-US");
  document.getElementById("diaryTargetVal").textContent = m.targetCalories.toLocaleString("en-US");
  const rem = m.targetCalories - Math.round(totals.calories);
  document.getElementById("diaryRemainingText").textContent = rem >= 0 ? `${tr("remainingPrefix")} ${rem} kcal` : `${tr("overPrefix")} ${Math.abs(rem)} kcal`;

  document.getElementById("diaryProtCur").textContent = Math.round(totals.protein);
  document.getElementById("diaryProtTarget").textContent = m.proteinGrams;
  document.getElementById("diaryProtFill").style.width = `${Math.min(100, Math.round((totals.protein / Math.max(1, m.proteinGrams)) * 100))}%`;

  document.getElementById("diaryCarbCur").textContent = Math.round(totals.carbs);
  document.getElementById("diaryCarbTarget").textContent = m.carbsGrams;
  document.getElementById("diaryCarbFill").style.width = `${Math.min(100, Math.round((totals.carbs / Math.max(1, m.carbsGrams)) * 100))}%`;

  document.getElementById("diaryFatCur").textContent = Math.round(totals.fat);
  document.getElementById("diaryFatTarget").textContent = m.fatGrams;
  document.getElementById("diaryFatFill").style.width = `${Math.min(100, Math.round((totals.fat / Math.max(1, m.fatGrams)) * 100))}%`;

  document.getElementById("diaryWaterCur").textContent = diary.waterCups || 0;
  document.getElementById("diaryWaterTarget").textContent = m.waterCups;
}

function renderDiary() {
  syncDiaryWidgets();
  const diary = getTodayDiary();
  document.getElementById("diaryDateLabel").textContent = new Date().toLocaleDateString(isAr() ? "ar-EG" : "en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const grid = document.getElementById("diaryMealsGrid");
  grid.innerHTML = DIARY_SLOT_KEYS.map((slotKey) => {
    const label = mealDisplayName(slotKey);
    const items = diary.items.filter((i) => normalizeDiaryMealKey(i.meal) === slotKey);
    const mealCals = Math.round(items.reduce((s, i) => s + i.calories, 0));
    const body = !items.length
      ? `<p class="empty-inline" style="padding:10px 0;">${tr("diaryEmptyMeal")} ${label}.</p>`
      : items
          .map((it) => {
            const fObj = state.foodById.get(it.foodId);
            const displayName = fObj ? foodPrimaryName(fObj) : it.name;
            return `
              <div class="meal-row-item">
                <img class="meal-thumb" src="${it.image}" alt="${displayName}" onerror="this.onerror=null;this.src='./images/ful_medames.jpg';" />
                <div class="meal-item-info">
                  <strong>${displayName}</strong>
                  <small>${it.amount} ${it.unit} — <span dir="ltr">${it.calories} kcal • P: ${it.protein}g • C: ${it.carbs}g • F: ${it.fat}g</span></small>
                </div>
                <button type="button" class="diary-delete-btn" data-del-diary="${it.uid}">×</button>
              </div>`;
          })
          .join("");
    return `<div class="meal-card"><div class="meal-card-head"><h4>${label}</h4><span class="meal-kcal-badge" dir="ltr">${mealCals} kcal</span></div>${body}</div>`;
  }).join("");

  grid.querySelectorAll("[data-del-diary]").forEach((btn) => {
    btn.addEventListener("click", () => {
      diary.items = diary.items.filter((i) => i.uid !== btn.dataset.delDiary);
      persistCurrentUser();
      renderDiary();
      showToast(isAr() ? "تم حذف الصنف من اليوميات" : "Removed item from today's log");
    });
  });
}

// ==================== SETTINGS MODAL & ADMIN PHOTO EDITOR ====================
function openSettingsModal() {
  document.getElementById("currentOriginDisplay").textContent = window.location.origin;
  document.getElementById("cfgGoogleClientId").value = state.config.googleClientId || "";
  document.getElementById("cfgSmtpEmail").value = state.config.smtpEmail || "";
  document.getElementById("cfgSmtpAppPass").value = "";
  document.getElementById("cfgEjsService").value = state.config.emailjsServiceId || "";
  document.getElementById("cfgEjsTemplate").value = state.config.emailjsTemplateId || "";
  document.getElementById("cfgEjsPublic").value = state.config.emailjsPublicKey || "";
  document.getElementById("settingsModal").classList.remove("hidden");
}
function closeSettingsModal() { document.getElementById("settingsModal").classList.add("hidden"); }

function updateAdminPhotoPreview(val) {
  const img = document.getElementById("apmPreviewImg");
  const noBox = document.getElementById("apmNoPhotoBox");
  if (!val || val === "__REMOVED__") {
    img.classList.add("hidden");
    noBox.classList.remove("hidden");
    noBox.textContent = isAr() ? "تم حذف الصورة (بدون صورة حالياً)" : "Photo Removed (No Photo Set)";
  } else {
    noBox.classList.add("hidden");
    img.classList.remove("hidden");
    img.src = val;
  }
}

function openAdminPhotoModal(food) {
  if (!isAdminUser()) return;
  state.adminPhotoTargetFood = food;
  const currentImg = getFoodImage(food);
  const isRemoved =
    state.customFoodPhotos?.[food.id] === "__REMOVED__" ||
    food.photo_url === "__REMOVED__" ||
    currentImg === REMOVED_PHOTO_PLACEHOLDER;

  state.adminPendingPhotoValue = isRemoved ? "__REMOVED__" : currentImg;

  document.getElementById("apmFoodTitle").textContent = `${food.name_ar || ""} — ${food.name_en || ""}`;
  document.getElementById("apmFoodSub").textContent = isAr()
    ? "ارفع صورة جديدة من جهازك، أو الصق رابط صورة مباشر، أو احذف الصورة الحالية."
    : "Upload a new photo from your device, paste a direct image URL, or remove the current photo.";
  document.getElementById("apmLblUpload").textContent = isAr()
    ? "1. رفع صورة من جهازك (كمبيوتر أو موبايل)"
    : "1. Upload Photo from Your Device (PC / Mobile)";
  document.getElementById("apmUploadBtnText").textContent = isAr()
    ? "📁 اضغط لاختيار صورة من جهازك (.jpg, .png, .webp)"
    : "📁 Click to choose an image file (.jpg, .png, .webp)";
  document.getElementById("apmLblUrl").textContent = isAr()
    ? "2. أو الصق رابط صورة مباشر (Image URL)"
    : "2. Or Paste Direct Image URL";
  document.getElementById("adminSavePhotoBtn").textContent = isAr() ? "💾 حفظ الصورة" : "💾 Save Photo";
  document.getElementById("adminRemovePhotoBtn").textContent = isAr() ? "🗑️ شيل / حذف الصورة الحالية" : "🗑️ Remove Current Photo";

  const urlInp = document.getElementById("adminPhotoUrlInput");
  urlInp.value = !isRemoved && !currentImg.startsWith("data:") ? currentImg : "";
  document.getElementById("adminPhotoFileInput").value = "";

  updateAdminPhotoPreview(state.adminPendingPhotoValue);
  document.getElementById("adminPhotoModal").classList.remove("hidden");
}

function closeAdminPhotoModal() {
  document.getElementById("adminPhotoModal").classList.add("hidden");
  state.adminPhotoTargetFood = null;
}

function compressImageFileToDataUrl(file, maxW = 640, maxH = 480, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxW || h > maxH) {
          const ratio = Math.min(maxW / w, maxH / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function applyAndSaveAdminPhoto(newPhotoValue) {
  const food = state.adminPhotoTargetFood;
  if (!food || !isAdminUser()) return;

  let finalPhotoUrl = newPhotoValue || "__REMOVED__";

  // 1. Save to local server files automatically if backend is running
  if (state.backendOnline) {
    try {
      const res = await fetch(`${state.backendBaseUrl}/api/admin/food-photo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminEmail: state.currentUser.email,
          foodId: food.id,
          photoUrl: finalPhotoUrl,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.savedPhotoUrl) finalPhotoUrl = data.savedPhotoUrl;
      }
    } catch {}
  }

  // Broadcast photo URL / removal to cloud so all users on GitHub Pages see it automatically
  if (!finalPhotoUrl.startsWith("data:") || finalPhotoUrl.length < 3800) {
    try {
      fetch(`https://ntfy.sh/${CLOUD_PHOTOS_TOPIC}`, {
        method: "POST",
        body: JSON.stringify({ foodId: food.id, photoUrl: finalPhotoUrl }),
      });
    } catch {}
  }

  // 2. Update in-memory food object & localStorage overrides immediately
  food.photo_url = finalPhotoUrl;
  food.image_url = finalPhotoUrl;
  state.customFoodPhotos[food.id] = finalPhotoUrl;
  try {
    localStorage.setItem(STORAGE_KEYS.CUSTOM_FOOD_PHOTOS, JSON.stringify(state.customFoodPhotos));
  } catch {}

  // 3. Refresh UI immediately
  renderFoods();
  renderPlannerBasket();
  if (state.generatedPlans.length > 0) renderActivePlan();
  if (state.modalFood && state.modalFood.id === food.id) {
    document.getElementById("fmImage").src = getFoodImage(food);
  }

  closeAdminPhotoModal();
  showToast(
    finalPhotoUrl === "__REMOVED__"
      ? isAr()
        ? `تم حذف صورة "${foodPrimaryName(food)}" بنجاح!`
        : `Removed photo for "${foodPrimaryName(food)}"!`
      : isAr()
      ? `✓ تم تحديث وحفظ صورة "${foodPrimaryName(food)}"!`
      : `✓ Saved new photo for "${foodPrimaryName(food)}"!`
  );
}

function exportUpdatedFoodsDataJs() {
  if (!isAdminUser()) return;
  const dbOut = {
    metadata: window.BITEWISE_FOOD_DB?.metadata || { total_items: state.allFoods.length, categories: state.categories },
    foods: state.allFoods.map((f) => {
      const custom = state.customFoodPhotos?.[f.id];
      const finalImg = custom !== undefined ? custom : f.photo_url || f.image_url;
      return { ...f, photo_url: finalImg, image_url: finalImg };
    }),
  };
  const jsContent = "window.BITEWISE_FOOD_DB = " + JSON.stringify(dbOut, null, 2) + ";\n";
  const blob = new Blob([jsContent], { type: "application/javascript;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "foods-data.js";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast(isAr() ? "تم تحميل ملف foods-data.js المحدث بجميع صورك الجديدة!" : "Downloaded updated foods-data.js with all your photo changes!");
}

// ==================== DATABASE INIT ====================
async function initDatabase() {
  let data = null;
  if (window.BITEWISE_FOOD_DB?.foods) data = window.BITEWISE_FOOD_DB;
  else {
    try { const r = await fetch(DB_JSON_PATH); if (r.ok) data = await r.json(); } catch {}
  }
  if (data && Array.isArray(data.foods)) {
    state.allFoods = data.foods;
    state.foodById = new Map(data.foods.map((f) => [f.id, f]));
    state.categories = data.metadata?.categories || [...new Set(data.foods.map((f) => f.category))];

    // Pull any live photo edits made by Admin from Cloud Sync
    try {
      const r = await fetch(`https://ntfy.sh/${CLOUD_PHOTOS_TOPIC}/json?poll=1&since=all`, { cache: "no-store" });
      if (r.ok) {
        const txt = await r.text();
        txt.split(/\r?\n/).forEach((line) => {
          if (!line.trim()) return;
          try {
            const env = JSON.parse(line);
            if (env.event === "message" && env.message) {
              const p = JSON.parse(env.message);
              if (p && p.foodId && p.photoUrl) {
                state.customFoodPhotos[p.foodId] = p.photoUrl;
                const fObj = state.foodById.get(Number(p.foodId));
                if (fObj) { fObj.photo_url = p.photoUrl; fObj.image_url = p.photoUrl; }
              }
            }
          } catch {}
        });
        localStorage.setItem(STORAGE_KEYS.CUSTOM_FOOD_PHOTOS, JSON.stringify(state.customFoodPhotos));
      }
    } catch {}

    renderCategoryPills();
    renderFoods();
    renderPlannerBasket();
  }
}

// ==================== EVENT BINDINGS ====================
function bindAllEvents() {
  // Language toggles (Auth + App)
  const toggleLang = () => applyLanguage(isAr() ? "en" : "ar");
  document.getElementById("authLangBtn").addEventListener("click", toggleLang);
  document.getElementById("navLangBtn").addEventListener("click", toggleLang);

  // Theme toggles
  const toggleTheme = () => applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
  document.getElementById("themeToggleBtn").addEventListener("click", toggleTheme);
  document.getElementById("authThemeBtn").addEventListener("click", toggleTheme);

  // Settings Modal
  document.getElementById("authSettingsBtn").addEventListener("click", openSettingsModal);
  document.getElementById("openSettingsBtn").addEventListener("click", openSettingsModal);
  document.getElementById("openSmtpFromOtp").addEventListener("click", openSettingsModal);
  document.getElementById("closeSettingsModal").addEventListener("click", closeSettingsModal);
  document.getElementById("settingsModal").addEventListener("click", (e) => { if (e.target.id === "settingsModal") closeSettingsModal(); });

  // Admin Food Photo Editor Modal (alio2sama21@gmail.com)
  document.getElementById("closeAdminPhotoModal")?.addEventListener("click", closeAdminPhotoModal);
  document.getElementById("adminPhotoModal")?.addEventListener("click", (e) => {
    if (e.target.id === "adminPhotoModal") closeAdminPhotoModal();
  });
  document.getElementById("fmAdminPhotoBtn")?.addEventListener("click", () => {
    if (state.modalFood) openAdminPhotoModal(state.modalFood);
  });
  document.getElementById("adminExportFoodsJsBtn")?.addEventListener("click", exportUpdatedFoodsDataJs);

  document.getElementById("adminPhotoFileInput")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageFileToDataUrl(file);
      state.adminPendingPhotoValue = dataUrl;
      document.getElementById("adminPhotoUrlInput").value = "";
      updateAdminPhotoPreview(dataUrl);
      document.getElementById("apmUploadBtnText").textContent = `✓ ${file.name}`;
    } catch {
      showToast(isAr() ? "تعذر قراءة ملف الصورة" : "Could not read image file", "error");
    }
  });

  document.getElementById("adminPhotoUrlInput")?.addEventListener("input", (e) => {
    const val = e.target.value.trim();
    if (val) {
      state.adminPendingPhotoValue = val;
      updateAdminPhotoPreview(val);
    }
  });

  document.getElementById("adminRemovePhotoBtn")?.addEventListener("click", async () => {
    state.adminPendingPhotoValue = "__REMOVED__";
    document.getElementById("adminPhotoUrlInput").value = "";
    updateAdminPhotoPreview("__REMOVED__");
    await applyAndSaveAdminPhoto("__REMOVED__");
  });

  document.getElementById("adminSavePhotoBtn")?.addEventListener("click", async () => {
    const typedUrl = document.getElementById("adminPhotoUrlInput").value.trim();
    const toSave = typedUrl || state.adminPendingPhotoValue || "__REMOVED__";
    await applyAndSaveAdminPhoto(toSave);
  });

  document.getElementById("settingsForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      googleClientId: document.getElementById("cfgGoogleClientId").value.trim(),
      smtpEmail: document.getElementById("cfgSmtpEmail").value.trim(),
      smtpAppPassword: document.getElementById("cfgSmtpAppPass").value.trim(),
      emailjsServiceId: document.getElementById("cfgEjsService").value.trim(),
      emailjsTemplateId: document.getElementById("cfgEjsTemplate").value.trim(),
      emailjsPublicKey: document.getElementById("cfgEjsPublic").value.trim(),
    };
    state.config = { ...state.config, ...payload };
    delete state.config.smtpAppPassword;
    localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(state.config));

    if (state.backendOnline) {
      try {
        const res = await fetch("/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (res.ok) state.smtpConfigured = Boolean((await res.json()).smtpConfigured);
      } catch {}
    }
    closeSettingsModal();
    showToast(isAr() ? "تم حفظ وتفعيل الإعدادات!" : "Settings saved and activated!");
  });

  document.getElementById("testOtpEmailBtn").addEventListener("click", async () => {
    const targetEmail = document.getElementById("cfgSmtpEmail").value.trim() || state.config.smtpEmail;
    if (!targetEmail) {
      showToast(isAr() ? "اكتب إيميل Gmail واضغط حفظ أولاً" : "Enter a Gmail address and save first", "error");
      return;
    }
    const btn = document.getElementById("testOtpEmailBtn");
    btn.disabled = true;
    try {
      const res = await sendGmailOtp(targetEmail, "BiteWise Test");
      if (res.deliveredVia === "gmail_smtp" || res.deliveredVia === "emailjs") {
        showToast(isAr() ? `✓ تم إرسال كود OTP حقيقي إلى ${targetEmail}!` : `✓ Real OTP sent to ${targetEmail}! Check Gmail.`);
      } else {
        showToast(`Fallback mode (${res.reason || "Check SMTP/EmailJS keys"})`, "error");
      }
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      btn.disabled = false;
    }
  });

  // Auth
  document.getElementById("tabLoginBtn").addEventListener("click", () => switchAuthTab("login"));
  document.getElementById("tabSignupBtn").addEventListener("click", () => switchAuthTab("signup"));
  document.querySelectorAll("[data-toggle-pass]").forEach((btn) => {
    btn.addEventListener("click", () => { const inp = document.getElementById(btn.dataset.togglePass); inp.type = inp.type === "password" ? "text" : "password"; });
  });
  document.getElementById("signupPassword").addEventListener("input", (e) => {
    const v = e.target.value;
    const bar = document.getElementById("passStrengthBar");
    let s = 0;
    if (v.length >= 4) s += 30;
    if (v.length >= 7) s += 30;
    if (/[A-Z0-9]/.test(v)) s += 20;
    if (/[^A-Za-z0-9]/.test(v)) s += 20;
    bar.style.width = `${s}%`;
    bar.style.background = s < 40 ? "#e11d48" : s < 75 ? "#f59e0b" : "#10b981";
  });

  document.getElementById("googleLoginBtn").addEventListener("click", triggerRealGoogleSignIn);
  document.getElementById("googleSignupBtn").addEventListener("click", triggerRealGoogleSignIn);

  document.getElementById("loginForm").addEventListener("submit", (e) => {
    e.preventDefault();
    clearAuthAlert();
    const idOrName = document.getElementById("loginIdentifier").value.trim().toLowerCase();
    const pass = document.getElementById("loginPassword").value;
    const user = state.users.find(
      (u) => (u.id || "").toLowerCase() === idOrName || (u.name || "").trim().toLowerCase() === idOrName || (u.email || "").trim().toLowerCase() === idOrName
    );
    if (!user) { showAuthAlert(isAr() ? "لم يتم العثور على حساب بهذا الـ ID أو الاسم أو البريد." : "No account found with that ID, Name, or Email."); return; }
    if (user.provider === "local" && user.password !== pass) { showAuthAlert(isAr() ? "كلمة المرور غير صحيحة." : "Incorrect password."); return; }
    showToast(isAr() ? `أهلاً بعودتك يا ${user.name}!` : `Welcome back, ${user.name}!`);
    enterSession(user);
  });

  document.getElementById("demoLoginBtn").addEventListener("click", () => {
    const demo = state.users.find((u) => u.id === "BW-1001");
    if (demo) { showToast(isAr() ? "تم الدخول بالحساب التجريبي (BW-1001)" : "Signed in with Demo Account (BW-1001)"); enterSession(demo); }
  });

  // Signup + OTP
  document.getElementById("signupForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAuthAlert();
    const name = document.getElementById("signupName").value.trim();
    const email = document.getElementById("signupEmail").value.trim().toLowerCase();
    const password = document.getElementById("signupPassword").value;
    const age = Number(document.getElementById("signupAge").value);

    if (state.users.some((u) => (u.email || "").toLowerCase() === email)) {
      showAuthAlert(isAr() ? "هذا البريد مسجل بالفعل." : "This email is already registered. Please sign in.");
      return;
    }

    const sendBtn = document.getElementById("sendOtpBtn");
    sendBtn.disabled = true;
    try {
      const otpRes = await sendGmailOtp(email, name);
      state.pendingSignup = { name, email, password, age };
      document.getElementById("otpTargetEmail").textContent = email;
      const devHint = document.getElementById("otpDevHint");
      if (otpRes.devOtp) { document.getElementById("otpDevCode").textContent = otpRes.devOtp; devHint.classList.remove("hidden"); }
      else devHint.classList.add("hidden");

      document.getElementById("signupStepDetails").classList.add("hidden");
      document.getElementById("signupStepOtp").classList.remove("hidden");
      resetOtpBoxes();
      startOtpCountdown(300);
      showToast(otpRes.message || (isAr() ? "تم إرسال رمز التحقق!" : "OTP code sent!"));
    } catch (err) {
      showAuthAlert(err.message);
    } finally {
      sendBtn.disabled = false;
    }
  });

  const otpInputs = [...document.querySelectorAll(".otp-digit")];
  otpInputs.forEach((inp, idx) => {
    inp.addEventListener("input", (e) => {
      const val = e.target.value.replace(/\D/g, "");
      e.target.value = val.slice(0, 1);
      if (val && idx < otpInputs.length - 1) otpInputs[idx + 1].focus();
    });
    inp.addEventListener("keydown", (e) => { if (e.key === "Backspace" && !inp.value && idx > 0) otpInputs[idx - 1].focus(); });
    inp.addEventListener("paste", (e) => {
      e.preventDefault();
      const digits = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6);
      digits.split("").forEach((d, i) => { if (otpInputs[i]) otpInputs[i].value = d; });
      if (otpInputs[Math.min(digits.length, 5)]) otpInputs[Math.min(digits.length, 5)].focus();
    });
  });

  document.getElementById("verifyOtpBtn").addEventListener("click", async () => {
    clearAuthAlert();
    if (!state.pendingSignup) return;
    const code = getOtpInputValue();
    if (code.length !== 6) { showAuthAlert(isAr() ? "يرجى إدخال الـ 6 أرقام كاملة." : "Please enter all 6 digits."); return; }
    try {
      await verifyGmailOtp(state.pendingSignup.email, code);
      clearInterval(state.otpTimerHandle);
      const { name, email, password, age } = state.pendingSignup;
      const newUser = {
        id: generateUniqueUserId(), name, email, password, provider: "local", picture: "", emailVerified: true,
        age, gender: "male", height: 175, weight: 75, activity: 1.55, goal: "maintain",
        calorieMode: "auto", manualCalories: 2200, macroPreset: "balanced",
        onboardingComplete: false, selectedFoodIds: [], diaries: {}, createdAt: new Date().toISOString(),
      };
      state.pendingSignup = null;
      await persistCurrentUser(newUser);
      showToast(isAr() ? `تم تأكيد البريد وإنشاء حسابك (${newUser.id})!` : `Email verified! Account created (${newUser.id}).`);
      enterSession(newUser);
    } catch (err) {
      showAuthAlert(err.message);
    }
  });

  document.getElementById("resendOtpBtn").addEventListener("click", async () => {
    if (!state.pendingSignup) return;
    clearAuthAlert();
    try {
      const res = await sendGmailOtp(state.pendingSignup.email, state.pendingSignup.name);
      if (res.devOtp) { document.getElementById("otpDevCode").textContent = res.devOtp; document.getElementById("otpDevHint").classList.remove("hidden"); }
      resetOtpBoxes();
      startOtpCountdown(300);
      showToast(isAr() ? "تم إعادة إرسال رمز جديد!" : "New OTP code sent!");
    } catch (err) { showAuthAlert(err.message); }
  });

  document.getElementById("backToSignupDetailsBtn").addEventListener("click", () => {
    clearInterval(state.otpTimerHandle);
    document.getElementById("signupStepOtp").classList.add("hidden");
    document.getElementById("signupStepDetails").classList.remove("hidden");
  });

  // Onboarding & Calculator
  document.querySelectorAll("[data-ob-cal-mode]").forEach((btn) => btn.addEventListener("click", () => setObCalMode(btn.dataset.obCalMode)));
  ["obHeight", "obWeight", "obAge", "obActivity", "obManualCalories", "obMacroPreset"].forEach((id) => {
    document.getElementById(id).addEventListener("input", updateOnboardingLivePreview);
    document.getElementById(id).addEventListener("change", updateOnboardingLivePreview);
  });
  document.querySelectorAll('input[name="obGender"], input[name="obGoal"]').forEach((r) => r.addEventListener("change", updateOnboardingLivePreview));

  document.getElementById("onboardingForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.currentUser) return;
    state.currentUser.gender = document.querySelector('input[name="obGender"]:checked').value;
    state.currentUser.goal = document.querySelector('input[name="obGoal"]:checked').value;
    state.currentUser.height = Number(document.getElementById("obHeight").value);
    state.currentUser.weight = Number(document.getElementById("obWeight").value);
    state.currentUser.age = Number(document.getElementById("obAge").value);
    state.currentUser.activity = Number(document.getElementById("obActivity").value);
    state.currentUser.calorieMode = state.obCalMode;
    state.currentUser.manualCalories = Number(document.getElementById("obManualCalories").value) || 2200;
    state.currentUser.macroPreset = document.getElementById("obMacroPreset").value;
    state.currentUser.onboardingComplete = true;
    await persistCurrentUser(state.currentUser);
    showToast(isAr() ? "تم حفظ بياناتك وحساب النتائج!" : "Profile saved & metrics calculated!");
    enterSession(state.currentUser);
  });

  document.querySelectorAll("[data-calc-mode]").forEach((btn) => btn.addEventListener("click", () => setCalcCalMode(btn.dataset.calcMode)));
  document.getElementById("calcForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.currentUser) return;
    state.currentUser.gender = document.getElementById("calcGender").value;
    state.currentUser.age = Number(document.getElementById("calcAge").value);
    state.currentUser.weight = Number(document.getElementById("calcWeight").value);
    state.currentUser.height = Number(document.getElementById("calcHeight").value);
    state.currentUser.activity = Number(document.getElementById("calcActivity").value);
    state.currentUser.goal = document.getElementById("calcGoal").value;
    state.currentUser.calorieMode = state.calcCalMode;
    state.currentUser.manualCalories = Number(document.getElementById("calcManualCalories").value) || 2200;
    state.currentUser.macroPreset = document.getElementById("calcMacroPreset").value;
    await persistCurrentUser(state.currentUser);
    recalculateAndRenderAll();
    if (state.generatedPlans.length > 0) generateDietPlans(true);
    showToast(isAr() ? "تم تحديث جميع الحسابات بنجاح!" : "All metrics & targets updated!");
  });

  // Navigation & User Menu
  document.querySelectorAll(".nav-tab").forEach((b) => b.addEventListener("click", () => switchAppView(b.dataset.view)));
  document.querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", () => switchAppView(b.dataset.goto)));
  document.getElementById("brandHomeBtn").addEventListener("click", () => switchAppView("dashboard"));

  const ud = document.getElementById("userDropdown");
  document.getElementById("userMenuBtn").addEventListener("click", (e) => { e.stopPropagation(); ud.classList.toggle("hidden"); });
  document.addEventListener("click", () => ud.classList.add("hidden"));
  document.getElementById("udCopyIdBtn").addEventListener("click", () => {
    if (!state.currentUser) return;
    navigator.clipboard?.writeText(state.currentUser.id);
    showToast(isAr() ? `تم نسخ المعرّف: ${state.currentUser.id}` : `Copied ID: ${state.currentUser.id}`);
  });
  document.getElementById("udExportUsersBtn").addEventListener("click", downloadUsersTextFile);
  document.getElementById("udEditBodyBtn").addEventListener("click", () => {
    switchAppView("dashboard");
    setTimeout(() => document.getElementById("calculatorCard").scrollIntoView({ behavior: "smooth" }), 80);
  });
  document.getElementById("logoutBtn").addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEYS.SESSION);
    state.currentUser = null;
    state.generatedPlans = [];
    syncAdminUIVisibility();
    renderFoods();
    showScreen("auth");
    switchAuthTab("login");
    showToast(isAr() ? "تم تسجيل الخروج بنجاح" : "Signed out successfully");
  });

  // Water, Foods, Planner, Diary
  document.getElementById("dashWaterPlus").addEventListener("click", () => adjustWater(1));
  document.getElementById("dashWaterMinus").addEventListener("click", () => adjustWater(-1));
  document.getElementById("diaryWaterPlus").addEventListener("click", () => adjustWater(1));
  document.getElementById("diaryWaterMinus").addEventListener("click", () => adjustWater(-1));

  document.getElementById("searchInput").addEventListener("input", (e) => { state.searchQuery = e.target.value; renderFoods(); });
  document.getElementById("sortFoodsSelect").addEventListener("change", (e) => { state.sortBy = e.target.value; renderFoods(); });

  const applyPreset = (ids, label) => {
    state.selectedFoodIds = new Set(ids.filter((id) => state.foodById.has(id)));
    if (state.currentUser) { state.currentUser.selectedFoodIds = [...state.selectedFoodIds]; persistCurrentUser(); }
    renderFoods();
    renderPlannerBasket();
    showToast(label);
  };
  document.getElementById("presetBalancedBtn").addEventListener("click", () => applyPreset([1, 21, 28, 151, 154, 85, 116, 195], tr("presetBalanced")));
  document.getElementById("presetProteinBtn").addEventListener("click", () => applyPreset([158, 16, 21, 151, 179, 182, 170, 175, 85], tr("presetHighProt")));

  const clearSel = () => {
    state.selectedFoodIds.clear();
    if (state.currentUser) { state.currentUser.selectedFoodIds = []; persistCurrentUser(); }
    renderFoods();
    renderPlannerBasket();
    showToast(isAr() ? "تم تفريغ القائمة" : "Selection cleared");
  };
  document.getElementById("clearSelectedBtn").addEventListener("click", clearSel);
  document.getElementById("plannerClearBtn").addEventListener("click", clearSel);
  document.getElementById("generateFromDockBtn").addEventListener("click", () => { switchAppView("planner"); generateDietPlans(); });

  document.getElementById("generatePlanBtn").addEventListener("click", () => generateDietPlans(false));
  document.getElementById("shufflePlanBtn").addEventListener("click", () => { state.shuffleSeed += 1; generateDietPlans(false); });
  ["optMealStructure", "optLunchProtein", "optDietStyle", "optAutoComplete"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => { if (state.generatedPlans.length > 0) generateDietPlans(true); });
  });

  const autoPickAndGo = () => {
    applyPreset([158, 2, 151, 170, 85, 21, 116, 195], isAr() ? "تم اختيار أكلات مصرية صحية" : "Selected healthy Egyptian foods");
    generateDietPlans(false);
  };
  document.getElementById("plannerAutoPickBtn").addEventListener("click", autoPickAndGo);
  document.getElementById("emptyAutoGenerateBtn").addEventListener("click", autoPickAndGo);

  document.getElementById("applyPlanToDiaryBtn").addEventListener("click", () => {
    const plan = state.generatedPlans[state.activePlanIndex];
    if (!plan) return;
    plan.items.forEach((it) => {
      logItemToDiary({
        foodId: it.foodId, name: it.name, image: it.image, meal: it.slotKey,
        amount: it.amount, unit: it.unit, calories: it.calories, protein: it.protein, carbs: it.carbs, fat: it.fat,
      });
    });
    showToast(isAr() ? "تم تطبيق الخطة على يوميات اليوم!" : "Meal plan applied to Today's Log!");
    switchAppView("diary");
  });

  document.getElementById("copyPlanBtn").addEventListener("click", () => {
    const plan = state.generatedPlans[state.activePlanIndex];
    if (!plan) return;
    const lines = [
      `BiteWise Plan: ${plan.title}`,
      `Calories: ${Math.round(plan.totals.calories)} kcal | Daily Protein: ${Math.round(plan.totals.protein)}g | Lunch Protein: ${plan.lunchProtein}g`,
      "==================================",
    ];
    plan.mealGroups.forEach((g) => {
      lines.push(`\n[${g.slot.name}] (${Math.round(g.items.reduce((s, i) => s + i.calories, 0))} kcal)`);
      g.items.forEach((i) => lines.push(`- ${i.name}: ${i.amount} ${i.unit} (${i.calories} kcal • P:${i.protein}g)`));
    });
    navigator.clipboard?.writeText(lines.join("\n"));
    showToast(isAr() ? "تم نسخ الخطة!" : "Meal plan copied to clipboard!");
  });
  document.getElementById("printPlanBtn").addEventListener("click", () => window.print());

  document.getElementById("closeFoodModal").addEventListener("click", () => { document.getElementById("foodModal").classList.add("hidden"); state.modalFood = null; });
  document.getElementById("foodModal").addEventListener("click", (e) => { if (e.target.id === "foodModal") { document.getElementById("foodModal").classList.add("hidden"); state.modalFood = null; } });
  document.getElementById("fmAmount").addEventListener("input", updateFoodModalCalc);

  document.getElementById("fmLogToDiaryBtn").addEventListener("click", () => {
    const f = state.modalFood;
    if (!f) return;
    const { basis, unitDisplay, isPiece } = extractNutrition(f);
    const qty = Math.max(0.5, Number(document.getElementById("fmAmount").value) || 0);
    const factor = isPiece ? qty : qty / 100;
    const mealKey = document.getElementById("fmMealSlot").value;
    logItemToDiary({
      foodId: f.id, name: foodPrimaryName(f), image: getFoodImage(f), meal: mealKey, amount: qty, unit: unitDisplay,
      calories: Math.round((basis.calories_kcal || 0) * factor),
      protein: Math.round((basis.protein_g || 0) * factor * 10) / 10,
      carbs: Math.round((basis.carbs_g || 0) * factor * 10) / 10,
      fat: Math.round((basis.fat_g || 0) * factor * 10) / 10,
    });
    document.getElementById("foodModal").classList.add("hidden");
    state.modalFood = null;
    showToast(isAr() ? `تم تسجيل "${foodPrimaryName(f)}" في ${mealDisplayName(mealKey)}` : `Logged "${foodPrimaryName(f)}" to ${mealDisplayName(mealKey)}`);
  });

  document.getElementById("fmTogglePlanBtn").addEventListener("click", () => {
    if (!state.modalFood) return;
    toggleFoodSelection(state.modalFood.id);
    const sel = state.selectedFoodIds.has(state.modalFood.id);
    document.getElementById("fmTogglePlanBtn").textContent = sel ? tr("btnRemPlanModal") : tr("btnAddPlanModal");
    showToast(sel ? (isAr() ? "تمت الإضافة للخطة" : "Added to diet plan") : (isAr() ? "تمت الإزالة من الخطة" : "Removed from diet plan"));
  });

  document.getElementById("clearDiaryBtn").addEventListener("click", () => {
    const diary = getTodayDiary();
    diary.items = [];
    diary.waterCups = 0;
    persistCurrentUser();
    renderDiary();
    showToast(isAr() ? "تم مسح سجل اليوم" : "Cleared today's log");
  });
}

// ==================== BOOTSTRAP ====================
async function initApp() {
  initTheme();
  await initBackendAndConfig();
  await loadUsers();
  bindAllEvents();
  await initDatabase();

  // Default to English ("en"), or restore user's chosen language
  const savedLang = localStorage.getItem(STORAGE_KEYS.LANG) || "en";
  applyLanguage(savedLang);

  const sessionId = localStorage.getItem(STORAGE_KEYS.SESSION);
  if (sessionId) {
    const found = state.users.find((u) => u.id === sessionId);
    if (found) {
      enterSession(found);
      return;
    }
  }
  showScreen("auth");
}

document.addEventListener("DOMContentLoaded", initApp);
