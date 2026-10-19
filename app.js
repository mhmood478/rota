import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getDatabase, ref, onValue, get, set, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const SPECIALTIES = [
  { id: "medicine", name: "Medicine" },
  { id: "surgery", name: "Surgery" },
  { id: "paediatrics", name: "Paediatrics" },
  { id: "gynaecology", name: "Gynaecology" },
  { id: "ophthalmology", name: "Ophthalmology" },
  { id: "ent", name: "ENT" },
  { id: "dental", name: "Dental" },
  { id: "nephrology", name: "Nephrology" },
  { id: "psychiatry", name: "Psychiatry" }
];
const OMAN_TZ = "Asia/Muscat";
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const view = params.get("view") === "edit" ? "edit" : "display";
const requestedSpecialty = params.get("specialty");
let app, auth, db, currentUser = null, userAccess = null, unsubscribeRota = null;
let currentMonthEntries = {};
let savedMonthSnapshot = {};
let lastSavedAt = null;
let clockTimer = null;

function setVisible(id, visible) { $(id).classList.toggle("hidden", !visible); }
function setConnection(text, state="wait") {
  const el = $("connectionBadge");
  el.textContent = text;
  el.className = `status-pill status-${state}`;
}
function safeText(value) { return String(value ?? "").trim(); }
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}
function omanParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: OMAN_TZ, year:"numeric", month:"2-digit", day:"2-digit"
  }).formatToParts(date);
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return { year: p.year, month: p.month, day: p.day, key: `${p.year}-${p.month}-${p.day}`, monthKey: `${p.year}-${p.month}` };
}
function formatOmanDate(date = new Date(), options = {}) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: OMAN_TZ, weekday:"long", day:"numeric", month:"long", year:"numeric", ...options }).format(date);
}
function updateClock() {
  const now = new Date();
  $("clockTime").textContent = new Intl.DateTimeFormat("en-GB", { timeZone: OMAN_TZ, hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false }).format(now);
  $("clockDate").textContent = formatOmanDate(now);
  $("todayLabel").textContent = formatOmanDate(now, { weekday:"short", day:"numeric", month:"short", year:"numeric" });
  renderDisplay();
}
function validConfig() {
  return firebaseConfig && firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("PASTE_") &&
    firebaseConfig.projectId && !firebaseConfig.projectId.startsWith("YOUR_") &&
    firebaseConfig.databaseURL && !firebaseConfig.databaseURL.includes("YOUR_DATABASE");
}
function showAuth() {
  setVisible("loadingView", false); setVisible("authView", true);
  setVisible("displayView", false); setVisible("editView", false);
  setConnection("Sign-in required", "wait");
}
function showError(message) {
  $("authError").textContent = message;
}
async function start() {
  if (!validConfig()) {
    setVisible("loadingView", false);
    setVisible("authView", true);
    $("authError").textContent = "Firebase is not configured yet. Follow README.md, create firebase-config.js, and reload this page.";
    setConnection("Setup required", "error");
    $("loginForm").addEventListener("submit", e => e.preventDefault());
    return;
  }
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getDatabase(app);
    await setPersistence(auth, browserLocalPersistence);
    $("loginForm").addEventListener("submit", handleLogin);
    $("signOutButton").addEventListener("click", handleSignOut);
    $("signOutButtonEdit").addEventListener("click", handleSignOut);
    onAuthStateChanged(auth, async user => {
      currentUser = user;
      if (!user) { if (unsubscribeRota) unsubscribeRota(); showAuth(); return; }
      try {
        const accessSnap = await get(ref(db, `editorAccess/${user.uid}`));
        userAccess = accessSnap.exists() ? accessSnap.val() : null;
        if (!userAccess || userAccess.enabled !== true) {
          await signOut(auth);
          showAuth();
          showError("This account has not been authorized. Contact the Firebase administrator.");
          return;
        }
        setVisible("authView", false);
        setVisible("loadingView", false);
        setConnection("Connected", "live");
        if (view === "edit") setupEditor();
        else setupDisplay();
      } catch (err) {
        showAuth();
        showError(`Could not verify access: ${friendlyError(err)}`);
      }
    });
  } catch (err) {
    setVisible("loadingView", false); setVisible("authView", true);
    showError(`Firebase initialization failed: ${friendlyError(err)}`);
    setConnection("Connection error", "error");
  }
}
async function handleLogin(event) {
  event.preventDefault(); showError("");
  const button = $("loginForm").querySelector("button[type=submit]");
  button.disabled = true; button.textContent = "Signing in…";
  try { await signInWithEmailAndPassword(auth, $("emailInput").value.trim(), $("passwordInput").value); }
  catch (err) { showError(friendlyError(err)); }
  finally { button.disabled = false; button.textContent = "Sign in securely"; }
}
async function handleSignOut() {
  if (unsubscribeRota) unsubscribeRota();
  await signOut(auth);
}
function friendlyError(err) {
  const code = err?.code || "";
  const map = {
    "auth/invalid-credential":"Email or password is incorrect.",
    "auth/invalid-email":"Enter a valid email address.",
    "auth/too-many-requests":"Too many attempts. Wait a while and try again.",
    "PERMISSION_DENIED":"Permission denied by Firebase database rules.",
    "permission-denied":"Permission denied by Firebase database rules.",
    "auth/network-request-failed":"Network error. Check the connection and try again."
  };
  return map[code] || err?.message || "Unexpected error.";
}
function setupDisplay() {
  setVisible("displayView", true); setVisible("editView", false);
  if (unsubscribeRota) unsubscribeRota();
  unsubscribeRota = onValue(ref(db, "rotas"), snap => {
    window.rotaData = snap.val() || {};
    lastSavedAt = new Date();
    $("lastUpdated").textContent = `Live sync · updated ${new Intl.DateTimeFormat("en-GB",{timeZone:OMAN_TZ,hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(lastSavedAt)}`;
    setConnection("Live updates", "live");
    renderDisplay();
  }, err => {
    setConnection("Sync error", "error");
    $("lastUpdated").textContent = `Could not load rota: ${friendlyError(err)}`;
  });
  if (!clockTimer) clockTimer = setInterval(updateClock, 1000);
  updateClock();
}
function getEntry(specialtyId, dateKey) {
  const [year, month] = dateKey.slice(0,7).split("-");
  return window.rotaData?.[specialtyId]?.[`${year}-${month}`]?.days?.[dateKey.slice(-2)] || null;
}
function phoneMarkup(phone) {
  const p = safeText(phone);
  if (!p) return "";
  const tel = p.replace(/[^\d+*#,;]/g, "");
  return `<div class="doctor-phone">${/^[+\d*#,;]+$/.test(tel) ? `<a href="tel:${escapeHtml(tel)}">${escapeHtml(p)}</a>` : escapeHtml(p)}</div>`;
}
function renderDoctor(label, name, phone, isSecond=false) {
  const n = safeText(name);
  return `<div class="doctor-row ${isSecond ? "second" : ""}">
    <div class="role-icon">${isSecond ? "2" : "1"}</div>
    <div class="doctor-content"><div class="role-label">${label}</div>
      ${n ? `<div class="doctor-name">${escapeHtml(n)}</div>${phoneMarkup(phone)}` : `<div class="doctor-empty">Not entered</div>`}
    </div>
  </div>`;
}
function renderDisplay() {
  if (!$("specialtyGrid") || $("displayView").classList.contains("hidden")) return;
  const today = omanParts().key;
  let count = 0;
  $("specialtyGrid").innerHTML = SPECIALTIES.map((s, i) => {
    const entry = getEntry(s.id, today);
    const first = safeText(entry?.firstName), second = safeText(entry?.secondName);
    if (first) count++;
    const missing = !first;
    return `<article class="specialty-card ${missing ? "missing" : ""}">
      <div class="card-top"><div class="specialty-name">${escapeHtml(s.name)}</div><div class="card-index">${String(i+1).padStart(2,"0")}</div></div>
      ${renderDoctor("FIRST ON-CALL", first, entry?.firstPhone)}
      <div class="card-divider"></div>
      ${renderDoctor("SECOND ON-CALL", second, entry?.secondPhone, true)}
      ${missing ? `<div class="missing-label">ROTA NOT ENTERED</div>` : ""}
    </article>`;
  }).join("");
  $("rotaCount").textContent = `${count} / ${SPECIALTIES.length} specialties updated`;
}
function setupEditor() {
  setVisible("editView", true); setVisible("displayView", false);
  const select = $("specialtySelect");
  select.innerHTML = SPECIALTIES.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
  const assigned = userAccess.specialty;
  if (assigned === "admin") {
    if (requestedSpecialty && SPECIALTIES.some(s=>s.id===requestedSpecialty)) select.value = requestedSpecialty;
    select.disabled = false;
  } else {
    select.value = assigned;
    select.disabled = true;
    $("editorPermission").textContent = `This account can edit ${SPECIALTIES.find(s=>s.id===assigned)?.name || assigned} only.`;
    setVisible("editorPermission", true);
  }
  const now = omanParts();
  $("monthSelect").value = now.monthKey;
  $("loadMonthButton").onclick = loadMonth;
  $("saveMonthButton").onclick = saveMonth;
  select.onchange = loadMonth;
  $("monthSelect").onchange = loadMonth;
  loadMonth();
}
async function loadMonth() {
  const specialty = $("specialtySelect").value;
  const month = $("monthSelect").value;
  if (!specialty || !/^\d{4}-\d{2}$/.test(month)) return;
  $("editorStatus").textContent = "Loading…";
  const [year, mm] = month.split("-");
  const daysInMonth = new Date(Number(year), Number(mm), 0).getDate();
  try {
    const snap = await get(ref(db, `rotas/${specialty}/${month}`));
    const data = snap.val() || {};
    currentMonthEntries = {};
    for (let day=1; day<=daysInMonth; day++) {
      const key = String(day).padStart(2,"0");
      currentMonthEntries[key] = { firstName:"", firstPhone:"", secondName:"", secondPhone:"", ...(data.days?.[key] || {}) };
    }
    savedMonthSnapshot = JSON.parse(JSON.stringify(currentMonthEntries));
    $("monthCaption").textContent = `${SPECIALTIES.find(s=>s.id===specialty)?.name} · ${new Date(Number(year),Number(mm)-1,1).toLocaleDateString("en-GB",{month:"long",year:"numeric"})}`;
    renderEditorRows(year, mm, daysInMonth);
    $("editorStatus").textContent = "Loaded";
  } catch (err) {
    $("editorStatus").textContent = friendlyError(err);
  }
}
function renderEditorRows(year, month, count) {
  const today = omanParts().key;
  $("rotaRows").innerHTML = Array.from({length:count}, (_,idx) => {
    const day = String(idx+1).padStart(2,"0"), key = `${year}-${month}-${day}`;
    const e = currentMonthEntries[day] || {};
    const weekday = new Intl.DateTimeFormat("en-GB",{timeZone:"UTC",weekday:"short"}).format(new Date(Date.UTC(Number(year),Number(month)-1,idx+1,12)));
    return `<tr data-day="${day}" class="${today===key?"today-row":""}">
      <td>${weekday}, ${day} ${month}</td>
      <td><input data-field="firstName" aria-label="${key} first on-call name" value="${escapeHtml(e.firstName)}" placeholder="Full name"></td>
      <td><input data-field="firstPhone" aria-label="${key} first phone" value="${escapeHtml(e.firstPhone)}" placeholder="Phone number" inputmode="tel"></td>
      <td><input data-field="secondName" aria-label="${key} second on-call name" value="${escapeHtml(e.secondName)}" placeholder="Full name"></td>
      <td><input data-field="secondPhone" aria-label="${key} second phone" value="${escapeHtml(e.secondPhone)}" placeholder="Phone / extension" inputmode="tel"></td>
    </tr>`;
  }).join("");
  $("rotaRows").querySelectorAll("input").forEach(input => input.addEventListener("input", e => {
    const row = e.target.closest("tr");
    currentMonthEntries[row.dataset.day][e.target.dataset.field] = e.target.value;
    $("editorStatus").textContent = "Unsaved changes";
  }));
}
async function saveMonth() {
  const specialty = $("specialtySelect").value, month = $("monthSelect").value;
  if (!specialty || !month) return;
  if (userAccess.specialty !== "admin" && userAccess.specialty !== specialty) {
    $("editorStatus").textContent = "This account cannot edit that specialty.";
    return;
  }
  const button = $("saveMonthButton");
  button.disabled = true; button.textContent = "Saving…";
  try {
    const cleanDays = {};
    for (const [day, entry] of Object.entries(currentMonthEntries)) {
      const cleaned = {
        firstName: safeText(entry.firstName),
        firstPhone: safeText(entry.firstPhone),
        secondName: safeText(entry.secondName),
        secondPhone: safeText(entry.secondPhone)
      };
      if (Object.values(cleaned).some(Boolean)) cleanDays[day] = cleaned;
    }
    await set(ref(db, `rotas/${specialty}/${month}`), {
      days: cleanDays,
      updatedAt: Date.now(),
      updatedBy: currentUser.uid
    });
    savedMonthSnapshot = JSON.parse(JSON.stringify(currentMonthEntries));
    $("editorStatus").textContent = `Saved successfully at ${new Intl.DateTimeFormat("en-GB",{timeZone:OMAN_TZ,hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(new Date())}`;
  } catch (err) {
    $("editorStatus").textContent = `Save failed: ${friendlyError(err)}`;
  } finally {
    button.disabled = false; button.textContent = "Save changes";
  }
}
start();
