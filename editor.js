(() => {
  const config = window.APP_CONFIG;
  const params = new URLSearchParams(location.search);
  const db = initializeFirebase();
  const specialtySelect = document.getElementById("specialtySelect");
  const loginPanel = document.getElementById("loginPanel");
  const rotaPanel = document.getElementById("rotaPanel");
  const loginError = document.getElementById("loginError");
  const saveMessage = document.getElementById("saveMessage");
  const monthInput = document.getElementById("monthInput");
  const rotaRows = document.getElementById("rotaRows");
  let activeSpecialty = null;

  function initializeFirebase() {
    if (!config.firebase.apiKey || config.firebase.apiKey.startsWith("PASTE_")) return null;
    try {
      if (!firebase.apps.length) firebase.initializeApp(config.firebase);
      return firebase.firestore();
    } catch {
      return null;
    }
  }

  function esc(value) {
    return String(value || "").replace(/[&<>"']/g, ch => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[ch]);
  }

  function monthNow() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: config.timezone, year: "numeric", month: "2-digit"
    }).formatToParts(new Date());
    const year = parts.find(p => p.type === "year").value;
    const month = parts.find(p => p.type === "month").value;
    return `${year}-${month}`;
  }

  function docId(specialty, month) {
    return `${specialty}_${month}`;
  }

  config.specialties.forEach(specialty => {
    const option = document.createElement("option");
    option.value = specialty.id;
    option.textContent = specialty.label;
    specialtySelect.appendChild(option);
  });

  const requestedSpecialty = params.get("specialty");
  if (config.specialties.some(item => item.id === requestedSpecialty)) {
    specialtySelect.value = requestedSpecialty;
    document.getElementById("loginTitle").textContent =
      `Edit ${config.specialties.find(item => item.id === requestedSpecialty).label} rota`;
  }

  function field(label, type, date, shift, name, value) {
    const key = `${shift}_${name}_${date}`;
    return `<div class="field-wrap">
      <label for="${key}">${label}</label>
      <input id="${key}" data-date="${date}" data-shift="${shift}" data-field="${name}"
        type="text" value="${esc(value)}" placeholder="${label}">
    </div>`;
  }

  function renderRows(month, entries = {}) {
    const [year, monthNumber] = month.split("-").map(Number);
    const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();

    rotaRows.innerHTML = Array.from({ length: count }, (_, index) => {
      const date = `${month}-${String(index + 1).padStart(2, "0")}`;
      const dayLabel = new Intl.DateTimeFormat("en", {
        timeZone: "UTC", weekday: "long", month: "short", day: "numeric"
      }).format(new Date(`${date}T12:00:00Z`));
      const entry = entries[date] || {};
      const first = entry.first || {};
      const second = entry.second || {};

      return `<article class="date-row">
        <div class="date-heading">${dayLabel}</div>
        <div class="shift-fields">
          <div class="shift-title">First on-call</div>
          ${field("Doctor name", "text", date, "first", "name", first.name)}
          ${field("Extension", "text", date, "first", "extension", first.extension)}
          ${field("Phone", "tel", date, "first", "phone", first.phone)}
        </div>
        <div class="shift-fields second-fields">
          <div class="shift-title">Second on-call</div>
          ${field("Doctor name", "text", date, "second", "name", second.name)}
          ${field("Extension", "text", date, "second", "extension", second.extension)}
          ${field("Phone", "tel", date, "second", "phone", second.phone)}
        </div>
      </article>`;
    }).join("");
  }

  async function loadMonth() {
    if (!db || !activeSpecialty) {
      saveMessage.textContent = "Add Firebase configuration in config.js first.";
      saveMessage.className = "form-message error-message";
      return;
    }
    saveMessage.textContent = "Loading…";
    try {
      const snapshot = await db.collection("rotas")
        .doc(docId(activeSpecialty.id, monthInput.value)).get();
      renderRows(monthInput.value, snapshot.exists ? snapshot.data().entries || {} : {});
      saveMessage.textContent = "";
    } catch {
      saveMessage.textContent = "Could not load this rota. Check Firestore setup and rules.";
      saveMessage.className = "form-message error-message";
    }
  }

  document.getElementById("loginButton").addEventListener("click", () => {
    const specialty = config.specialties.find(item => item.id === specialtySelect.value);
    if (!specialty || document.getElementById("passcodeInput").value !== specialty.passcode) {
      loginError.textContent = "Incorrect passcode.";
      return;
    }
    if (!db) {
      loginError.textContent = "Firebase is not configured. Add your Firebase settings in config.js.";
      return;
    }
    activeSpecialty = specialty;
    loginPanel.classList.add("hidden");
    rotaPanel.classList.remove("hidden");
    document.getElementById("rotaTitle").textContent = `${specialty.label} rota`;
    monthInput.value = monthNow();
    loadMonth();
  });

  document.getElementById("passcodeInput").addEventListener("keydown", event => {
    if (event.key === "Enter") document.getElementById("loginButton").click();
  });

  document.getElementById("changeSpecialty").addEventListener("click", () => {
    activeSpecialty = null;
    rotaPanel.classList.add("hidden");
    loginPanel.classList.remove("hidden");
    document.getElementById("passcodeInput").value = "";
    loginError.textContent = "";
  });

  document.getElementById("loadMonth").addEventListener("click", loadMonth);

  document.getElementById("saveMonth").addEventListener("click", async () => {
    if (!db || !activeSpecialty || !monthInput.value) return;
    const entries = {};
    rotaRows.querySelectorAll("input[data-date]").forEach(input => {
      const { date, shift, field } = input.dataset;
      entries[date] ||= { first: {}, second: {} };
      entries[date][shift][field] = input.value.trim();
    });

    saveMessage.textContent = "Saving rota…";
    saveMessage.className = "form-message";
    try {
      await db.collection("rotas").doc(docId(activeSpecialty.id, monthInput.value))
        .set({
          specialty: activeSpecialty.id,
          month: monthInput.value,
          entries,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      saveMessage.textContent = "Rota saved. The display will update automatically.";
      saveMessage.className = "form-message";
    } catch {
      saveMessage.textContent = "Could not save. Check your Firestore setup and rules.";
      saveMessage.className = "form-message error-message";
    }
  });

  monthInput.value = monthNow();
})();
