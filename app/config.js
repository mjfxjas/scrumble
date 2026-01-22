window.SCRUMBLE_API_BASE = 'https://zubf2hzh4nv6hdctcdsniom6uy0chtki.lambda-url.us-east-1.on.aws';
window.SCRUMBLE_PREVIEW_OVERRIDES = {
  "velo-coffee": "https://velocoffee.com",
  "mean-mug": "https://www.meanmugcoffee.com"
};

// Seed demo votes to keep counts looking legit but low.
// Mode: "override" (always use seeds) or "ifZero" (only when votes are 0).
window.SCRUMBLE_SEED_VOTES = {
  enabled: true,
  mode: "override",
  min: 18,
  max: 180,
  jitter: 6
};

// Live editor for matchup overrides (client-only).
window.SCRUMBLE_ENABLE_EDITOR = true;

// Optional per-matchup overrides by ID or by index (0-based).
// window.SCRUMBLE_MATCHUP_OVERRIDES = {
//   "matchup-id": {
//     matchup: { title: "Best Coffee", message: "Coffee Clash", category: "Business" },
//     left: { name: "Velo", neighborhood: "Southside", tag: "Local" },
//     right: { name: "Mean Mug", neighborhood: "Northshore", tag: "Challenger" },
//     votes: { left: 76, right: 75 }
//   }
// };
// window.SCRUMBLE_MATCHUP_OVERRIDES_BY_INDEX = {
//   0: {
//     matchup: { title: "Burger Duel", category: "Food" },
//     votes: { left: 22, right: 24 }
//   }
// };
