(() => {
  const config = window.APP_CONFIG;
  const db = initFirebase();
  const select = document.getElementById("specialtySelect");
  const loginPanel = document.getElementById("loginPanel");
  const rotaPanel = document.getElementById("rotaPanel");
  const loginError = document.getElementById("loginError");
  const saveMessage = document.getElementById("saveMessage");
  const monthInput = document.getElementById("monthInput");
  const rows = document.getElementById("rotaRows");
  let activeSpecialty = null;

  function initFirebase() {
    if (!config.firebase.apiKey || config.firebase.apiKey.startsWith("PASTE_")) return null;
    try {
      if (!firebase.apps.length) firebase.initializeApp(config.firebase);
      return firebase.firestore();
    } catch {
      return null;
    }
  }

  function monthNow() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: config.timezone, year: "numeric", month: "2-digit"
    }).formatToParts(new Date());
    return `${parts.find(p => p.type === "year").value}-${parts.find(p => p.type === "month").value}`;
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  }

  config.specialties.forEach(s => {
    const option = document.createElement("option");
    option.value = s.id;
    option.textContent = s.label;
    select.appendChild(option);
  });

  const requested = new URLSearchParams(location.search).get("specialty");
  if (config.specialties.some(s => s.id === requested)) select.value = requested;

  function field(date, shift, key, label, value) {
    return `<label class="simple-field">
      <span>${label}</span>
      <input data-date="${date}" data-shift="${shift}" data-field="${key}"
        type="${key === "phone" ? "tel" : "text"}"
        value="${escapeHtml(value)}" placeholder="${label}">
    </label>`;
  }

  function renderRows(month, entries = {}) {
    const [year, monthNumber] = month.split("-").map(Number);
    const numberOfDays = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();

    rows.innerHTML = Array.from({ length: numberOfDays }, (_, i) => {
      const date = `${month}-${String(i + 1).padStart(2, "0")}`;
      const label = new Intl.DateTimeFormat("en", {
        timeZone: "UTC", weekday: "short", month: "short", day: "numeric"
      }).format(new Date(`${date}T12:00:00Z`));
      const entry = entries[date] || {};
      const first = entry.first || {};
      const second = entry.second || {};

      return `<article class="simple-date-row">
        <div class="simple-date-label">${label}</div>
        <div class="simple-shift">
          <strong>1st on-call</strong>
          ${field(date, "first", "name", "Doctor name", first.name)}
          ${field(date, "first", "phone", "Phone", first.phone)}
        </div>
        <div class="simple-shift">
          <strong>2nd on-call</strong>
          ${field(date, "second", "name", "Doctor name", second.name)}
          ${field(date, "second", "phone", "Phone", second.phone)}
        </div>
      </article>`;
    }).join("");
  }

  async function loadMonth() {
    if (!db || !activeSpecialty) {
      saveMessage.textContent = "Add Firebase configuration in config.js first.";
      return;
    }
    saveMessage.textContent = "Loading…";
    try {
      const doc = await db.collection("rotas")
        .doc(`${activeSpecialty.id}_${monthInput.value}`).get();
      renderRows(monthInput.value, doc.exists ? doc.data().entries || {} : {});
      saveMessage.textContent = "";
    } catch {
      saveMessage.textContent = "Could not load rota. Check your Firestore setup and rules.";
    }
  }

  document.getElementById("loginButton").addEventListener("click", () => {
    const specialty = config.specialties.find(s => s.id === select.value);
    const passcode = document.getElementById("passcodeInput").value;
    if (!specialty || passcode !== specialty.passcode) {
      loginError.textContent = "Incorrect passcode.";
      return;
    }
    if (!db) {
      loginError.textContent = "Firebase is not configured in config.js.";
      return;
    }

    activeSpecialty = specialty;
    loginError.textContent = "";
    loginPanel.classList.add("hidden");
    rotaPanel.classList.remove("hidden");
    document.getElementById("rotaTitle").textContent = `${specialty.label} rota`;
    monthInput.value = monthNow();
    loadMonth();
  });

  document.getElementById("passcodeInput").addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("loginButton").click();
  });

  document.getElementById("changeSpecialty").addEventListener("click", () => {
    activeSpecialty = null;
    rotaPanel.classList.add("hidden");
    loginPanel.classList.remove("hidden");
    document.getElementById("passcodeInput").value = "";
  });

  document.getElementById("loadMonth").addEventListener("click", loadMonth);

  document.getElementById("saveMonth").addEventListener("click", async () => {
    if (!db || !activeSpecialty) return;
    const entries = {};

    rows.querySelectorAll("input[data-date]").forEach(input => {
      const { date, shift, field } = input.dataset;
      entries[date] ||= { first: {}, second: {} };
      entries[date][shift][field] = input.value.trim();
    });

    try {
      await db.collection("rotas").doc(`${activeSpecialty.id}_${monthInput.value}`).set({
        specialty: activeSpecialty.id,
        month: monthInput.value,
        entries,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      saveMessage.textContent = "Rota saved. The display will update automatically.";
    } catch {
      saveMessage.textContent = "Could not save. Check Firestore setup and rules.";
    }
  });

  document.getElementById("clearMonth").addEventListener("click", async () => {
    if (!db || !activeSpecialty || !monthInput.value) return;
    if (!confirm(`Clear all rota entries for ${monthInput.value}? This cannot be undone.`)) return;

    try {
      await db.collection("rotas").doc(`${activeSpecialty.id}_${monthInput.value}`).set({
        specialty: activeSpecialty.id,
        month: monthInput.value,
        entries: {},
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      renderRows(monthInput.value, {});
      saveMessage.textContent = "This month's rota has been cleared.";
    } catch {
      saveMessage.textContent = "Could not clear rota. Check Firestore setup and rules.";
    }
  });

  monthInput.value = monthNow();
})();
