// Weapon definitions. The player owns one weapon at a time and can buy the next
// tier in the shop. Stats scale with the weapon's own upgrade level.

export const WEAPONS = [
  {
    id: "pistol",
    name: "Pistol",
    emoji: "🔫",
    desc: "Reliable sidearm.",
    damage: 12,
    fireRate: 3.2,      // shots per second
    bullets: 1,         // pellets per shot
    spread: 0,          // radians of cone
    bulletSpeed: 740,
    color: "#ffe082",
    unlockCost: 0,
  },
  {
    id: "smg",
    name: "SMG",
    emoji: "🔫",
    desc: "Fast, low damage.",
    damage: 9,
    fireRate: 9,
    bullets: 1,
    spread: 0.05,
    bulletSpeed: 820,
    color: "#80d8ff",
    unlockCost: 140,
  },
  {
    id: "shotgun",
    name: "Shotgun",
    emoji: "💥",
    desc: "5 pellets, short range.",
    damage: 8,
    fireRate: 1.7,
    bullets: 5,
    spread: 0.42,
    bulletSpeed: 680,
    color: "#ff8a65",
    unlockCost: 320,
  },
  {
    id: "rifle",
    name: "Assault Rifle",
    emoji: "🎯",
    desc: "Balanced auto power.",
    damage: 18,
    fireRate: 8,
    bullets: 1,
    spread: 0.03,
    bulletSpeed: 900,
    color: "#b9f6ca",
    unlockCost: 620,
  },
  {
    id: "minigun",
    name: "Minigun",
    emoji: "⚙️",
    desc: "A wall of lead.",
    damage: 14,
    fireRate: 16,
    bullets: 2,
    spread: 0.12,
    bulletSpeed: 980,
    color: "#ff5252",
    unlockCost: 1100,
  },
];

export function getWeapon(id) {
  return WEAPONS.find((w) => w.id === id) || WEAPONS[0];
}

// Effective stats after applying generic per-run upgrades (damage / firerate boosts).
export function effectiveStats(weapon, boosts) {
  return {
    ...weapon,
    damage: weapon.damage * (1 + 0.25 * boosts.damageLvl),
    fireRate: weapon.fireRate * (1 + 0.18 * boosts.fireRateLvl),
  };
}
