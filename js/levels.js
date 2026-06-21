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
//
// The difficulty has to outpace the player's compounding upgrades (weapon tiers,
// +damage/+fire-rate, up to 5 soldiers). The hard cap on player power is *aim*:
// bullets fire in a narrow vertical stream from the squad, so the real pressure
// comes from MANY zombies spread across the road faster than you can sweep to
// them — hence count and spawn rate ramp aggressively, with a quadratic HP term
// for the late game so tanky enemies force you to dwell and let others leak.
export function buildWave(wave) {
  const boss = isBossWave(wave);
  const w = wave - 1;

  const hpScale = 1 + w * 0.28 + Math.max(0, w - 4) ** 2 * 0.02; // linear + late quadratic
  const speedScale = Math.min(2.4, 1 + w * 0.05);                // faster, capped
  const damageScale = 1 + w * 0.07;                              // leaks hurt more over time
  const baseCount = 8 + Math.floor(wave * 3.5);

  // Spawn interval shrinks with wave number (denser horde), floored for sanity.
  const spawnInterval = Math.max(0.16, 0.95 - wave * 0.05);

  // Type weights drift toward tougher, harder-to-aim-at enemies over time.
  const weights = {
    walker: Math.max(1, 6 - wave * 0.35),
    runner: Math.min(8, 1 + wave * 0.45),
    brute: Math.min(6, Math.max(0, (wave - 3) * 0.5)),
  };

  return {
    wave,
    boss,
    hpScale,
    speedScale,
    damageScale,
    count: boss ? baseCount + 8 : baseCount,
    spawnInterval,
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
