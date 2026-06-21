// Difficulty curve. Each wave is generated from the wave number so the game can
// run forever, getting steadily harder. Every 5th wave is a boss wave.

export function isBossWave(wave) {
  return wave % 5 === 0;
}

// Zombie type table. Picked with weighted probability that shifts as waves climb.
export const ZOMBIE_TYPES = {
  walker: { emoji: "🧟",   hp: 22,  speed: 38,  radius: 16, damage: 8,  coins: 4,  color: "#8bc34a" },
  runner: { emoji: "🧟‍♂️", hp: 16,  speed: 80,  radius: 14, damage: 6,  coins: 6,  color: "#cddc39" },
  brute:  { emoji: "🧟‍♀️", hp: 90,  speed: 26,  radius: 24, damage: 18, coins: 14, color: "#689f38" },
  // Giant sponge that forces you to dwell on it while others slip past.
  tank:   { emoji: "🧌",   hp: 300, speed: 20,  radius: 36, damage: 34, coins: 34, color: "#558b2f" },
  // Tiny, fast, weak — but arrives in clouds to overwhelm your narrow aim.
  swarm:  { emoji: "🧟",   hp: 10,  speed: 112, radius: 11, damage: 5,  coins: 3,  color: "#aed581" },
  boss:   { emoji: "👹",   hp: 900, speed: 20,  radius: 46, damage: 40, coins: 120, color: "#b71c1c" },
};

// Build the spawn plan for a given wave.
//
// The player's firepower compounds fast (weapon tiers + damage/fire-rate stacks
// + up to 5 soldiers ≈ tens of thousands of DPS), but it all fires in a narrow
// vertical stream. So the binding constraint is AIM COVERAGE: how many zombies
// are on screen, spread across the road, at once. We keep that rising forever
// via `batch` (zombies spawned per tick) and a shrinking interval, instead of
// letting concurrency plateau. HP/contact-damage and tougher types keep pace so
// leaks and sponges stay threatening even against a maxed loadout.
export function buildWave(wave) {
  const boss = isBossWave(wave);
  const w = wave - 1;

  const hpScale = 1 + w * 0.30 + Math.max(0, w - 4) ** 2 * 0.025; // linear + late quadratic
  const speedScale = Math.min(2.6, 1 + w * 0.05);                 // faster, capped for playability
  const damageScale = 1 + w * 0.08;                              // leaks hurt much more over time

  const count = 10 + Math.floor(wave * 4);
  // Interval shrinks but floors higher than before; concurrency growth now comes
  // from `batch` so the screen genuinely fills up at high waves.
  const spawnInterval = Math.max(0.35, 0.95 - wave * 0.045);
  const batch = 1 + Math.floor(Math.max(0, wave - 5) / 4);       // 1 → 2 (w9) → 3 (w13) → 4 (w17)...
  const bossCount = 1 + Math.floor(wave / 25);                   // extra bosses at very high waves

  // Type weights drift toward tougher, harder-to-cover enemies over time.
  const weights = {
    walker: Math.max(0.5, 6 - wave * 0.4),
    runner: Math.min(7, 1 + wave * 0.4),
    brute: Math.min(6, Math.max(0, (wave - 3) * 0.5)),
    tank: Math.min(4, Math.max(0, (wave - 7) * 0.35)),
    swarm: Math.min(10, Math.max(0, (wave - 11) * 0.6)),
  };

  return {
    wave,
    boss,
    bossCount,
    hpScale,
    speedScale,
    damageScale,
    count: boss ? count + 10 : count,
    spawnInterval,
    batch,
    weights,
    // Coins awarded just for clearing the wave (kept modest to slow the snowball).
    clearBonus: 15 + wave * 4,
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
