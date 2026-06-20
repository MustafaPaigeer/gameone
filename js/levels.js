// Difficulty curve. Each wave is generated from the wave number so the game can
// run forever, getting steadily harder. Every 5th wave is a boss wave.

export function isBossWave(wave) {
  return wave % 5 === 0;
}

// Zombie type table. Picked with weighted probability that shifts as waves climb.
export const ZOMBIE_TYPES = {
  walker: { emoji: "🧟", hp: 22, speed: 38, radius: 16, damage: 8, coins: 4, color: "#8bc34a" },
  runner: { emoji: "🧟‍♂️", hp: 16, speed: 78, radius: 14, damage: 6, coins: 6, color: "#cddc39" },
  brute:  { emoji: "🧟‍♀️", hp: 90, speed: 26, radius: 24, damage: 18, coins: 14, color: "#689f38" },
  boss:   { emoji: "👹", hp: 900, speed: 20, radius: 46, damage: 40, coins: 120, color: "#b71c1c" },
};

// Build the spawn plan for a given wave.
export function buildWave(wave) {
  const boss = isBossWave(wave);
  const hpScale = 1 + (wave - 1) * 0.22;       // zombies get tankier
  const speedScale = 1 + (wave - 1) * 0.04;    // and a bit faster
  const baseCount = 8 + wave * 3;

  // Spawn interval shrinks with wave number (more pressure), floored for sanity.
  const spawnInterval = Math.max(0.28, 1.15 - wave * 0.05);

  // Type weights drift toward tougher enemies over time.
  const weights = {
    walker: Math.max(1, 6 - wave * 0.3),
    runner: Math.min(6, 1 + wave * 0.35),
    brute: Math.min(4, Math.max(0, (wave - 3) * 0.4)),
  };

  return {
    wave,
    boss,
    hpScale,
    speedScale,
    count: boss ? baseCount + 6 : baseCount,
    spawnInterval,
    weights,
    // Coins awarded just for clearing the wave.
    clearBonus: 20 + wave * 6,
  };
}

export function pickType(weights, rng = Math.random) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (const [type, w] of Object.entries(weights)) {
    r -= w;
    if (r <= 0) return type;
  }
  return "walker";
}
