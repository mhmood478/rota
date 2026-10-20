(() => {
  const config = window.APP_CONFIG;
  const db = initializeFirebase();
  const grid = document.getElementById("specialtyGrid");
  const notice = document.getElementById("notice");
  const updatedAt = document.getElementById("updatedAt");
  const settingsKey = "oncall-display-settings-v1";

  function initializeFirebase() {
    if (!config.firebase.apiKey || config.firebase.apiKey.startsWith("PASTE_")) {
      notice.textContent = "Add your Firebase configuration in config.js to load the rota.";
      return null;
    }
    try {
      if (!firebase.apps.length) firebase.initializeApp(config.firebase);
      return firebase.firestore();
    } catch (error) {
      notice.textContent = "Firebase could not start. Check the configuration in config.js.";
      return null;
    }
  }

  function getEffectiveDate() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: config.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23"
    }).formatToParts(new Date());

    const get = type => parts.find(part => part.type === type).value;
    let date = new Date(`${get("year")}-${get("month")}-${get("day")}T12:00:00Z`);
    if (Number(get("hour")) < 7) date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
  }

  function monthKey(date) {
    return `${date.slice(0, 4)}-${date.slice(5, 7)}`;
  }

  function docId(specialty, month) {
    return `${specialty}_${month}`;
  }

  function settings() {
    try {
      return JSON.parse(localStorage.getItem(settingsKey)) || {};
    } catch {
      return {};
    }
  }

  function saveSettings(value) {
    localStorage.setItem(settingsKey, JSON.stringify(value));
  }

  function specialtyOrder() {
    const saved = settings().order || [];
    return [...saved.filter(id => config.specialties.some(s => s.id === id)),
      ...config.specialties.map(s => s.id).filter(id => !saved.includes(id))];
  }

  function currentDateLabel() {
    return new Intl.DateTimeFormat("en", {
      timeZone: config.timezone,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    }).format(new Date());
  }

  function esc(value) {
    return String(value || "").replace(/[&<>"']/g, ch => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[ch]);
  }

  function contact(label, value) {
    return value ? `<span class="contact-item"><b>${label}:</b> ${esc(value)}</span>` : "";
  }

  function renderCard(specialty, entry, loading = false) {
    const first = entry?.first || {};
    const second = entry?.second || {};
    const person = (doctor, shift) => {
      const hasData = doctor.name || doctor.extension || doctor.phone;
      return `
        <div class="oncall-row ${shift === "Second" ? "second-row" : ""}">
          <div class="row-label"><span class="status-dot"></span>${shift} on-call</div>
          ${doctor.name ? `<div class="doctor-name">${esc(doctor.name)}</div>` :
            `<div class="empty-doctor">${loading ? "Loading rota…" : "No doctor entered"}</div>`}
          ${hasData ? `<div class="contact-line">
            ${contact("Ext", doctor.extension)}
            ${contact("Phone", doctor.phone)}
          </div>` : ""}
        </div>`;
    };

    return `
      <article class="specialty-card" data-specialty="${specialty.id}">
        <div class="card-heading">
          <h2>${esc(specialty.label)}</h2>
          <span class="card-status">${loading ? "Loading" : "Today"}</span>
        </div>
        ${person(first, "First")}
        ${person(second, "Second")}
      </article>`;
  }

  function render() {
    document.getElementById("today").textContent = currentDateLabel();
    const date = getEffectiveDate();
    const order = specialtyOrder();
    grid.innerHTML = order.map(id => {
      const specialty = config.specialties.find(item => item.id === id);
      return renderCard(specialty, null, !!db);
    }).join("");

    if (!db) return;

    order.forEach(id => {
      const specialty = config.specialties.find(item => item.id === id);
      db.collection("rotas").doc(docId(id, monthKey(date))).onSnapshot(snapshot => {
        const entry = snapshot.exists ? (snapshot.data().entries || {})[date] : null;
        const card = grid.querySelector(`[data-specialty="${id}"]`);
        if (card) card.outerHTML = renderCard(specialty, entry, false);
        updatedAt.textContent = `Updated ${new Intl.DateTimeFormat("en", {
          timeZone: config.timezone, hour: "2-digit", minute: "2-digit"
        }).format(new Date())} MCT`;
      }, () => {
        notice.textContent = "Could not read the rota. Check your Firestore setup and rules.";
      });
    });
  }

  function applyAccent() {
    const accent = settings().accent || "#53d6b2";
    document.documentElement.style.setProperty("--accent", accent);
    document.getElementById("accentPicker").value = accent;
  }

  function renderArrangeList() {
    const list = document.getElementById("arrangeList");
    const order = specialtyOrder();
    list.innerHTML = order.map((id, index) => {
      const specialty = config.specialties.find(item => item.id === id);
      return `<div class="arrange-item">
        <span>${esc(specialty.label)}</span>
        <span class="move-buttons">
          <button type="button" data-move="${index}" data-dir="-1" aria-label="Move up">↑</button>
          <button type="button" data-move="${index}" data-dir="1" aria-label="Move down">↓</button>
        </span>
      </div>`;
    }).join("");
  }

  document.getElementById("clock").textContent = new Intl.DateTimeFormat("en", {
    timeZone: config.timezone, hour: "2-digit", minute: "2-digit", hour12: false
  }).format(new Date());

  document.getElementById("customizeButton").addEventListener("click", () => {
    document.getElementById("customizePanel").classList.toggle("hidden");
  });
  document.getElementById("closeCustomize").addEventListener("click", () => {
    document.getElementById("customizePanel").classList.add("hidden");
  });
  document.getElementById("accentPicker").addEventListener("input", event => {
    const value = settings();
    value.accent = event.target.value;
    saveSettings(value);
    applyAccent();
  });
  document.getElementById("arrangeList").addEventListener("click", event => {
    const button = event.target.closest("[data-move]");
    if (!button) return;
    const order = specialtyOrder();
    const index = Number(button.dataset.move);
    const next = index + Number(button.dataset.dir);
    if (next < 0 || next >= order.length) return;
    [order[index], order[next]] = [order[next], order[index]];
    const value = settings();
    value.order = order;
    saveSettings(value);
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

    const nextDate = getEffectiveDate();
    if (nextDate !== window.lastEffectiveDate) {
      window.lastEffectiveDate = nextDate;
      render();
    }
  }, 15000);
})();
