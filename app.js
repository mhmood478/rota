(() => {
  const config = window.APP_CONFIG;
  const grid = document.getElementById("specialtyGrid");
  const notice = document.getElementById("notice");
  const updatedAt = document.getElementById("updatedAt");
  const settingsKey = "oncall-display-settings-v1";
  let db = null;
  let rotaData = {};
  let extensionData = {};
  let unsubscribe = [];

  try {
    if (config.firebase.apiKey && !config.firebase.apiKey.startsWith("PASTE_")) {
      if (!firebase.apps.length) firebase.initializeApp(config.firebase);
      db = firebase.firestore();
    } else {
      notice.textContent = "Add your Firebase configuration in config.js to load the rota.";
    }
  } catch {
    notice.textContent = "Firebase could not start. Check config.js.";
  }

  function effectiveDate() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: config.timezone, year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", hourCycle: "h23"
    }).formatToParts(new Date());
    const get = type => parts.find(p => p.type === type).value;
    const date = new Date(`${get("year")}-${get("month")}-${get("day")}T12:00:00Z`);
    if (Number(get("hour")) < 7) date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
  }

  function esc(value) {
    return String(value || "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  }

  function getSettings() {
    try { return JSON.parse(localStorage.getItem(settingsKey)) || {}; }
    catch { return {}; }
  }

  function order() {
    const saved = getSettings().order || [];
    return [...saved.filter(id => config.specialties.some(s => s.id === id)),
      ...config.specialties.map(s => s.id).filter(id => !saved.includes(id))];
  }

  function contact(label, value) {
    return value ? `<span class="contact-item"><b>${label}:</b> ${esc(value)}</span>` : "";
  }

  function onCallRow(title, person, extension, second = false) {
    return `<div class="oncall-row ${second ? "second-row" : ""}">
      <div class="row-label"><span class="status-dot"></span>${title} on-call</div>
      <div class="doctor-line">
        <div class="doctor-name">${person.name ? esc(person.name) : '<span class="empty-doctor">No doctor entered</span>'}</div>
        ${extension ? `<div class="extension-badge">EXT ${esc(extension)}</div>` : ""}
      </div>
      ${(person.phone) ? `<div class="contact-line">${contact("Phone", person.phone)}</div>` : ""}
    </div>`;
  }

  function render() {
    document.getElementById("today").textContent = new Intl.DateTimeFormat("en", {
      timeZone: config.timezone, weekday: "long", year: "numeric", month: "long", day: "numeric"
    }).format(new Date());

    const date = effectiveDate();
    const month = date.slice(0, 7);
    grid.innerHTML = order().map(id => {
      const specialty = config.specialties.find(s => s.id === id);
      const entry = rotaData[id]?.[date] || {};
      const extensions = extensionData[id] || {};
      return `<article class="specialty-card" data-specialty="${id}">
        <div class="card-heading"><h2>${esc(specialty.label)}</h2><span class="card-status">Today</span></div>
        ${onCallRow("1st", entry.first || {}, extensions.first)}
        ${onCallRow("2nd", entry.second || {}, extensions.second, true)}
      </article>`;
    }).join("");

    if (db) {
      updatedAt.textContent = `Updated ${new Intl.DateTimeFormat("en", {
        timeZone: config.timezone, hour: "2-digit", minute: "2-digit"
      }).format(new Date())} MCT`;
    }
    return { date, month };
  }

  function subscribe() {
    unsubscribe.forEach(fn => fn());
    unsubscribe = [];
    if (!db) return;
    const { date, month } = render();

    config.specialties.forEach(specialty => {
      unsubscribe.push(db.collection("rotas").doc(`${specialty.id}_${month}`).onSnapshot(doc => {
        rotaData[specialty.id] = doc.exists ? (doc.data().entries || {}) : {};
        render();
      }, () => { notice.textContent = "Could not load rota data. Check Firestore setup and rules."; }));

      unsubscribe.push(db.collection("extensions").doc(specialty.id).onSnapshot(doc => {
        extensionData[specialty.id] = doc.exists ? doc.data() : {};
        render();
      }, () => { notice.textContent = "Could not load extension data. Check Firestore setup and rules."; }));
    });

    window.lastEffectiveDate = date;
  }

  function applyAccent() {
    const color = getSettings().accent || "#53d6b2";
    document.documentElement.style.setProperty("--accent", color);
    const picker = document.getElementById("accentPicker");
    if (picker) picker.value = color;
  }

  function renderArrangeList() {
    const list = document.getElementById("arrangeList");
    if (!list) return;
    list.innerHTML = order().map((id, index) => {
      const s = config.specialties.find(item => item.id === id);
      return `<div class="arrange-item"><span>${esc(s.label)}</span>
        <span class="move-buttons">
          <button type="button" data-move="${index}" data-dir="-1">↑</button>
          <button type="button" data-move="${index}" data-dir="1">↓</button>
        </span></div>`;
    }).join("");
  }

  document.getElementById("clock").textContent = new Intl.DateTimeFormat("en", {
    timeZone: config.timezone, hour: "2-digit", minute: "2-digit", hour12: false
  }).format(new Date());

  document.getElementById("customizeButton").addEventListener("click", () =>
    document.getElementById("customizePanel").classList.toggle("hidden"));
  document.getElementById("closeCustomize").addEventListener("click", () =>
    document.getElementById("customizePanel").classList.add("hidden"));

  document.getElementById("accentPicker").addEventListener("input", event => {
    const value = getSettings();
    value.accent = event.target.value;
    localStorage.setItem(settingsKey, JSON.stringify(value));
    applyAccent();
  });

  document.getElementById("arrangeList").addEventListener("click", event => {
    const button = event.target.closest("[data-move]");
    if (!button) return;
    const items = order();
    const from = Number(button.dataset.move);
    const to = from + Number(button.dataset.dir);
    if (to < 0 || to >= items.length) return;
    [items[from], items[to]] = [items[to], items[from]];
    const value = getSettings();
    value.order = items;
    localStorage.setItem(settingsKey, JSON.stringify(value));
    renderArrangeList();
    render();
  });

  document.getElementById("resetDisplay").addEventListener("click", () => {
    localStorage.removeItem(settingsKey);
    applyAccent();
    renderArrangeList();
    render();
  });

  applyAccent();
  renderArrangeList();
  render();

  setInterval(() => {
    document.getElementById("clock").textContent = new Intl.DateTimeFormat("en", {
      timeZone: config.timezone, hour: "2-digit", minute: "2-digit", hour12: false
    }).format(new Date());

    const current = effectiveDate();
    if (current !== window.lastEffectiveDate) subscribe();
  }, 15000);

  subscribe();
})();
