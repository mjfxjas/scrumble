(() => {
  const API_BASE = (window.SCRUMBLE_API_BASE || "").trim();
  if (!API_BASE) return;
  const API_URL = API_BASE.endsWith("/") ? API_BASE.slice(0, -1) : API_BASE;

  let isReal = false;
  const today = new Date().toISOString().slice(0, 10);
  try {
    const key = "scrumble-visit-real";
    const stored = localStorage.getItem(key);
    if (stored !== today) {
      localStorage.setItem(key, today);
      isReal = true;
    }
  } catch (err) {
    isReal = true;
  }

  fetch(`${API_URL}/visit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ real: isReal })
  }).catch(() => {});
})();
