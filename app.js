// Change these passcodes before publishing.
// They are visible in the source and are not secure authentication.
const PASSCODES = {
  medicine: "med123",
  surgery: "surg123",
  pediatrics: "peds123",
  ophthalmology: "eye123",
  ent: "ent123",
  dental: "dent123",
  gynecology: "gyn123",
  nephrology: "neph123",
  psychiatry: "psch123",
  extensions: "ext123"
};

const SPECIALTIES = [
  ["medicine", "Medicine", "💊", "#55d6be"],
  ["surgery", "Surgery", "🩺", "#ff8a65"],
  ["pediatrics", "Pediatrics", "🧸", "#ffd166"],
  ["cardiology", "Cardiology", "🫀", "#b39ddb"],
  ["orthopedics", "Orthopedics", "🦴", "#ffcc80"],
  ["ophthalmology", "Ophthalmology", "👁️", "#80aaff"],
  ["ent", "ENT", "👂", "#c792ea"],
  ["dental", "Dental", "🦷", "#4dd0e1"],
  ["gynecology", "Gynecology", "🌸", "#f48fb1"],
  ["nephrology", "Nephrology", "🫘", "#a5d6a7"],
  ["psychiatry", "Psychiatry", "🧠", "#b39ddb"],
  ["anesthesia", "Anesthesia", "⚕️", "#b39ddb"],


];


const $ = id => document.getElementById(id);
const defaultExtensions = Object.fromEntries(
  SPECIALTIES.map(([key]) => [key, { first: "", second: "" }])
);

let db = null;
let appData = { rotas: {}, extensions: defaultExtensions };

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  })[char]);
}

function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
function selectedMonth() { return $("rotaMonth").value || monthKey(); }
function emptyEntry() {
  return { firstName: "", firstPhone: "", secondName: "", secondPhone: "" };
}
function recordRef() {
  return db.collection("oncall").doc("main");
}

function initFirebase() {
  const config = window.FIREBASE_CONFIG;

  if (!config?.apiKey || config.apiKey.startsWith("YOUR_")) {
    $("loadStatus").textContent =
      "Add your Firebase configuration in firebase-config.js to enable shared data.";
    renderDisplay();
    return;
  }

  firebase.initializeApp(config);
  db = firebase.firestore();

  recordRef().onSnapshot(snapshot => {
    appData = snapshot.exists
      ? { ...appData, ...snapshot.data() }
      : { rotas: {}, extensions: defaultExtensions };

    appData.rotas ||= {};
    appData.extensions ||= defaultExtensions;
    $("loadStatus").textContent = "Live data connected.";
    renderDisplay();

    if (!$("rotaPage").classList.contains("hidden")) loadRotaSheet();
    if (!$("extensionsPage").classList.contains("hidden")) renderExtensionsEditor();
  }, error => {
    $("loadStatus").textContent = "Could not load shared data: " + error.message;
  });
}

function getEffectiveDate() {
  const now = new Date();
  const effective = new Date(now);
  if (now.getHours() < 7) effective.setDate(effective.getDate() - 1);
  return effective;
}

function renderDisplay() {
  const date = getEffectiveDate();
  const month = monthKey(date);
  const day = String(date.getDate());

  $("currentDate").textContent = date.toLocaleDateString(undefined, {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });
  $("currentTime").textContent = new Date().toLocaleTimeString(undefined, {
    hour: "2-digit", minute: "2-digit"
  });

  $("displayGrid").innerHTML = SPECIALTIES.map(([id, label, icon, color]) => {
    const entry = appData.rotas?.[month]?.[day]?.[id] || emptyEntry();
    const ext = appData.extensions?.[id] || {};

    return `
    <article class="card specialty-card" style="--specialty-color: ${color}">
      <h2><span class="specialty-icon" aria-hidden="true">${icon}</span>${label}</h2>
      ${doctorBlock("First on-call", entry.firstName, entry.firstPhone, ext.first)}
      ${doctorBlock("Second on-call", entry.secondName, entry.secondPhone, ext.second)}
    </article>`;
  }).join("");

}

function doctorBlock(role, name, phone, extension) {
  if (!name && !phone && !extension) {
    return `<div class="oncall"><div>
      <div class="role">${role}</div><div class="empty">Not entered</div>
    </div></div>`;
  }

  return `<div class="oncall">
    <div>
      <div class="role">${role}</div>
      <div class="doctor">${escapeHtml(name || "Name not entered")}</div>
      ${phone
      ? `<a class="details" href="tel:${escapeHtml(phone)}">${escapeHtml(phone)}</a>`
      : ""}
    </div>
    <div class="extension">${extension ? "Ext. " + escapeHtml(extension) : ""}</div>
  </div>`;
}

function askPasscode(key, label) {
  const entered = prompt(`Passcode for ${label}:`);
  if (entered === null) return false;
  if (entered !== PASSCODES[key]) {
    alert("Incorrect passcode.");
    return false;
  }
  return true;
}

function showPage(pageId) {
  ["displayPage", "rotaPage", "extensionsPage"].forEach(id =>
    $(id).classList.add("hidden")
  );

  $(pageId).classList.remove("hidden");
  document.body.classList.toggle("display-mode", pageId === "displayPage");
}


function openRotaEditor() {
  const choices = SPECIALTIES
    .map(([id, label], index) => `${index + 1}. ${label}`)
    .join("\n");

  const answer = prompt(`Choose a specialty by number:\n\n${choices}`);
  if (answer === null) return;

  const choice = Number(answer.trim());
  if (!Number.isInteger(choice) || choice < 1 || choice > SPECIALTIES.length) {
    alert("Please enter a number from 1 to " + SPECIALTIES.length + ".");
    return;
  }

  const [specialty, label] = SPECIALTIES[choice - 1];

  if (!askPasscode(specialty, label)) return;

  $("rotaSpecialty").value = specialty;
  showPage("rotaPage");
  loadRotaSheet();
}


function openExtensionsEditor() {
  if (!askPasscode("extensions", "Extensions")) return;
  showPage("extensionsPage");
  renderExtensionsEditor();
}

function loadRotaSheet() {
  const [year, monthNumber] = selectedMonth().split("-").map(Number);
  const count = new Date(year, monthNumber, 0).getDate();
  const monthData = appData.rotas?.[selectedMonth()] || {};
  const specialty = $("rotaSpecialty").value;
  const monthName = new Date(year, monthNumber - 1, 1)
    .toLocaleString(undefined, { month: "short" });

  $("rotaRows").innerHTML = Array.from({ length: count }, (_, index) => {
    const day = index + 1;
    const entry = monthData[String(day)]?.[specialty] || emptyEntry();

    return `<tr data-day="${day}">
      <td>${String(day).padStart(2, "0")} ${monthName}</td>
      <td><input data-field="firstName" value="${escapeHtml(entry.firstName)}" placeholder="Doctor name"></td>
      <td><input data-field="firstPhone" value="${escapeHtml(entry.firstPhone)}" placeholder="Phone" inputmode="tel"></td>
      <td><input data-field="secondName" value="${escapeHtml(entry.secondName)}" placeholder="Doctor name"></td>
      <td><input data-field="secondPhone" value="${escapeHtml(entry.secondPhone)}" placeholder="Phone" inputmode="tel"></td>
    </tr>`;
  }).join("");

  $("rotaStatus").textContent = `${count} days • ${selectedMonth()}`;
}

async function saveRota() {
  if (!db) return alert("Add your Firebase configuration first.");

  const month = selectedMonth();
  const specialty = $("rotaSpecialty").value;
  const monthData = { ...(appData.rotas?.[month] || {}) };

  document.querySelectorAll("#rotaRows tr").forEach(row => {
    const entry = {};
    row.querySelectorAll("input").forEach(input => {
      entry[input.dataset.field] = input.value.trim();
    });
    monthData[row.dataset.day] ||= {};
    monthData[row.dataset.day][specialty] = entry;
  });

  try {
    await recordRef().set({
      rotas: { ...(appData.rotas || {}), [month]: monthData }
    }, { merge: true });
    $("rotaStatus").textContent = "Rota saved.";
    alert("Rota saved successfully.");

    window.location.reload();

  } catch (error) {
    $("rotaStatus").textContent = "Save failed: " + error.message;
  }
}

async function clearRota() {
  if (!confirm("Empty this specialty’s entire monthly rota?")) return;
  document.querySelectorAll("#rotaRows input").forEach(input => input.value = "");
  await saveRota();
}

function renderExtensionsEditor() {
  $("extensionsEditor").innerHTML = SPECIALTIES.map(([id, label]) => {
    const ext = appData.extensions?.[id] || {};
    return `<article class="card">
      <h2>${label}</h2>
      <div class="ext-row">
        <label class="muted">First on-call extension
          <input data-specialty="${id}" data-slot="first"
                 value="${escapeHtml(ext.first)}" placeholder="Extension">
        </label>
        <label class="muted">Second on-call extension
          <input data-specialty="${id}" data-slot="second"
                 value="${escapeHtml(ext.second)}" placeholder="Extension">
        </label>
      </div>
    </article>`;
  }).join("");
}

async function saveExtensions() {
  if (!db) return alert("Add your Firebase configuration first.");

  const extensions = Object.fromEntries(
    SPECIALTIES.map(([id]) => [id, { first: "", second: "" }])
  );

  document.querySelectorAll("#extensionsEditor input").forEach(input => {
    extensions[input.dataset.specialty][input.dataset.slot] = input.value.trim();
  });

  try {
    await recordRef().set({ extensions }, { merge: true });
    $("extensionsStatus").textContent = "Extensions saved.";
  } catch (error) {
    $("extensionsStatus").textContent = "Save failed: " + error.message;
  }
}

document.body.classList.add("display-mode");

function startApp() {
  $("rotaSpecialty").innerHTML = SPECIALTIES.map(([id, label]) =>
    `<option value="${id}">${label}</option>`
  ).join("");

  $("rotaMonth").value = monthKey();

  $("displayBtn").onclick = () => showPage("displayPage");
  $("rotaBtn").onclick = openRotaEditor;
  $("extensionsBtn").onclick = openExtensionsEditor;
  $("saveRotaBtn").onclick = saveRota;
  $("clearRotaBtn").onclick = clearRota;
  $("saveExtensionsBtn").onclick = saveExtensions;
  $("rotaSpecialty").onchange = loadRotaSheet;
  $("rotaMonth").onchange = loadRotaSheet;

  if (localStorage.getItem("oncall-theme") === "light") {
    document.body.classList.add("light");
    $("themeBtn").textContent = "☾ Dark";
  }

  $("themeBtn").onclick = () => {
    document.body.classList.toggle("light");
    const light = document.body.classList.contains("light");
    localStorage.setItem("oncall-theme", light ? "light" : "dark");
    $("themeBtn").textContent = light ? "☾ Dark" : "☼ Light";
  };

  initFirebase();
  renderDisplay();
  setInterval(renderDisplay, 30_000);
}



startApp();
