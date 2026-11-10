// Change these passcodes before publishing.
// They are visible in the source and are not secure authentication.
const PASSCODES = {
  medicine: "med123",
  surgery: "surg123",
  pediatrics: "peds123",
  cardiology: "card123",
  orthopedics: "ortho123",
  ophthalmology: "eye123",
  ent: "ent123",
  dental: "dent123",
  gynecology: "gyn123",
  nephrology: "neph123",
  psychiatry: "psch123",
  anesthesia: "anes123",
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
let appData = { rotas: {}, extensions: defaultExtensions, doctors: {} };
let rotaDirty = false;
let directoryDirty = false;

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
    appData.doctors ||= {};
    $("loadStatus").textContent = "Live data connected.";
    renderDisplay();

    if (!$("rotaPage").classList.contains("hidden")) {
      if (!rotaDirty) loadRotaSheet();
      if (!directoryDirty) renderDoctorDirectory();
    }
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

  const rowsView = document.body.classList.contains("rows-view");
  $("displayGrid").innerHTML = rowsView
    ? `<div class="oncall-table-wrap"><table class="oncall-table">
        <thead><tr><th>Specialty</th><th>1st on-call</th><th>2nd on-call</th></tr></thead>
        <tbody>${SPECIALTIES.map(([id, label, icon, color]) => {
          const entry = appData.rotas?.[month]?.[day]?.[id] || emptyEntry();
          const ext = appData.extensions?.[id] || {};
          return `<tr style="--specialty-color:${color}">
            <td class="table-specialty"><span class="specialty-icon" aria-hidden="true">${icon}</span>${label}</td>
            <td>${tableDoctor(entry.firstName, entry.firstPhone, ext.first)}</td>
            <td>${tableDoctor(entry.secondName, entry.secondPhone, ext.second)}</td>
          </tr>`;
        }).join("")}</tbody></table></div>`
    : SPECIALTIES.map(([id, label, icon, color]) => {
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

function tableDoctor(name, phone, extension) {
  if (!name && !phone && !extension) return `<span class="empty">Not entered</span>`;
  return `<div class="table-doctor"><span class="doctor">${escapeHtml(name || "Name not entered")}</span>
    ${phone ? `<a class="details" href="tel:${escapeHtml(phone)}">${escapeHtml(phone)}</a>` : ""}
    ${extension ? `<span class="extension">Ext. ${escapeHtml(extension)}</span>` : ""}</div>`;
}

function setDisplayView(view) {
  const rows = view === "rows";
  document.body.classList.toggle("rows-view", rows);
  $("cardsViewBtn").classList.toggle("active", !rows);
  $("rowsViewBtn").classList.toggle("active", rows);
  $("cardsViewBtn").setAttribute("aria-pressed", String(!rows));
  $("rowsViewBtn").setAttribute("aria-pressed", String(rows));
  renderDisplay();
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
  applyDisplaySettings();
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
  renderDoctorDirectory();
}


function openExtensionsEditor() {
  if (!askPasscode("extensions", "Extensions")) return;
  showPage("extensionsPage");
  renderExtensionsEditor();
}

// Directory entries are scoped to specialty and first/second on-call role.
// Each doctor has a stable ID, so changing a name does not break selections.
function directoryFor(specialty, role) {
  return appData.doctors?.[specialty]?.[role] || [];
}
function doctorOptions(specialty, role, entryName, entryPhone) {
  const doctors = directoryFor(specialty, role);
  const matched = doctors.find(d => d.name === entryName && d.phone === entryPhone);
  const selectedId = matched?.id || (entryName || entryPhone ? "__manual__" : "");
  return `<option value="">— Select doctor —</option>` +
    doctors.map(d => `<option value="${escapeHtml(d.id)}" ${selectedId === d.id ? "selected" : ""}>${escapeHtml(d.name)}${d.phone ? " · " + escapeHtml(d.phone) : ""}</option>`).join("") +
    `<option value="__manual__" ${selectedId === "__manual__" ? "selected" : ""}>✎ Manual / existing entry</option>`;
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
    const roleCell = role => {
      const name = entry[role + "Name"] || "";
      const phone = entry[role + "Phone"] || "";
      return `<td class="doctor-pick-cell">
        <select class="doctor-picker" data-role="${role}" aria-label="${role} on-call doctor, day ${day}">
          ${doctorOptions(specialty, role, name, phone)}
        </select>
        <div class="doctor-fields">
          <input data-field="${role}Name" value="${escapeHtml(name)}" placeholder="Doctor name" aria-label="${role} doctor name, day ${day}">
          <input data-field="${role}Phone" value="${escapeHtml(phone)}" placeholder="Phone number" inputmode="tel" aria-label="${role} phone, day ${day}">
        </div>
      </td>`;
    };
    return `<tr data-day="${day}"><td class="rota-day">${String(day).padStart(2, "0")} ${monthName}</td>
      ${roleCell("first")}${roleCell("second")}</tr>`;
  }).join("");
  rotaDirty = false;
  $("rotaStatus").textContent = `${count} days • ${selectedMonth()}`;
}

function handleRotaChange(event) {
  const target = event.target;
  const row = target.closest("tr[data-day]");
  if (!row) return;
  rotaDirty = true;
  if (target.matches(".doctor-picker")) {
    const role = target.dataset.role;
    const doctor = directoryFor($("rotaSpecialty").value, role)
      .find(d => d.id === target.value);
    if (doctor) {
      row.querySelector(`[data-field="${role}Name"]`).value = doctor.name;
      row.querySelector(`[data-field="${role}Phone"]`).value = doctor.phone;
    } else if (!target.value) {
      row.querySelector(`[data-field="${role}Name"]`).value = "";
      row.querySelector(`[data-field="${role}Phone"]`).value = "";
    }
  } else if (target.matches("input[data-field]")) {
    const role = target.dataset.field.startsWith("first") ? "first" : "second";
    row.querySelector(`select[data-role="${role}"]`).value = "__manual__";
  }
  $("rotaStatus").textContent = "Unsaved rota changes";
}

function renderDoctorDirectory() {
  const specialty = $("rotaSpecialty").value;
  $("directorySpecialtyName").textContent = SPECIALTIES.find(([id]) => id === specialty)?.[1] || specialty;
  $("doctorDirectory").innerHTML = ["first", "second"].map(role => {
    const rows = directoryFor(specialty, role);
    return `<div class="directory-role"><h3>${role === "first" ? "1st" : "2nd"} on-call doctors</h3>
      <div class="directory-list" data-role="${role}">
        ${rows.map(d => `<div class="directory-doctor" data-id="${escapeHtml(d.id)}">
          <input class="directory-name" value="${escapeHtml(d.name)}" placeholder="Doctor name" aria-label="Doctor name">
          <input class="directory-phone" value="${escapeHtml(d.phone)}" placeholder="Phone number" inputmode="tel" aria-label="Doctor phone">
          <button type="button" class="directory-remove danger" title="Remove doctor">✕</button>
        </div>`).join("")}
      </div>
      <button type="button" class="directory-add" data-role="${role}">＋ Add doctor</button>
    </div>`;
  }).join("");
  directoryDirty = false;
}

function collectDirectory() {
  const result = { first: [], second: [] };
  $("doctorDirectory").querySelectorAll(".directory-list").forEach(list => {
    const role = list.dataset.role;
    list.querySelectorAll(".directory-doctor").forEach(row => {
      const name = row.querySelector(".directory-name").value.trim();
      const phone = row.querySelector(".directory-phone").value.trim();
      if (name) result[role].push({ id: row.dataset.id, name, phone });
    });
  });
  return result;
}

async function saveDoctorDirectory() {
  if (!db) return alert("Firebase is not connected.");
  const specialty = $("rotaSpecialty").value;
  const doctors = collectDirectory();
  try {
    await recordRef().update({ [`doctors.${specialty}`]: doctors });
    appData.doctors[specialty] = doctors;
    directoryDirty = false;
    $("directoryStatus").textContent = "Doctor directory saved ✓";
    alert("✅ Doctor directory saved successfully!");
    // Preserve unsaved monthly entries while refreshing dropdown choices.
    $("rotaRows").querySelectorAll("tr[data-day]").forEach(row => {
      for (const role of ["first", "second"]) {
        const select = row.querySelector(`select[data-role="${role}"]`);
        const name = row.querySelector(`[data-field="${role}Name"]`).value;
        const phone = row.querySelector(`[data-field="${role}Phone"]`).value;
        select.innerHTML = doctorOptions(specialty, role, name, phone);
      }
    });
  } catch (error) {
  $("directoryStatus").textContent = "Save failed: " + error.message;
  alert("❌ Failed to save doctor directory:\n" + error.message);
}

}

async function saveRota() {
  if (!db) return alert("Firebase is not connected.");
  const month = selectedMonth();
  const specialty = $("rotaSpecialty").value;
  const updates = {};
  document.querySelectorAll("#rotaRows tr[data-day]").forEach(row => {
    const entry = {};
    row.querySelectorAll("input[data-field]").forEach(input => {
      entry[input.dataset.field] = input.value.trim();
    });
    // Update only this specialty/day: do not overwrite other departments' rotas.
    updates[`rotas.${month}.${row.dataset.day}.${specialty}`] = entry;
  });
  try {
    await recordRef().update(updates);
    rotaDirty = false;
    $("rotaStatus").textContent = "Rota saved successfully ✓";
    alert("✅ Rota saved successfully!");
  
    } catch (error) {
  $("rotaStatus").textContent = "Save failed: " + error.message;
  alert("❌ Failed to save rota:\n" + error.message);
}

}

async function clearRota() {
  if (!confirm("Empty this specialty’s entire monthly rota?")) return;
  document.querySelectorAll("#rotaRows input[data-field]").forEach(input => input.value = "");
  document.querySelectorAll("#rotaRows .doctor-picker").forEach(select => select.value = "");
  rotaDirty = true;
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
    alert("✅ Extensions saved successfully!");
  } catch (error) {
    $("extensionsStatus").textContent = "Save failed: " + error.message;
    alert("❌ Failed to save extensions:\n" + error.message);
  }
}


// Display preferences are intentionally device-local: each TV can have its own layout.
const DISPLAY_DEFAULTS = { rotation: '0', extensions: 'right', columns: 'auto', text: '100', gap: '12', density: 'normal', heading: true };
let displaySettings = { ...DISPLAY_DEFAULTS };
try {
  const stored = JSON.parse(localStorage.getItem('oncall-display-settings') || '{}');
  if (stored && typeof stored === 'object') displaySettings = { ...DISPLAY_DEFAULTS, ...stored };
} catch (_) { /* Ignore invalid old preferences. */ }

function applyDisplaySettings() {
  const page = $('displayPage');
  const rotation = [0, 90, 180, 270, 360].includes(Number(displaySettings.rotation)) ? Number(displaySettings.rotation) % 360 : 0;
  const place = ['left', 'right', 'below', 'hidden'].includes(displaySettings.extensions) ? displaySettings.extensions : 'right';
  page.dataset.extensions = place;
  page.dataset.density = displaySettings.density;
  page.classList.toggle('hide-heading', !displaySettings.heading);
  page.style.setProperty('--board-gap', `${Number(displaySettings.gap) || 12}px`);
  page.style.setProperty('--board-font-scale', String((Number(displaySettings.text) || 100) / 100));
  page.style.setProperty('--board-columns', displaySettings.columns === 'auto' ? 'repeat(3, minmax(0, 1fr))' : `repeat(${Math.min(5, Math.max(1, Number(displaySettings.columns) || 3))}, minmax(0, 1fr))`);
  document.body.classList.toggle('board-rotated', rotation !== 0 && !$('displayPage').classList.contains('hidden'));
  page.style.transform = '';
  page.style.width = '';
  page.style.height = '';
  if (rotation !== 0 && !$('displayPage').classList.contains('hidden')) {
    const w = window.innerWidth, h = window.innerHeight;
    page.style.width = `${rotation === 180 ? w : h}px`;
    page.style.height = `${rotation === 180 ? h : w}px`;
    page.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;
  }
}
function updateSettingsControls() {
  for (const key of ['Rotation','Extensions','Columns','Text','Gap','Density']) {
    const el = $('setting' + key);
    el.value = displaySettings[key.toLowerCase()];
  }
  $('settingHeading').checked = !!displaySettings.heading;
}
function saveDisplaySettings() {
  try { localStorage.setItem('oncall-display-settings', JSON.stringify(displaySettings)); } catch (_) {}
  applyDisplaySettings();
}
function closeDisplaySettings() { $('displaySettings').classList.add('hidden'); $('settingsBtn').focus(); }
function setupDisplaySettings() {
  updateSettingsControls();
  $('settingsBtn').onclick = () => { updateSettingsControls(); $('displaySettings').classList.remove('hidden'); $('closeSettingsBtn').focus(); };
  $('closeSettingsBtn').onclick = closeDisplaySettings;
  $('doneSettingsBtn').onclick = closeDisplaySettings;
  $('displaySettings').addEventListener('click', e => { if (e.target === $('displaySettings')) closeDisplaySettings(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('displaySettings').classList.contains('hidden')) closeDisplaySettings(); });
  for (const key of ['Rotation','Extensions','Columns','Text','Gap','Density']) {
    $('setting' + key).addEventListener('change', e => { displaySettings[key.toLowerCase()] = e.target.value; saveDisplaySettings(); });
  }
  $('settingHeading').onchange = e => { displaySettings.heading = e.target.checked; saveDisplaySettings(); };
  $('resetSettingsBtn').onclick = () => { displaySettings = { ...DISPLAY_DEFAULTS }; updateSettingsControls(); saveDisplaySettings(); };
  $('fullscreenSettingsBtn').onclick = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch (error) { alert('Fullscreen unavailable: ' + error.message); }
  };
  window.addEventListener('resize', applyDisplaySettings);
  document.addEventListener('fullscreenchange', applyDisplaySettings);
  applyDisplaySettings();
}

document.body.classList.add("display-mode");

function startApp() {
  setupDisplaySettings();
  $("rotaSpecialty").innerHTML = SPECIALTIES.map(([id, label]) =>
    `<option value="${id}">${label}</option>`
  ).join("");

  $("rotaMonth").value = monthKey();

  $("displayBtn").onclick = () => showPage("displayPage");
  $("cardsViewBtn").onclick = () => setDisplayView("cards");
  $("rowsViewBtn").onclick = () => setDisplayView("rows");
  // Always start in Cards view after a page load or refresh.
  setDisplayView("cards");
  $("rotaBtn").onclick = openRotaEditor;
  $("extensionsBtn").onclick = openExtensionsEditor;
  $("saveRotaBtn").onclick = saveRota;
  $("rotaRows").addEventListener("input", handleRotaChange);
  $("rotaRows").addEventListener("change", handleRotaChange);
  $("saveDirectoryBtn").onclick = saveDoctorDirectory;
  $("doctorDirectory").addEventListener("input", () => {
    directoryDirty = true;
    $("directoryStatus").textContent = "Unsaved directory changes";
  });
  $("doctorDirectory").addEventListener("click", event => {
    const add = event.target.closest(".directory-add");
    const remove = event.target.closest(".directory-remove");
    if (add) {
      const list = $("doctorDirectory").querySelector(`.directory-list[data-role="${add.dataset.role}"]`);
      const row = document.createElement("div");
      row.className = "directory-doctor";
      row.dataset.id = crypto.randomUUID();
      row.innerHTML = `<input class="directory-name" placeholder="Doctor name" aria-label="Doctor name"><input class="directory-phone" placeholder="Phone number" inputmode="tel" aria-label="Doctor phone"><button type="button" class="directory-remove danger" title="Remove doctor">✕</button>`;
      list.append(row);
      row.querySelector("input").focus();
    }
    if (remove && confirm("Remove this doctor from the dropdown? Existing rota entries will remain unchanged.")) {
      remove.closest(".directory-doctor").remove();
    }
    if (add || remove) { directoryDirty = true; $("directoryStatus").textContent = "Unsaved directory changes"; }
  });
  $("clearRotaBtn").onclick = clearRota;
  $("saveExtensionsBtn").onclick = saveExtensions;
  $("rotaSpecialty").onchange = () => {
    if ((rotaDirty || directoryDirty) && !confirm("Discard unsaved changes?")) {
      // The selected specialty has already changed; restore previous selection.
      $("rotaSpecialty").value = currentSpecialty;
      return;
    }
    currentSpecialty = $("rotaSpecialty").value;
    loadRotaSheet();
    renderDoctorDirectory();
  };
  let currentSpecialty = $("rotaSpecialty").value;
  $("rotaMonth").onchange = () => {
    if (rotaDirty && !confirm("Discard unsaved rota changes?")) {
      $("rotaMonth").value = currentMonth;
      return;
    }
    currentMonth = $("rotaMonth").value;
    loadRotaSheet();
  };
  let currentMonth = $("rotaMonth").value;

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
