(() => {
  const themes = [
    { id: "civic", label: "Civic" },
    { id: "poster", label: "Poster" },
    { id: "neon", label: "Neon" },
    { id: "storm", label: "Storm" }
  ];
  const storageKey = "scrumble-theme";
  const buttons = Array.from(document.querySelectorAll(".theme-toggle"));
  if (buttons.length === 0 || !document.body) return;

  const themeIndexById = themes.reduce((acc, theme, index) => {
    acc[theme.id] = index;
    return acc;
  }, {});

  const safeGetStoredTheme = () => {
    try {
      return localStorage.getItem(storageKey);
    } catch (err) {
      return null;
    }
  };

  const safeStoreTheme = (id) => {
    try {
      localStorage.setItem(storageKey, id);
    } catch (err) {
      return;
    }
  };

  const applyTheme = (id) => {
    const index = themeIndexById[id] ?? 0;
    const theme = themes[index];
    document.body.dataset.theme = theme.id;
    safeStoreTheme(theme.id);
    buttons.forEach((btn) => {
      btn.textContent = `Theme: ${theme.label}`;
      btn.dataset.theme = theme.id;
    });
  };

  const cycleTheme = () => {
    const current = document.body.dataset.theme || themes[0].id;
    const currentIndex = themeIndexById[current] ?? 0;
    const nextIndex = (currentIndex + 1) % themes.length;
    applyTheme(themes[nextIndex].id);
  };

  const stored = safeGetStoredTheme();
  const storedIndex = stored ? (themeIndexById[stored] ?? 0) : 0;
  const nextIndex = stored ? (storedIndex + 1) % themes.length : storedIndex;
  applyTheme(themes[nextIndex].id);
  buttons.forEach((btn) => btn.addEventListener("click", cycleTheme));
})();
