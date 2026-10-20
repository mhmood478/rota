(() => {
  const config = window.APP_CONFIG;
  let db = null;
  let activeSpecialty = null;

  try {
    if (config.firebase.apiKey && !config.firebase.apiKey.startsWith("PASTE_")) {
      if (!firebase.apps.length) firebase.initializeApp(config.firebase);
      db = firebase.firestore();
    }
  } catch {}

  const select = document.getElementById("specialtySelect");
  const loginPanel = document.getElementById("extensionLogin");
  const panel = document.getElementById("extensionPanel");
  const loginError = document.getElementById("loginError");
  const saveMessage = document.getElementById("saveMessage");

  config.specialties.forEach(s => {
    const option = document.createElement("option");
    option.value = s.id;
    option.textContent = s.label;
    select.appendChild(option);
  });

  const requested = new URLSearchParams(location.search).get("specialty");
  if (config.specialties.some(s => s.id === requested)) select.value = requested;

  document.getElementById("loginButton").addEventListener("click", async () => {
    const specialty = config.specialties.find(s => s.id === select.value);
    if (!specialty || document.getElementById("passcodeInput").value !== specialty.passcode) {
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
    panel.classList.remove("hidden");
    document.getElementById("extensionTitle").textContent = `${specialty.label} extensions`;

    try {
      const doc = await db.collection("extensions").doc(specialty.id).get();
      const data = doc.exists ? doc.data() : {};
      document.getElementById("firstExtension").value = data.first || "";
      document.getElementById("secondExtension").value = data.second || "";
    } catch {
      saveMessage.textContent = "Could not load extensions. Check Firestore setup and rules.";
    }
  });

  document.getElementById("passcodeInput").addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("loginButton").click();
  });

  document.getElementById("saveExtensions").addEventListener("click", async () => {
    if (!db || !activeSpecialty) return;
    try {
      await db.collection("extensions").doc(activeSpecialty.id).set({
        first: document.getElementById("firstExtension").value.trim(),
        second: document.getElementById("secondExtension").value.trim(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      saveMessage.textContent = "Extensions saved. The display will update automatically.";
    } catch {
      saveMessage.textContent = "Could not save. Check Firestore setup and rules.";
    }
  });

  document.getElementById("changeSpecialty").addEventListener("click", () => {
    activeSpecialty = null;
    panel.classList.add("hidden");
    loginPanel.classList.remove("hidden");
    document.getElementById("passcodeInput").value = "";
    saveMessage.textContent = "";
  });
})();
