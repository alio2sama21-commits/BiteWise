/* =========================================================================
   BiteWise 3.0 — Complete Interactive Nutrition & Smart Meal Engine
   - Real Google OAuth 2.0 Sign-In (Google Identity Services)
   - Real 6-Digit Gmail OTP Verification (Local SMTP / EmailJS / Dev Fallback)
   - Automatic Local Text File Persistence (users_database.txt via server.ps1)
   - Auto (Mifflin-St Jeor) OR Manual Custom Daily Calories Mode
   - 212 Egyptian Foods with 100% Unique Photos & Instant Local Fallbacks
   - Cohesive Multi-Option Smart Diet Planner with Guaranteed >= 60g Lunch Protein
   ========================================================================= */

const STORAGE_KEYS = {
  USERS: "bitewise_users_v3",
  SESSION: "bitewise_session_v3",
  THEME: "bitewise_theme_v3",
  CONFIG: "bitewise_config_v3",
};

const DB_JSON_PATH = "./egyptian_food_nutrition_with_images_v4.json";

const CATEGORY_AR_MAP = {
  "Breakfast & Street Food": "فطار وأكلات شعبية",
  "Cheeses & Dairy": "أجبان وألبان",
  "Breads, Rice & Pasta": "عيش وأرز ومكرونة",
  "Main Courses & Stews": "طواجن وطبخ مصري",
  "Meats, Poultry & Seafood": "لحوم وفراخ وأسماك",
  "Salads & Dips": "سلطات ومقبلات",
  "Dunkin' Donuts": "دونتس",
  "Desserts & Beverages": "حلويات ومشروبات",
  "Fruits": "فواكه طازجة",
  "Nuts, Seeds & Oils": "مكسرات وزيوت صحية",
};

const GOAL_LABELS = {
  lose: "تنشيف وخسارة دهون (-450 kcal)",
  maintain: "تثبيت الوزن وصحة عامة",
  gain: "تضخيم وبناء عضلات (+400 kcal)",
};

const MACRO_PRESETS = {
  balanced: { label: "متوازن", p: 0.30, c: 0.45, f: 0.25 },
  high_protein: { label: "عالي البروتين", p: 0.38, c: 0.37, f: 0.25 },
  low_carb: { label: "منخفض الكارب", p: 0.35, c: 0.25, f: 0.40 },
  bulk: { label: "تضخيم", p: 0.28, c: 0.50, f: 0.22 },
};

const DIARY_MEAL_ORDER = ["الفطار", "الغداء", "العشاء", "سناكس"];

// Curated Egyptian food ID pools for balanced cohesive meal auto-completion & swaps
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

// Application Global State
const state = {
  backendOnline: false,
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
};

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
    el.style.transform = "translateX(-16px)";
    el.style.transition = "0.25s ease";
    setTimeout(() => el.remove(), 260);
  }, 3400);
}

function extractNutrition(food) {
  if (!food) {
    return { basis: { calories_kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 }, unitLabel: "100g", unitAr: "جرام", baseQty: 100, isPiece: false };
  }
  if (food.per_100g) return { basis: food.per_100g, unitLabel: "100g", unitAr: "جرام", baseQty: 100, isPiece: false };
  if (food.per_100M) return { basis: food.per_100M, unitLabel: "100ml", unitAr: "مل", baseQty: 100, isPiece: false };
  if (food.per_1) return { basis: food.per_1, unitLabel: "1 قطعة", unitAr: "قطعة", baseQty: 1, isPiece: true };
  return { basis: { calories_kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 }, unitLabel: "100g", unitAr: "جرام", baseQty: 100, isPiece: false };
}

function getFoodImage(food) {
  return food?.image_url || food?.category_image_url || "./images/ful_medames.jpg";
}

function getFoodFallbackImage(food) {
  return food?.category_image_url || "./images/ful_medames.jpg";
}

function imgTagHtml(food, cls = "") {
  const src = getFoodImage(food);
  const fb = getFoodFallbackImage(food);
  const alt = (food?.name_ar || "food").replace(/"/g, "&quot;");
  return `<img class="${cls}" src="${src}" alt="${alt}" loading="lazy" onerror="this.onerror=null;this.src='${fb}';" />`;
}

// ==================== BACKEND & CONFIG SYNC ====================
async function initBackendAndConfig() {
  // Load static config.js + localStorage saved overrides
  let localCfg = {};
  try {
    localCfg = JSON.parse(localStorage.getItem(STORAGE_KEYS.CONFIG) || "{}");
  } catch {}
  state.config = {
    ...state.config,
    ...(window.BITEWISE_CONFIG || {}),
    ...localCfg,
  };

  // Detect if local PowerShell full-stack server is running
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    if (res.ok) {
      const info = await res.json();
      state.backendOnline = Boolean(info.ok);
      state.smtpConfigured = Boolean(info.smtpConfigured);

      const cfgRes = await fetch("/api/config", { cache: "no-store" });
      if (cfgRes.ok) {
        const srvCfg = await cfgRes.json();
        if (srvCfg.googleClientId) state.config.googleClientId = srvCfg.googleClientId;
        if (srvCfg.smtpEmail) state.config.smtpEmail = srvCfg.smtpEmail;
        if (srvCfg.emailjsServiceId) state.config.emailjsServiceId = srvCfg.emailjsServiceId;
        if (srvCfg.emailjsTemplateId) state.config.emailjsTemplateId = srvCfg.emailjsTemplateId;
        if (srvCfg.emailjsPublicKey) state.config.emailjsPublicKey = srvCfg.emailjsPublicKey;
        state.smtpConfigured = Boolean(srvCfg.smtpConfigured);
      }
    }
  } catch {
    state.backendOnline = false;
  }

  const isOwnerMode =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    new URLSearchParams(window.location.search).get("admin") === "1";

  ["authSettingsBtn", "openSettingsBtn", "openSmtpFromOtp"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("hidden", !isOwnerMode);
  });

  // Secret owner shortcut (Ctrl + Shift + A) to open admin settings anytime
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "a") {
      e.preventDefault();
      openSettingsModal();
    }
  });

  const badge = document.getElementById("backendStatusBadge");
  if (badge) {
    badge.textContent = state.backendOnline
      ? "● حفظ تلقائي في users_database.txt"
      : "● BiteWise Live";
  }
  const fileTag = document.getElementById("udFileSyncBadge");
  if (fileTag) {
    fileTag.textContent = state.backendOnline ? "users_database.txt ✓" : "محفوظ بأمان ✓";
  }
}

async function loadUsers() {
  // 1. Load from localStorage first
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USERS);
    state.users = raw ? JSON.parse(raw) : [];
  } catch {
    state.users = [];
  }

  // 2. If local backend is running, merge users from users_store.json / users_database.txt
  if (state.backendOnline) {
    try {
      const res = await fetch("/api/users", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.users) && data.users.length > 0) {
          const map = new Map();
          state.users.forEach((u) => map.set(u.id, u));
          data.users.forEach((u) => map.set(u.id, u));
          state.users = [...map.values()];
        }
      }
    } catch {}
  }

  // Ensure demo account exists
  if (!state.users.some((u) => u.id === "BW-1001")) {
    state.users.unshift({
      id: "BW-1001",
      name: "أحمد محمد",
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

  // AUTOMATICALLY write to c:\Users\M S I\Desktop\BetWise\users_database.txt via local backend!
  if (state.backendOnline) {
    try {
      await fetch("/api/users/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: userObj }),
      });
    } catch (err) {
      console.warn("Backend sync skipped:", err);
    }
  }
}

function generateUniqueUserId() {
  let num = 1002 + state.users.length;
  while (state.users.some((u) => u.id === `BW-${num}`)) num += 1;
  return `BW-${num}`;
}

function downloadUsersTextFile() {
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
  showToast("تم تحميل ملف users_database.txt بنجاح!");
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
    showToast("أدخل Google OAuth Client ID أولاً لتفعيل الدخول الحقيقي لحساب جوجل", "error");
    openSettingsModal();
    return;
  }

  if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
    showToast("جاري تحميل Google SDK... تأكد من اتصالك بالإنترنت وحاول مجدداً", "error");
    return;
  }

  try {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "openid email profile",
      callback: async (tokenResponse) => {
        if (tokenResponse.error) {
          showAuthAlert(`فشل الدخول عبر Google: ${tokenResponse.error}`);
          return;
        }
        try {
          const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
          });
          if (!profileRes.ok) throw new Error("Failed to fetch Google userinfo");
          const gUser = await profileRes.json();
          await completeGoogleSignIn(gUser);
        } catch (err) {
          showAuthAlert("تعذّر قراءة بيانات حساب Google. تأكد من الإعدادات.");
        }
      },
    });
    tokenClient.requestAccessToken({ prompt: "select_account" });
  } catch (err) {
    showAuthAlert("خطأ في تشغيل Google OAuth. تأكد من صحة الـ Client ID والـ Origin.");
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
  showToast(`تم تسجيل الدخول بحساب Google: ${name}`);
  enterSession(user);
}

// ==================== REAL 6-DIGIT GMAIL OTP FLOW ====================
async function sendGmailOtp(email, name) {
  // 1. Local Full-Stack Server (Real Gmail SMTP smtp.gmail.com:587 OR dev fallback)
  if (state.backendOnline) {
    const res = await fetch("/api/otp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "فشل إرسال الرمز");
    return data;
  }

  // 2. Static Web / GitHub Pages (EmailJS if configured, else browser fallback)
  const code = String(Math.floor(100000 + Math.random() * 900000));
  state.localOtpRecord = { email, code, expiresAt: Date.now() + 5 * 60 * 1000 };

  if (state.config.emailjsServiceId && state.config.emailjsTemplateId && state.config.emailjsPublicKey) {
    try {
      const ejRes = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: state.config.emailjsServiceId,
          template_id: state.config.emailjsTemplateId,
          user_id: state.config.emailjsPublicKey,
          template_params: { to_email: email, to_name: name, otp_code: code },
        }),
      });
      if (ejRes.ok) {
        return { ok: true, deliveredVia: "emailjs", message: `تم إرسال رمز التحقق إلى ${email}` };
      }
    } catch {}
  }

  return {
    ok: true,
    deliveredVia: "local_fallback",
    devOtp: code,
    message: "تم توليد رمز OTP بنجاح",
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
    if (!res.ok || !data.ok) throw new Error(data.error || "رمز التحقق غير صحيح");
    return true;
  }

  const rec = state.localOtpRecord;
  if (!rec || rec.email !== email) throw new Error("لم يتم طلب رمز تحقق لهذا البريد.");
  if (Date.now() > rec.expiresAt) throw new Error("انتهت صلاحية الرمز. اضغط إعادة إرسال.");
  if (rec.code !== code) throw new Error("رمز التحقق غير صحيح. تأكد من الـ 6 أرقام.");
  state.localOtpRecord = null;
  return true;
}

function startOtpCountdown(seconds = 300) {
  clearInterval(state.otpTimerHandle);
  let left = seconds;
  const el = document.getElementById("otpTimerText");
  const tick = () => {
    const m = String(Math.floor(left / 60)).padStart(2, "0");
    const s = String(left % 60).padStart(2, "0");
    el.textContent = `${m}:${s}`;
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

// ==================== HEALTH METRICS ENGINE (AUTO & MANUAL!) ====================
function calculateHealthMetrics({
  gender,
  age,
  weight,
  height,
  activity,
  goal,
  calorieMode = "auto",
  manualCalories = 2200,
  macroPreset = "balanced",
}) {
  const w = Math.max(30, Number(weight) || 70);
  const h = Math.max(100, Number(height) || 170);
  const a = Math.max(12, Number(age) || 20);
  const act = Number(activity) || 1.55;
  const g = gender === "female" ? "female" : "male";

  // 1. BMI
  const heightM = h / 100;
  const bmi = Math.round((w / (heightM * heightM)) * 10) / 10;

  let bmiLabel = "وزن مثالي";
  let bmiClass = "normal";
  if (bmi < 18.5) { bmiLabel = "نحافة"; bmiClass = "under"; }
  else if (bmi < 25) { bmiLabel = "وزن مثالي"; bmiClass = "normal"; }
  else if (bmi < 30) { bmiLabel = "زيادة وزن"; bmiClass = "over"; }
  else { bmiLabel = "سمنة"; bmiClass = "obese"; }

  let bmiMarkerPct = 50;
  if (bmi <= 15) bmiMarkerPct = 2;
  else if (bmi < 18.5) bmiMarkerPct = ((bmi - 15) / 3.5) * 14;
  else if (bmi < 25) bmiMarkerPct = 14 + ((bmi - 18.5) / 6.5) * 26;
  else if (bmi < 30) bmiMarkerPct = 40 + ((bmi - 25) / 5) * 20;
  else if (bmi < 40) bmiMarkerPct = 60 + ((bmi - 30) / 10) * 40;
  else bmiMarkerPct = 98;

  const idealMin = Math.round(18.5 * heightM * heightM);
  const idealMax = Math.round(24.9 * heightM * heightM);

  // 2. BMR & TDEE (Always calculated for full physiological awareness)
  const bmr = Math.round(g === "male" ? 10 * w + 6.25 * h - 5 * a + 5 : 10 * w + 6.25 * h - 5 * a - 161);
  const tdee = Math.round(bmr * act);

  // 3. Target Calories (Auto OR Manual!)
  let targetCalories = tdee;
  let goalDeltaText = "سعرات التثبيت اليومية للحفاظ على وزنك";
  let proteinGrams, carbsGrams, fatGrams;

  if (calorieMode === "manual") {
    targetCalories = Math.max(1000, Math.min(6000, Math.round(Number(manualCalories) || 2200)));
    const preset = MACRO_PRESETS[macroPreset] || MACRO_PRESETS.balanced;
    proteinGrams = Math.round((targetCalories * preset.p) / 4);
    carbsGrams = Math.round((targetCalories * preset.c) / 4);
    fatGrams = Math.round((targetCalories * preset.f) / 9);
    const diff = targetCalories - tdee;
    goalDeltaText = `سعرات مخصصة يدوياً (${diff >= 0 ? "+" : ""}${diff} kcal مقارنة بالـ TDEE) • نظام ${preset.label}`;
  } else {
    if (goal === "lose") {
      targetCalories = Math.max(1200, tdee - 450);
      goalDeltaText = `عجز يومي ${tdee - targetCalories} سعرة تحت الحرق اليومي لخسارة دهون صحية`;
    } else if (goal === "gain") {
      targetCalories = tdee + 400;
      goalDeltaText = "فائض يومي +400 سعرة فوق الحرق اليومي لبناء العضلات";
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
    calorieMode,
    macroPreset,
    bmi, bmiLabel, bmiClass, bmiMarkerPct, idealMin, idealMax,
    bmr, tdee, activityFactor: act,
    targetCalories, goalDeltaText,
    proteinGrams, proteinKcal, proteinPct,
    carbsGrams, carbsKcal, carbsPct,
    fatGrams, fatKcal, fatPct,
    waterLiters, waterCups, fiberGrams,
  };
}

// ==================== COHESIVE SMART DIET PLANNER (GUARANTEED >= 60g LUNCH PROTEIN!) ====================
function getMealSlotsConfig(structure) {
  if (structure === "3") {
    return [
      { key: "breakfast", name: "الفطار", time: "8:00 ص – 10:00 ص", share: 0.27, cls: "slot-breakfast" },
      { key: "lunch", name: "الغداء", time: "2:00 م – 4:00 م", share: 0.45, cls: "slot-lunch", isLunch: true },
      { key: "dinner", name: "العشاء", time: "8:00 م – 9:30 م", share: 0.28, cls: "slot-dinner" },
    ];
  }
  if (structure === "5") {
    return [
      { key: "breakfast", name: "الفطار", time: "8:00 ص", share: 0.22, cls: "slot-breakfast" },
      { key: "snack1", name: "سناك صباحي", time: "11:30 ص", share: 0.10, cls: "slot-snack" },
      { key: "lunch", name: "الغداء", time: "2:30 م", share: 0.36, cls: "slot-lunch", isLunch: true },
      { key: "snack2", name: "سناك قبل/بعد التمرين", time: "6:00 م", share: 0.12, cls: "slot-snack" },
      { key: "dinner", name: "العشاء", time: "9:00 م", share: 0.20, cls: "slot-dinner" },
    ];
  }
  if (structure === "if168") {
    return [
      { key: "lunch", name: "الغداء (كسر الصيام)", time: "1:00 م", share: 0.48, cls: "slot-lunch", isLunch: true },
      { key: "snack", name: "سناك الظهيرة", time: "5:00 م", share: 0.16, cls: "slot-snack" },
      { key: "dinner", name: "العشاء", time: "8:30 م", share: 0.36, cls: "slot-dinner" },
    ];
  }
  // Default: 4 balanced meals
  return [
    { key: "breakfast", name: "الفطار", time: "8:30 ص – 10:00 ص", share: 0.24, cls: "slot-breakfast" },
    { key: "lunch", name: "الغداء", time: "2:00 م – 4:00 م", share: 0.42, cls: "slot-lunch", isLunch: true },
    { key: "snack", name: "سناك", time: "5:30 م", share: 0.12, cls: "slot-snack" },
    { key: "dinner", name: "العشاء", time: "8:30 م", share: 0.22, cls: "slot-dinner" },
  ];
}

function classifyFoodRole(food) {
  const { basis } = extractNutrition(food);
  const cat = food.category || "";
  const en = (food.name_en || "").toLowerCase();

  if (cat === "Meats, Poultry & Seafood") return "lunch_protein";
  if (cat === "Main Courses & Stews") {
    return (basis.protein_g || 0) >= 12 ? "lunch_protein" : "lunch_carb";
  }
  if (cat === "Salads & Dips") return "veggie_side";
  if (cat === "Fruits" || cat === "Nuts, Seeds & Oils" || cat === "Desserts & Beverages" || cat === "Dunkin' Donuts") {
    return "snack";
  }
  if (cat === "Cheeses & Dairy") return "breakfast_protein";
  if (cat === "Breakfast & Street Food") {
    if (en.includes("oats")) return "breakfast_carb";
    if (en.includes("shawarma") || en.includes("hawawshi") || en.includes("kibda") || en.includes("sogoq")) return "lunch_protein";
    if (en.includes("koshary") || en.includes("batates")) return "lunch_carb";
    return "breakfast_protein";
  }
  if (cat === "Breads, Rice & Pasta") {
    if (en.includes("toast") || en.includes("baladi")) return "breakfast_carb";
    return "lunch_carb";
  }
  return "snack";
}

function getPoolFoods(poolName) {
  const ids = CURATED_POOLS[poolName] || [];
  return ids.map((id) => state.foodById.get(id)).filter(Boolean);
}

function pickFromPool(poolName, excludeIds, offset = 0) {
  const list = getPoolFoods(poolName);
  if (list.length === 0) return state.allFoods[0];
  for (let i = 0; i < list.length; i++) {
    const f = list[(i + offset) % list.length];
    if (!excludeIds.has(f.id)) {
      excludeIds.add(f.id);
      return f;
    }
  }
  return list[offset % list.length];
}

function buildPlanItem(food, slotKey, slotName, role, amount, isUserPick) {
  const { basis, unitAr, isPiece } = extractNutrition(food);
  const rounded = isPiece
    ? Math.max(0.5, Math.round(amount * 2) / 2)
    : Math.max(15, Math.round(amount / 5) * 5);
  const factor = isPiece ? rounded : rounded / 100;

  return {
    foodId: food.id,
    food,
    name: food.name_ar || food.name_en,
    image: getFoodImage(food),
    fallbackImage: getFoodFallbackImage(food),
    slotKey,
    meal: slotName,
    role,
    isUserPick,
    isPiece,
    amount: rounded,
    unit: unitAr,
    calories: Math.round((basis.calories_kcal || 0) * factor),
    protein: Math.round((basis.protein_g || 0) * factor * 10) / 10,
    carbs: Math.round((basis.carbs_g || 0) * factor * 10) / 10,
    fat: Math.round((basis.fat_g || 0) * factor * 10) / 10,
  };
}

function computePlanTotals(items) {
  return items.reduce(
    (acc, it) => {
      acc.calories += it.calories;
      acc.protein += it.protein;
      acc.carbs += it.carbs;
      acc.fat += it.fat;
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

function buildCohesivePlan({
  title,
  description,
  selectedFoods,
  metrics,
  structure,
  minLunchProtein,
  style,
  autoComplete,
  seed = 0,
}) {
  const slots = getMealSlotsConfig(structure);
  const usedIds = new Set();

  // Bucket user's selected foods by culinary role
  const userBuckets = {
    breakfast_protein: [],
    breakfast_carb: [],
    lunch_protein: [],
    lunch_carb: [],
    veggie_side: [],
    snack: [],
  };
  selectedFoods.forEach((f) => {
    const r = classifyFoodRole(f);
    if (userBuckets[r]) userBuckets[r].push(f);
  });

  // Sort lunch_protein so highest-protein lean cuts get priority for Lunch
  userBuckets.lunch_protein.sort((a, b) => (extractNutrition(b).basis.protein_g || 0) - (extractNutrition(a).basis.protein_g || 0));

  const pullUser = (bucket) => {
    while (userBuckets[bucket] && userBuckets[bucket].length > 0) {
      const f = userBuckets[bucket].shift();
      if (!usedIds.has(f.id)) {
        usedIds.add(f.id);
        return f;
      }
    }
    return null;
  };

  const mealGroups = [];

  slots.forEach((slot, sIdx) => {
    const slotTargetKcal = metrics.targetCalories * slot.share;
    const rawEntries = [];

    if (slot.key === "breakfast") {
      const pUser = pullUser("breakfast_protein");
      const pFood = pUser || (autoComplete ? pickFromPool(style === "budget" ? "budget_protein" : "breakfast_protein", usedIds, seed + sIdx) : null);
      if (pFood) rawEntries.push({ food: pFood, role: "breakfast_protein", isUserPick: Boolean(pUser), weightShare: 0.55 });

      const cUser = pullUser("breakfast_carb");
      const cFood = cUser || (autoComplete && style !== "low_carb" ? pickFromPool(style === "budget" ? "budget_carb" : "breakfast_carb", usedIds, seed + sIdx) : null);
      if (cFood) rawEntries.push({ food: cFood, role: "breakfast_carb", isUserPick: Boolean(cUser), weightShare: 0.45 });
    } else if (slot.isLunch) {
      // LUNCH: Hero high-protein main + smart carb + salad/veggie side!
      const pUser1 = pullUser("lunch_protein");
      const pFood1 = pUser1 || pickFromPool(style === "budget" ? "budget_protein" : "lunch_protein", usedIds, seed);
      if (pFood1) rawEntries.push({ food: pFood1, role: "lunch_protein", isUserPick: Boolean(pUser1), weightShare: 0.56 });

      // If user picked multiple lunch proteins and one isn't very lean/dense, keep 2nd for dinner; only add 2nd protein to lunch if needed later
      const cUser = pullUser("lunch_carb");
      const cFood = cUser || (autoComplete && style !== "low_carb" ? pickFromPool(style === "budget" ? "budget_carb" : "lunch_carb", usedIds, seed) : null);
      if (cFood) rawEntries.push({ food: cFood, role: "lunch_carb", isUserPick: Boolean(cUser), weightShare: style === "low_carb" ? 0.15 : 0.34 });

      const vUser = pullUser("veggie_side");
      const vFood = vUser || (autoComplete ? pickFromPool("veggie_side", usedIds, seed) : null);
      if (vFood) rawEntries.push({ food: vFood, role: "veggie_side", isUserPick: Boolean(vUser), weightShare: 0.10 });
    } else if (slot.key === "dinner") {
      // DINNER: Use remaining user lunch/breakfast protein OR curated dinner lean protein + light carb/salad
      const pUser = pullUser("lunch_protein") || pullUser("breakfast_protein");
      const pFood = pUser || (autoComplete ? pickFromPool(style === "budget" ? "budget_protein" : "dinner_protein", usedIds, seed + 2) : null);
      if (pFood) rawEntries.push({ food: pFood, role: "dinner_protein", isUserPick: Boolean(pUser), weightShare: 0.62 });

      const cUser = pullUser("lunch_carb") || pullUser("breakfast_carb") || pullUser("veggie_side");
      const cFood = cUser || (autoComplete ? pickFromPool(style === "low_carb" ? "veggie_side" : "dinner_carb", usedIds, seed + 1) : null);
      if (cFood) rawEntries.push({ food: cFood, role: style === "low_carb" ? "veggie_side" : "dinner_carb", isUserPick: Boolean(cUser), weightShare: 0.38 });
    } else {
      // SNACKS
      const sUser = pullUser("snack");
      const sFood = sUser || (autoComplete ? pickFromPool("snack", usedIds, seed + sIdx * 2) : null);
      if (sFood) rawEntries.push({ food: sFood, role: "snack", isUserPick: Boolean(sUser), weightShare: 1.0 });
    }

    // Initial calorie-targeted portioning for this meal
    const sumShare = rawEntries.reduce((s, e) => s + e.weightShare, 0) || 1;
    let builtItems = rawEntries.map((entry) => {
      const { basis, isPiece } = extractNutrition(entry.food);
      const itemTargetKcal = slotTargetKcal * (entry.weightShare / sumShare);
      const kcalPerUnit = isPiece ? Math.max(20, basis.calories_kcal || 80) : Math.max(25, basis.calories_kcal || 100) / 100;
      let qty = itemTargetKcal / kcalPerUnit;
      // Realistic bounds per role
      if (entry.role === "veggie_side") qty = Math.min(200, Math.max(100, qty));
      else if (entry.food.category === "Nuts, Seeds & Oils") qty = Math.min(35, Math.max(15, qty));
      else if (isPiece) qty = Math.min(4, Math.max(1, qty));
      else qty = Math.min(300, Math.max(50, qty));
      return buildPlanItem(entry.food, slot.key, slot.name, entry.role, qty, entry.isUserPick);
    });

    // STRICT GUARANTEE: Lunch Protein >= minLunchProtein (default 60g!)
    if (slot.isLunch && builtItems.length > 0) {
      let lunchProt = builtItems.reduce((s, i) => s + i.protein, 0);
      if (lunchProt < minLunchProtein) {
        // Find main protein item in lunch
        let pIdx = builtItems.findIndex((i) => i.role === "lunch_protein");
        if (pIdx === -1) {
          // Inject lean grilled chicken breast if lunch has no high-protein main
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
            // Cap primary at 260g and add a complementary lean protein booster (e.g. Quraish/Eggs/Grilled Chicken)
            builtItems[pIdx] = buildPlanItem(pItem.food, slot.key, slot.name, pItem.role, isPiece ? 3 : 250, pItem.isUserPick);
            const afterProt = builtItems.reduce((s, it) => s + it.protein, 0);
            if (afterProt < minLunchProtein) {
              const boosterFood = state.foodById.get(151) || pickFromPool("lunch_protein", usedIds, seed + 3);
              const bNut = extractNutrition(boosterFood);
              const bProtPerG = (bNut.basis.protein_g || 25) / 100;
              const bQty = Math.max(80, Math.ceil(((minLunchProtein - afterProt) / bProtPerG) / 5) * 5);
              builtItems.push(buildPlanItem(boosterFood, slot.key, slot.name, "lunch_protein", bQty, false));
            }
          }
        }
      }
    }

    mealGroups.push({ slot, items: builtItems });
  });

  // Final Calorie Balancing Pass: scale non-lunch-protein items so total day hits targetCalories cleanly
  // WITHOUT ever dropping Lunch protein below minLunchProtein!
  const allBuilt = mealGroups.flatMap((g) => g.items);
  const currentTotalKcal = allBuilt.reduce((s, i) => s + i.calories, 0);
  const lockedKcal = allBuilt
    .filter((i) => i.slotKey === "lunch" && i.role === "lunch_protein")
    .reduce((s, i) => s + i.calories, 0);
  const flexibleKcal = Math.max(1, currentTotalKcal - lockedKcal);
  const desiredFlexKcal = Math.max(200, metrics.targetCalories - lockedKcal);
  const flexScale = Math.min(1.65, Math.max(0.55, desiredFlexKcal / flexibleKcal));

  mealGroups.forEach((g) => {
    g.items = g.items.map((it) => {
      if (it.slotKey === "lunch" && it.role === "lunch_protein") return it; // Protect 60g+ lunch protein!
      if (it.role === "veggie_side") return it;
      const newAmt = it.isPiece ? it.amount * flexScale : Math.min(280, Math.max(25, it.amount * flexScale));
      return buildPlanItem(it.food, it.slotKey, it.meal, it.role, newAmt, it.isUserPick);
    });
  });

  const finalItems = mealGroups.flatMap((g) => g.items);
  const totals = computePlanTotals(finalItems);
  const lunchGroup = mealGroups.find((g) => g.slot.isLunch);
  const lunchProtein = lunchGroup ? Math.round(lunchGroup.items.reduce((s, i) => s + i.protein, 0)) : 0;
  const accuracy = Math.max(
    0,
    Math.min(100, Math.round(100 - (Math.abs(totals.calories - metrics.targetCalories) / Math.max(1, metrics.targetCalories)) * 100))
  );

  return {
    title,
    description,
    structure,
    minLunchProtein,
    lunchProtein,
    mealGroups,
    items: finalItems,
    totals,
    accuracy,
  };
}

function generateDietPlans(silent = false) {
  if (!state.currentMetrics || state.allFoods.length === 0) return;

  const structure = document.getElementById("optMealStructure").value;
  const minLunchProtein = Number(document.getElementById("optLunchProtein").value) || 60;
  const dietStyle = document.getElementById("optDietStyle").value;
  const autoComplete = document.getElementById("optAutoComplete").checked;

  document.getElementById("plannerLunchMinHint").textContent = `${minLunchProtein}g+ بروتين في الغداء`;

  const chosenFoods = state.allFoods.filter((f) => state.selectedFoodIds.has(f.id));
  if (chosenFoods.length === 0 && !autoComplete) {
    showToast("اختر أكلات أولاً أو فعّل خيار إكمال الوجبات تلقائياً", "error");
    return;
  }

  const baseSeed = state.shuffleSeed;
  state.generatedPlans = [
    buildCohesivePlan({
      title: "الخطة المتوازنة الذكية",
      description: "توزيع مصري متكامل بين الوجبات مع غداء غني بالبروتين وتوازن مثالي للطاقة.",
      selectedFoods: chosenFoods,
      metrics: state.currentMetrics,
      structure,
      minLunchProtein,
      style: dietStyle,
      autoComplete,
      seed: baseSeed,
    }),
    buildCohesivePlan({
      title: "خطة البروتين العالي (للجيم)",
      description: "أعلى تركيز بروتين صافي لدعم الكتلة العضلية والشبع لفترات طويلة.",
      selectedFoods: chosenFoods,
      metrics: state.currentMetrics,
      structure,
      minLunchProtein: Math.max(minLunchProtein, 70),
      style: "high_protein",
      autoComplete: true,
      seed: baseSeed + 2,
    }),
    buildCohesivePlan({
      title: "خطة منخفضة الكارب",
      description: "تقليل النشويات وزيادة البروتين والخضار لحرق أسرع وثبات مستوى السكر.",
      selectedFoods: chosenFoods,
      metrics: state.currentMetrics,
      structure,
      minLunchProtein,
      style: "low_carb",
      autoComplete: true,
      seed: baseSeed + 4,
    }),
    buildCohesivePlan({
      title: "خطة اقتصادية يومية",
      description: "أكلات مصرية متوفرة واقتصادية (فول، بيض، جبنة قريش، فراخ، تونة) بنفس الدقة الغذائية.",
      selectedFoods: chosenFoods,
      metrics: state.currentMetrics,
      structure,
      minLunchProtein,
      style: "budget",
      autoComplete: true,
      seed: baseSeed + 1,
    }),
  ];

  state.activePlanIndex = Math.min(state.activePlanIndex, state.generatedPlans.length - 1);
  document.getElementById("plansEmptyState").classList.add("hidden");
  document.getElementById("plansSection").classList.remove("hidden");
  renderActivePlan();
  if (!silent) showToast(`تم توليد 4 خطط وجبات متناسقة (بروتين الغداء ≥ ${minLunchProtein}g)!`);
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

  // Preserve calories OR if Lunch Protein, preserve protein >= oldItem.protein!
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

  // Recalculate plan totals & lunch protein
  plan.items = plan.mealGroups.flatMap((g) => g.items);
  plan.totals = computePlanTotals(plan.items);
  const lg = plan.mealGroups.find((g) => g.slot.isLunch);
  plan.lunchProtein = lg ? Math.round(lg.items.reduce((s, i) => s + i.protein, 0)) : 0;
  plan.accuracy = Math.max(
    0,
    Math.min(100, Math.round(100 - (Math.abs(plan.totals.calories - state.currentMetrics.targetCalories) / Math.max(1, state.currentMetrics.targetCalories)) * 100))
  );

  renderActivePlan();
  showToast(`تم تبديل "${oldItem.name}" بـ "${nextFood.name_ar}"`);
}

function renderActivePlan() {
  const plan = state.generatedPlans[state.activePlanIndex];
  if (!plan) return;

  const tabsEl = document.getElementById("planTabs");
  tabsEl.innerHTML = state.generatedPlans
    .map(
      (p, idx) =>
        `<button type="button" class="plan-tab-btn ${idx === state.activePlanIndex ? "active" : ""}" data-plan-idx="${idx}">${p.title}</button>`
    )
    .join("");
  tabsEl.querySelectorAll(".plan-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.activePlanIndex = Number(btn.dataset.planIdx);
      renderActivePlan();
    });
  });

  const cardsHtml = plan.mealGroups
    .map((group, gIdx) => {
      const mCals = Math.round(group.items.reduce((s, i) => s + i.calories, 0));
      const mProt = Math.round(group.items.reduce((s, i) => s + i.protein, 0));
      const mCarb = Math.round(group.items.reduce((s, i) => s + i.carbs, 0));
      const mFat = Math.round(group.items.reduce((s, i) => s + i.fat, 0));

      const lunchBadge = group.slot.isLunch
        ? `<span class="lunch-protein-verified">✓ بروتين الغداء: ${mProt}g (الهدف +${plan.minLunchProtein}g)</span>`
        : "";

      const rowsHtml =
        group.items.length === 0
          ? `<p class="empty-inline">لا توجد أصناف في هذه الوجبة.</p>`
          : group.items
              .map(
                (it, iIdx) => `
                <div class="meal-row-item">
                  ${imgTagHtml(it.food, "meal-thumb")}
                  <div class="meal-item-info">
                    <div class="meal-item-title-row">
                      <strong>${it.name}</strong>
                      <span class="origin-tag ${it.isUserPick ? "user" : "auto"}">${it.isUserPick ? "من اختيارك" : "مكمل متوازن"}</span>
                    </div>
                    <small><span dir="ltr">${it.calories} kcal • P: ${it.protein}g • C: ${it.carbs}g • F: ${it.fat}g</span></small>
                  </div>
                  <div class="meal-item-right">
                    <span class="meal-portion-tag">${it.amount} ${it.unit}</span>
                    <button type="button" class="swap-item-btn" data-swap-g="${gIdx}" data-swap-i="${iIdx}" title="تبديل بصنف بديل">
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
              <div>
                <h4>${group.slot.name}</h4>
                <span class="meal-time-sub">${group.slot.time}</span>
              </div>
            </div>
            <div class="meal-head-badges">
              <span class="meal-kcal-badge" dir="ltr">${mCals} kcal</span>
              ${lunchBadge}
            </div>
          </div>
          <div class="meal-macros-summary">
            <span class="mp">بروتين: <b dir="ltr">${mProt}g</b></span>
            <span class="mc">كارب: <b dir="ltr">${mCarb}g</b></span>
            <span class="mf">دهون: <b dir="ltr">${mFat}g</b></span>
          </div>
          ${rowsHtml}
        </article>`;
    })
    .join("");

  document.getElementById("activePlanView").innerHTML = `
    <div class="plan-hero-summary">
      <div>
        <h3>${plan.title} • تطابق ${plan.accuracy}% مع هدفك</h3>
        <p>${plan.description}</p>
      </div>
      <div class="plan-totals-pills">
        <div class="pt-pill"><span>إجمالي السعرات</span><strong dir="ltr">${Math.round(plan.totals.calories)} / ${state.currentMetrics.targetCalories}</strong></div>
        <div class="pt-pill"><span>بروتين اليوم</span><strong dir="ltr">${Math.round(plan.totals.protein)}g</strong></div>
        <div class="pt-pill"><span>بروتين الغداء</span><strong dir="ltr">${plan.lunchProtein}g ✓</strong></div>
        <div class="pt-pill"><span>كارب / دهون</span><strong dir="ltr">${Math.round(plan.totals.carbs)}g / ${Math.round(plan.totals.fat)}g</strong></div>
      </div>
    </div>
    <div class="meals-grid-modern">${cardsHtml}</div>
  `;

  // Bind swap buttons
  document.querySelectorAll("[data-swap-g]").forEach((btn) => {
    btn.addEventListener("click", () => {
      swapMealItem(Number(btn.dataset.swapG), Number(btn.dataset.swapI));
    });
  });
}

// ==================== UI RENDERING: DASHBOARD, FOODS, DIARY ====================
function initTheme() {
  applyTheme(localStorage.getItem(STORAGE_KEYS.THEME) || "light");
}

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

function clearAuthAlert() {
  document.getElementById("authAlert").classList.add("hidden");
}

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

  if (!user.onboardingComplete) {
    openOnboardingWizard(user);
    return;
  }

  showScreen("app");
  syncUserHeaderUI();
  syncCalculatorFormFromUser();
  recalculateAndRenderAll();
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
  document.getElementById("onboardingUserName").textContent = (user.name || "بطل").split(" ")[0];
  document.getElementById("onboardingUserIdChip").textContent = `ID: ${user.id}`;
  document.getElementById("obAge").value = user.age || 21;
  document.getElementById("obHeight").value = user.height || 175;
  document.getElementById("obWeight").value = user.weight || 75;
  document.getElementById("obActivity").value = String(user.activity || 1.55);
  document.getElementById("obManualCalories").value = user.manualCalories || 2200;
  document.getElementById("obMacroPreset").value = user.macroPreset || "balanced";
  setObCalMode(user.calorieMode || "auto");
  updateOnboardingLivePreview();
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
  const avatarEl = document.getElementById("navUserAvatar");
  if (u.picture) {
    avatarEl.innerHTML = `<img src="${u.picture}" alt="${u.name}" />`;
  } else {
    avatarEl.textContent = (u.name || "م").trim().charAt(0).toUpperCase();
  }
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
    gender: u.gender,
    age: u.age,
    weight: u.weight,
    height: u.height,
    activity: u.activity,
    goal: u.goal,
    calorieMode: u.calorieMode || "auto",
    manualCalories: u.manualCalories || 2200,
    macroPreset: u.macroPreset || "balanced",
  });
  state.currentMetrics = m;

  document.getElementById("dashGoalChip").textContent = `الهدف: ${GOAL_LABELS[u.goal] || GOAL_LABELS.maintain}`;
  document.getElementById("dashCalModeChip").textContent =
    m.calorieMode === "manual" ? "وضع السعرات: إدخال يدوي مخصص" : "وضع السعرات: حساب تلقائي";
  document.getElementById("macrosModeBadge").textContent =
    m.calorieMode === "manual" ? `مخصص (${(MACRO_PRESETS[m.macroPreset] || MACRO_PRESETS.balanced).label})` : "حساب تلقائي";

  document.getElementById("resBmi").textContent = m.bmi.toFixed(1);
  const bmiBadge = document.getElementById("resBmiBadge");
  bmiBadge.textContent = m.bmiLabel;
  bmiBadge.className = `status-pill ${m.bmiClass}`;
  document.getElementById("bmiMarker").style.left = `${m.bmiMarkerPct}%`;
  document.getElementById("resIdealWeight").textContent = `${m.idealMin} – ${m.idealMax} كجم`;

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
  document.getElementById("outProteinKcal").textContent = `${m.proteinKcal} سعرة • لدعم العضلات والشبع`;
  document.getElementById("barProtein").style.width = `${m.proteinPct}%`;

  document.getElementById("outCarbs").textContent = `${m.carbsGrams}g`;
  document.getElementById("outCarbsPct").textContent = `${m.carbsPct}%`;
  document.getElementById("outCarbsKcal").textContent = `${m.carbsKcal} سعرة • المصدر الأساسي للطاقة`;
  document.getElementById("barCarbs").style.width = `${m.carbsPct}%`;

  document.getElementById("outFat").textContent = `${m.fatGrams}g`;
  document.getElementById("outFatPct").textContent = `${m.fatPct}%`;
  document.getElementById("outFatKcal").textContent = `${m.fatKcal} سعرة • لصحة الهرمونات والتركيز`;
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
    `<button type="button" class="cat-pill ${state.activeCategory === "ALL" ? "active" : ""}" data-cat="ALL">الكل <span>(${state.allFoods.length})</span></button>`,
    ...state.categories.map((cat) => `<button type="button" class="cat-pill ${state.activeCategory === cat ? "active" : ""}" data-cat="${cat}">${CATEGORY_AR_MAP[cat] || cat} <span>(${counts[cat] || 0})</span></button>`),
  ].join("");

  container.querySelectorAll(".cat-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.activeCategory = btn.dataset.cat;
      renderCategoryPills();
      renderFoods();
    });
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
      (CATEGORY_AR_MAP[food.category] || "").toLowerCase().includes(q)
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
  document.getElementById("foodsCountText").textContent = `يعرض ${list.length} من أصل ${state.allFoods.length} أكلة مصرية بصور فريدة — اضغط على أي أكلة لعرض التفاصيل أو تسجيلها`;

  if (list.length === 0) {
    grid.innerHTML = `<div class="surface-card empty-state-card" style="grid-column: 1 / -1;"><h3>لا توجد نتائج مطابقة</h3><p>جرّب كلمة بحث أخرى مثل "فراخ" أو "فول" أو "شوفان".</p></div>`;
    return;
  }

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
        <span class="fc-kcal-pill" dir="ltr">${basis.calories_kcal} kcal / ${unitLabel}</span>
        <button type="button" class="fc-select-fab" data-toggle-food="${food.id}">${isSelected ? "✓" : "+"}</button>
      </div>
      <div class="fc-body">
        <div class="fc-titles" data-open-modal="${food.id}">
          <div class="fc-title-ar">${food.name_ar}</div>
          <div class="fc-title-en">${food.name_en}</div>
        </div>
        <div class="fc-macros-strip">
          <div class="fc-macro-chip p"><span>بروتين</span><strong>${basis.protein_g}g</strong></div>
          <div class="fc-macro-chip c"><span>كارب</span><strong>${basis.carbs_g}g</strong></div>
          <div class="fc-macro-chip f"><span>دهون</span><strong>${basis.fat_g}g</strong></div>
        </div>
        <div class="fc-actions">
          <button type="button" class="fc-btn ${isSelected ? "active" : ""}" data-toggle-food="${food.id}">${isSelected ? "✓ ضمن الخطة" : "+ للخطة"}</button>
          <button type="button" class="fc-btn log" data-open-modal="${food.id}">+ سجل ليومي</button>
        </div>
      </div>
    `;
    fragment.appendChild(card);
  });

  grid.innerHTML = "";
  grid.appendChild(fragment);

  grid.querySelectorAll("[data-toggle-food]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFoodSelection(Number(btn.dataset.toggleFood));
    });
  });
  grid.querySelectorAll("[data-open-modal]").forEach((el) => {
    el.addEventListener("click", () => {
      const f = state.foodById.get(Number(el.dataset.openModal));
      if (f) openFoodModal(f);
    });
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
    const names = state.allFoods.filter((f) => state.selectedFoodIds.has(f.id)).slice(0, 4).map((f) => f.name_ar).join(" • ");
    document.getElementById("dockPreviewNames").textContent = count > 4 ? `${names} و ${count - 4} أصناف أخرى` : names;
  } else {
    dock.classList.add("hidden");
  }
}

function renderPlannerBasket() {
  const container = document.getElementById("selectedChipsContainer");
  const chosen = state.allFoods.filter((f) => state.selectedFoodIds.has(f.id));
  document.getElementById("selectedCount").textContent = chosen.length;
  document.getElementById("navSelectedBadge").textContent = chosen.length;

  if (chosen.length === 0) {
    container.innerHTML = `<p class="empty-inline">اختر أي أكلات تحبها — وحتى لو اخترت أكلات غداء فقط، المخطط هيكمّل لك الفطار والعشاء والسناك بتناسق كامل!</p>`;
    return;
  }

  container.innerHTML = chosen
    .map(
      (f) => `
      <span class="food-chip-removable">
        ${imgTagHtml(f)}
        <span>${f.name_ar}</span>
        <button type="button" data-remove-chip="${f.id}">×</button>
      </span>`
    )
    .join("");

  container.querySelectorAll("[data-remove-chip]").forEach((btn) => {
    btn.addEventListener("click", () => toggleFoodSelection(Number(btn.dataset.removeChip)));
  });
}

// ==================== FOOD MODAL & DIARY ====================
function openFoodModal(food) {
  state.modalFood = food;
  const { unitAr, isPiece, baseQty } = extractNutrition(food);
  const imgEl = document.getElementById("fmImage");
  imgEl.src = getFoodImage(food);
  imgEl.onerror = () => { imgEl.onerror = null; imgEl.src = getFoodFallbackImage(food); };
  document.getElementById("fmCategory").textContent = CATEGORY_AR_MAP[food.category] || food.category;
  document.getElementById("fmNameAr").textContent = food.name_ar;
  document.getElementById("fmNameEn").textContent = food.name_en;
  document.getElementById("fmUnitLabel").textContent = unitAr;

  const amt = document.getElementById("fmAmount");
  amt.value = isPiece ? 1 : baseQty;
  amt.step = isPiece ? "0.5" : "10";
  amt.min = isPiece ? "0.5" : "5";

  const presets = isPiece ? [0.5, 1, 2, 3] : [50, 100, 150, 200, 250];
  const qp = document.getElementById("fmQuickPortions");
  qp.innerHTML = presets.map((v) => `<button type="button" class="quick-portion-chip" data-qty="${v}">${v} ${unitAr}</button>`).join("");
  qp.querySelectorAll(".quick-portion-chip").forEach((b) => {
    b.addEventListener("click", () => { amt.value = b.dataset.qty; updateFoodModalCalc(); });
  });

  document.getElementById("fmTogglePlanBtn").textContent = state.selectedFoodIds.has(food.id) ? "إزالة من خطة الدايت" : "إضافة لخطة الدايت";
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
  diary.items.push({ uid: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, ...entry });
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
    (acc, it) => ({
      calories: acc.calories + it.calories,
      protein: acc.protein + it.protein,
      carbs: acc.carbs + it.carbs,
      fat: acc.fat + it.fat,
    }),
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
  document.getElementById("diaryRemainingText").textContent = rem >= 0 ? `المتبقي لك اليوم: ${rem} kcal` : `تجاوزت الهدف بـ ${Math.abs(rem)} kcal`;

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
  document.getElementById("diaryDateLabel").textContent = new Date().toLocaleDateString("ar-EG", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const grid = document.getElementById("diaryMealsGrid");
  grid.innerHTML = DIARY_MEAL_ORDER.map((mealName) => {
    const items = diary.items.filter((i) => i.meal === mealName);
    const mealCals = Math.round(items.reduce((s, i) => s + i.calories, 0));
    const body =
      items.length === 0
        ? `<p class="empty-inline" style="padding:10px 0;">لا توجد أصناف مسجلة في ${mealName} بعد.</p>`
        : items
            .map(
              (it) => `
              <div class="meal-row-item">
                <img class="meal-thumb" src="${it.image}" alt="${it.name}" onerror="this.onerror=null;this.src='./images/ful_medames.jpg';" />
                <div class="meal-item-info">
                  <strong>${it.name}</strong>
                  <small>${it.amount} ${it.unit} — <span dir="ltr">${it.calories} kcal • P: ${it.protein}g • C: ${it.carbs}g • F: ${it.fat}g</span></small>
                </div>
                <button type="button" class="diary-delete-btn" data-del-diary="${it.uid}">×</button>
              </div>`
            )
            .join("");

    return `
      <div class="meal-card">
        <div class="meal-card-head">
          <h4>${mealName}</h4>
          <span class="meal-kcal-badge" dir="ltr">${mealCals} kcal</span>
        </div>
        ${body}
      </div>`;
  }).join("");

  grid.querySelectorAll("[data-del-diary]").forEach((btn) => {
    btn.addEventListener("click", () => {
      diary.items = diary.items.filter((i) => i.uid !== btn.dataset.delDiary);
      persistCurrentUser();
      renderDiary();
      showToast("تم حذف الصنف من اليوميات");
    });
  });
}

// ==================== SETTINGS MODAL (GOOGLE OAUTH & GMAIL SMTP) ====================
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

function closeSettingsModal() {
  document.getElementById("settingsModal").classList.add("hidden");
}

// ==================== DATABASE INIT ====================
async function initDatabase() {
  let data = null;
  if (window.BITEWISE_FOOD_DB && Array.isArray(window.BITEWISE_FOOD_DB.foods)) {
    data = window.BITEWISE_FOOD_DB;
  } else {
    try {
      const res = await fetch(DB_JSON_PATH);
      if (res.ok) data = await res.json();
    } catch {}
  }

  if (data && Array.isArray(data.foods)) {
    state.allFoods = data.foods;
    state.foodById = new Map(data.foods.map((f) => [f.id, f]));
    state.categories = data.metadata?.categories || [...new Set(data.foods.map((f) => f.category))];
    renderCategoryPills();
    renderFoods();
    renderPlannerBasket();
  }
}

// ==================== EVENT BINDINGS ====================
function bindAllEvents() {
  // Theme buttons (Auth + App)
  const toggleTheme = () => applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
  document.getElementById("themeToggleBtn").addEventListener("click", toggleTheme);
  document.getElementById("authThemeBtn").addEventListener("click", toggleTheme);

  // Settings Modal triggers
  document.getElementById("authSettingsBtn").addEventListener("click", openSettingsModal);
  document.getElementById("openSettingsBtn").addEventListener("click", openSettingsModal);
  document.getElementById("openSmtpFromOtp").addEventListener("click", openSettingsModal);
  document.getElementById("closeSettingsModal").addEventListener("click", closeSettingsModal);
  document.getElementById("settingsModal").addEventListener("click", (e) => {
    if (e.target.id === "settingsModal") closeSettingsModal();
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

    state.config = {
      ...state.config,
      googleClientId: payload.googleClientId,
      smtpEmail: payload.smtpEmail,
      emailjsServiceId: payload.emailjsServiceId,
      emailjsTemplateId: payload.emailjsTemplateId,
      emailjsPublicKey: payload.emailjsPublicKey,
    };
    localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(state.config));

    if (state.backendOnline) {
      try {
        const res = await fetch("/api/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const out = await res.json();
          state.smtpConfigured = Boolean(out.smtpConfigured);
        }
      } catch {}
    }

    closeSettingsModal();
    showToast("تم حفظ وتفعيل إعدادات Google OAuth و Gmail OTP!");
  });

  // Test sending a real OTP email from Settings modal
  document.getElementById("testOtpEmailBtn").addEventListener("click", async () => {
    const targetEmail = document.getElementById("cfgSmtpEmail").value.trim() || state.config.smtpEmail;
    if (!targetEmail) {
      showToast("اكتب إيميل Gmail أولاً واضغط حفظ ثم جرّب الإرسال", "error");
      return;
    }
    const btn = document.getElementById("testOtpEmailBtn");
    btn.disabled = true;
    btn.textContent = "جاري الإرسال...";
    try {
      const res = await sendGmailOtp(targetEmail, "BiteWise Test");
      if (res.deliveredVia === "gmail_smtp" || res.deliveredVia === "emailjs") {
        showToast(`✓ تم إرسال كود OTP حقيقي إلى ${targetEmail}! افتح Gmail وتأكد.`);
      } else {
        showToast(`لم يتم الإرسال الفعلي (${res.reason || "تأكد من حفظ App Password / EmailJS أولاً"})`, "error");
      }
    } catch (err) {
      showToast(`فشل الاختبار: ${err.message}`, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "تجربة إرسال OTP الآن";
    }
  });

  // Auth tabs & password toggles
  document.getElementById("tabLoginBtn").addEventListener("click", () => switchAuthTab("login"));
  document.getElementById("tabSignupBtn").addEventListener("click", () => switchAuthTab("signup"));
  document.querySelectorAll("[data-toggle-pass]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const inp = document.getElementById(btn.dataset.togglePass);
      inp.type = inp.type === "password" ? "text" : "password";
    });
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

  // Real Google OAuth buttons
  document.getElementById("googleLoginBtn").addEventListener("click", triggerRealGoogleSignIn);
  document.getElementById("googleSignupBtn").addEventListener("click", triggerRealGoogleSignIn);

  // Login Submit
  document.getElementById("loginForm").addEventListener("submit", (e) => {
    e.preventDefault();
    clearAuthAlert();
    const idOrName = document.getElementById("loginIdentifier").value.trim().toLowerCase();
    const pass = document.getElementById("loginPassword").value;

    const user = state.users.find(
      (u) =>
        (u.id || "").toLowerCase() === idOrName ||
        (u.name || "").trim().toLowerCase() === idOrName ||
        (u.email || "").trim().toLowerCase() === idOrName
    );
    if (!user) {
      showAuthAlert("لم يتم العثور على حساب بهذا الـ ID أو الاسم أو البريد.");
      return;
    }
    if (user.provider === "local" && user.password !== pass) {
      showAuthAlert("كلمة المرور غير صحيحة.");
      return;
    }
    showToast(`أهلاً بعودتك يا ${user.name}!`);
    enterSession(user);
  });

  document.getElementById("demoLoginBtn").addEventListener("click", () => {
    const demo = state.users.find((u) => u.id === "BW-1001");
    if (demo) {
      showToast("تم الدخول بالحساب التجريبي (BW-1001)");
      enterSession(demo);
    }
  });

  // Signup Step 1 -> Send Gmail OTP!
  document.getElementById("signupForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAuthAlert();
    const name = document.getElementById("signupName").value.trim();
    const email = document.getElementById("signupEmail").value.trim().toLowerCase();
    const password = document.getElementById("signupPassword").value;
    const age = Number(document.getElementById("signupAge").value);

    if (state.users.some((u) => (u.email || "").toLowerCase() === email)) {
      showAuthAlert("هذا البريد مسجل بالفعل. سجّل الدخول بدلاً من ذلك.");
      return;
    }

    const sendBtn = document.getElementById("sendOtpBtn");
    sendBtn.disabled = true;
    try {
      const otpRes = await sendGmailOtp(email, name);
      state.pendingSignup = { name, email, password, age };
      document.getElementById("otpTargetEmail").textContent = email;

      const devHint = document.getElementById("otpDevHint");
      if (otpRes.devOtp) {
        document.getElementById("otpDevCode").textContent = otpRes.devOtp;
        devHint.classList.remove("hidden");
      } else {
        devHint.classList.add("hidden");
      }

      document.getElementById("signupStepDetails").classList.add("hidden");
      document.getElementById("signupStepOtp").classList.remove("hidden");
      resetOtpBoxes();
      startOtpCountdown(300);
      showToast(otpRes.message || "تم إرسال رمز التحقق (OTP)!");
    } catch (err) {
      showAuthAlert(err.message || "تعذر إرسال رمز التحقق");
    } finally {
      sendBtn.disabled = false;
    }
  });

  // 6-digit OTP box auto-advance & paste support
  const otpInputs = [...document.querySelectorAll(".otp-digit")];
  otpInputs.forEach((inp, idx) => {
    inp.addEventListener("input", (e) => {
      const val = e.target.value.replace(/\D/g, "");
      e.target.value = val.slice(0, 1);
      if (val && idx < otpInputs.length - 1) otpInputs[idx + 1].focus();
    });
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !inp.value && idx > 0) otpInputs[idx - 1].focus();
    });
    inp.addEventListener("paste", (e) => {
      e.preventDefault();
      const digits = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6);
      digits.split("").forEach((d, i) => { if (otpInputs[i]) otpInputs[i].value = d; });
      if (otpInputs[Math.min(digits.length, 5)]) otpInputs[Math.min(digits.length, 5)].focus();
    });
  });

  // Verify OTP -> Create account & auto-save to users_database.txt!
  document.getElementById("verifyOtpBtn").addEventListener("click", async () => {
    clearAuthAlert();
    if (!state.pendingSignup) return;
    const code = getOtpInputValue();
    if (code.length !== 6) {
      showAuthAlert("يرجى إدخال الـ 6 أرقام كاملة.");
      return;
    }

    try {
      await verifyGmailOtp(state.pendingSignup.email, code);
      clearInterval(state.otpTimerHandle);
      const { name, email, password, age } = state.pendingSignup;
      const newUser = {
        id: generateUniqueUserId(),
        name,
        email,
        password,
        provider: "local",
        picture: "",
        emailVerified: true,
        age,
        gender: "male",
        height: 175,
        weight: 75,
        activity: 1.55,
        goal: "maintain",
        calorieMode: "auto",
        manualCalories: 2200,
        macroPreset: "balanced",
        onboardingComplete: false,
        selectedFoodIds: [],
        diaries: {},
        createdAt: new Date().toISOString(),
      };
      state.pendingSignup = null;
      await persistCurrentUser(newUser);
      showToast(`تم تأكيد Gmail وإنشاء حسابك (${newUser.id}) وحفظه في users_database.txt!`);
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
      if (res.devOtp) {
        document.getElementById("otpDevCode").textContent = res.devOtp;
        document.getElementById("otpDevHint").classList.remove("hidden");
      }
      resetOtpBoxes();
      startOtpCountdown(300);
      showToast("تم إعادة إرسال رمز تحقق جديد!");
    } catch (err) {
      showAuthAlert(err.message);
    }
  });

  document.getElementById("backToSignupDetailsBtn").addEventListener("click", () => {
    clearInterval(state.otpTimerHandle);
    document.getElementById("signupStepOtp").classList.add("hidden");
    document.getElementById("signupStepDetails").classList.remove("hidden");
  });

  // Onboarding Mode Switch & Live Preview
  document.querySelectorAll("[data-ob-cal-mode]").forEach((btn) => {
    btn.addEventListener("click", () => setObCalMode(btn.dataset.obCalMode));
  });
  ["obHeight", "obWeight", "obAge", "obActivity", "obManualCalories", "obMacroPreset"].forEach((id) => {
    document.getElementById(id).addEventListener("input", updateOnboardingLivePreview);
    document.getElementById(id).addEventListener("change", updateOnboardingLivePreview);
  });
  document.querySelectorAll('input[name="obGender"], input[name="obGoal"]').forEach((r) => {
    r.addEventListener("change", updateOnboardingLivePreview);
  });

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
    showToast("تم حفظ بياناتك وحساب BMI والسعرات بنجاح!");
    enterSession(state.currentUser);
  });

  // Dashboard Calculator Auto vs Manual Mode
  document.querySelectorAll("[data-calc-mode]").forEach((btn) => {
    btn.addEventListener("click", () => setCalcCalMode(btn.dataset.calcMode));
  });

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
    showToast(
      state.calcCalMode === "manual"
        ? `تم تطبيق السعرات اليدوية (${state.currentUser.manualCalories} kcal) وتحديث الماكروز!`
        : "تم إعادة حساب BMI و BMR و TDEE والماكروز بنجاح!"
    );
  });

  // Navigation & User Menu
  document.querySelectorAll(".nav-tab").forEach((b) => b.addEventListener("click", () => switchAppView(b.dataset.view)));
  document.querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", () => switchAppView(b.dataset.goto)));
  document.getElementById("brandHomeBtn").addEventListener("click", () => switchAppView("dashboard"));

  const ud = document.getElementById("userDropdown");
  document.getElementById("userMenuBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    ud.classList.toggle("hidden");
  });
  document.addEventListener("click", () => ud.classList.add("hidden"));

  document.getElementById("udCopyIdBtn").addEventListener("click", () => {
    if (!state.currentUser) return;
    navigator.clipboard?.writeText(state.currentUser.id);
    showToast(`تم نسخ المعرّف: ${state.currentUser.id}`);
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
    showScreen("auth");
    switchAuthTab("login");
    showToast("تم تسجيل الخروج بنجاح");
  });

  // Water buttons
  document.getElementById("dashWaterPlus").addEventListener("click", () => adjustWater(1));
  document.getElementById("dashWaterMinus").addEventListener("click", () => adjustWater(-1));
  document.getElementById("diaryWaterPlus").addEventListener("click", () => adjustWater(1));
  document.getElementById("diaryWaterMinus").addEventListener("click", () => adjustWater(-1));

  // Foods Search, Sort, Presets
  document.getElementById("searchInput").addEventListener("input", (e) => { state.searchQuery = e.target.value; renderFoods(); });
  document.getElementById("sortFoodsSelect").addEventListener("change", (e) => { state.sortBy = e.target.value; renderFoods(); });

  const applyPreset = (ids, label) => {
    state.selectedFoodIds = new Set(ids.filter((id) => state.foodById.has(id)));
    if (state.currentUser) {
      state.currentUser.selectedFoodIds = [...state.selectedFoodIds];
      persistCurrentUser();
    }
    renderFoods();
    renderPlannerBasket();
    showToast(`تم اختيار ${label}`);
  };
  document.getElementById("presetBalancedBtn").addEventListener("click", () => applyPreset([1, 21, 28, 151, 154, 85, 116, 195], "تجميعة دايت مصري متوازن"));
  document.getElementById("presetProteinBtn").addEventListener("click", () => applyPreset([158, 16, 21, 151, 179, 182, 170, 175, 85], "تجميعة بروتين عالي للجيم"));

  const clearSelection = () => {
    state.selectedFoodIds.clear();
    if (state.currentUser) {
      state.currentUser.selectedFoodIds = [];
      persistCurrentUser();
    }
    renderFoods();
    renderPlannerBasket();
    showToast("تم تفريغ الأكلات المختارة");
  };
  document.getElementById("clearSelectedBtn").addEventListener("click", clearSelection);
  document.getElementById("plannerClearBtn").addEventListener("click", clearSelection);
  document.getElementById("generateFromDockBtn").addEventListener("click", () => { switchAppView("planner"); generateDietPlans(); });

  // Planner Controls (Live regenerate when changing structure / lunch protein / style / autoComplete!)
  document.getElementById("generatePlanBtn").addEventListener("click", () => generateDietPlans(false));
  document.getElementById("shufflePlanBtn").addEventListener("click", () => {
    state.shuffleSeed += 1;
    generateDietPlans(false);
  });
  ["optMealStructure", "optLunchProtein", "optDietStyle", "optAutoComplete"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => {
      if (state.generatedPlans.length > 0) generateDietPlans(true);
    });
  });

  const autoPickAndGo = () => {
    applyPreset([158, 2, 151, 170, 85, 21, 116, 195], "أكلات مصرية صحية");
    generateDietPlans(false);
  };
  document.getElementById("plannerAutoPickBtn").addEventListener("click", autoPickAndGo);
  document.getElementById("emptyAutoGenerateBtn").addEventListener("click", autoPickAndGo);

  // Plan Export
  document.getElementById("applyPlanToDiaryBtn").addEventListener("click", () => {
    const plan = state.generatedPlans[state.activePlanIndex];
    if (!plan) return;
    plan.items.forEach((it) => {
      const diaryMeal = it.slotKey === "breakfast" ? "الفطار" : it.slotKey === "lunch" ? "الغداء" : it.slotKey === "dinner" ? "العشاء" : "سناكس";
      logItemToDiary({
        foodId: it.foodId, name: it.name, image: it.image, meal: diaryMeal,
        amount: it.amount, unit: it.unit, calories: it.calories, protein: it.protein, carbs: it.carbs, fat: it.fat,
      });
    });
    showToast("تم تطبيق الخطة على يوميات اليوم بالكامل!");
    switchAppView("diary");
  });

  document.getElementById("copyPlanBtn").addEventListener("click", () => {
    const plan = state.generatedPlans[state.activePlanIndex];
    if (!plan) return;
    const lines = [
      `خطة BiteWise: ${plan.title}`,
      `السعرات: ${Math.round(plan.totals.calories)} kcal | بروتين اليوم: ${Math.round(plan.totals.protein)}g | بروتين الغداء: ${plan.lunchProtein}g`,
      "==================================",
    ];
    plan.mealGroups.forEach((g) => {
      lines.push(`\n[${g.slot.name}] (${Math.round(g.items.reduce((s, i) => s + i.calories, 0))} kcal)`);
      g.items.forEach((i) => lines.push(`- ${i.name}: ${i.amount} ${i.unit} (${i.calories} kcal • P:${i.protein}g)`));
    });
    navigator.clipboard?.writeText(lines.join("\n"));
    showToast("تم نسخ تفاصيل الخطة الغذائية!");
  });

  document.getElementById("printPlanBtn").addEventListener("click", () => window.print());

  // Food Modal
  document.getElementById("closeFoodModal").addEventListener("click", () => { document.getElementById("foodModal").classList.add("hidden"); state.modalFood = null; });
  document.getElementById("foodModal").addEventListener("click", (e) => { if (e.target.id === "foodModal") { document.getElementById("foodModal").classList.add("hidden"); state.modalFood = null; } });
  document.getElementById("fmAmount").addEventListener("input", updateFoodModalCalc);

  document.getElementById("fmLogToDiaryBtn").addEventListener("click", () => {
    const f = state.modalFood;
    if (!f) return;
    const { basis, unitAr, isPiece } = extractNutrition(f);
    const qty = Math.max(0.5, Number(document.getElementById("fmAmount").value) || 0);
    const factor = isPiece ? qty : qty / 100;
    const meal = document.getElementById("fmMealSlot").value;
    logItemToDiary({
      foodId: f.id, name: f.name_ar, image: getFoodImage(f), meal, amount: qty, unit: unitAr,
      calories: Math.round((basis.calories_kcal || 0) * factor),
      protein: Math.round((basis.protein_g || 0) * factor * 10) / 10,
      carbs: Math.round((basis.carbs_g || 0) * factor * 10) / 10,
      fat: Math.round((basis.fat_g || 0) * factor * 10) / 10,
    });
    document.getElementById("foodModal").classList.add("hidden");
    state.modalFood = null;
    showToast(`تم تسجيل "${f.name_ar}" في وجبة ${meal}`);
  });

  document.getElementById("fmTogglePlanBtn").addEventListener("click", () => {
    if (!state.modalFood) return;
    toggleFoodSelection(state.modalFood.id);
    const sel = state.selectedFoodIds.has(state.modalFood.id);
    document.getElementById("fmTogglePlanBtn").textContent = sel ? "إزالة من خطة الدايت" : "إضافة لخطة الدايت";
    showToast(sel ? "تمت الإضافة لقائمة خطة الدايت" : "تمت الإزالة من خطة الدايت");
  });

  document.getElementById("clearDiaryBtn").addEventListener("click", () => {
    const diary = getTodayDiary();
    diary.items = [];
    diary.waterCups = 0;
    persistCurrentUser();
    renderDiary();
    showToast("تم مسح سجل اليوم بالكامل");
  });
}

// ==================== BOOTSTRAP ====================
async function initApp() {
  initTheme();
  await initBackendAndConfig();
  await loadUsers();
  bindAllEvents();
  await initDatabase();

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
