import { WEAPONS, getWeapon } from "./weapons.js";
import { ABILITIES } from "./game.js";

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.el = {
      hud: $("hud"),
      wave: $("hud-wave"),
      coins: $("hud-coins"),
      kills: $("hud-kills"),
      health: $("hud-health-fill"),
      waveFill: $("hud-wave-fill"),
      menu: $("menu"),
      shop: $("shop"),
      shopWave: $("shop-wave"),
      shopCoins: $("shop-coins"),
      shopItems: $("shop-items"),
      gameover: $("gameover"),
      goWave: $("go-wave"),
      goKills: $("go-kills"),
      goBest: $("go-best"),
      pause: $("pause"),
      abilities: document.querySelectorAll(".ability-btn"),
    };
    this.game = null;
  }

  bind(game) {
    this.game = game;
    // Ability buttons -> queue into input.
    this.el.abilities.forEach((btn) => {
      btn.addEventListener("click", () => game.input.queueAbility(btn.dataset.ability));
    });
  }

  showMenu() {
    this.el.menu.classList.remove("hidden");
    this.el.hud.classList.add("hidden");
    this.el.shop.classList.add("hidden");
    this.el.gameover.classList.add("hidden");
    this.el.pause.classList.add("hidden");
  }

  startGame() {
    this.el.menu.classList.add("hidden");
    this.el.gameover.classList.add("hidden");
    this.el.shop.classList.add("hidden");
    this.el.hud.classList.remove("hidden");
  }

  updateHud(game) {
    this.el.wave.textContent = game.wave;
    this.el.coins.textContent = game.coins;
    this.el.kills.textContent = game.kills;
    const hp = Math.max(0, game.player.health / game.player.maxHealth);
    this.el.health.style.width = `${hp * 100}%`;
    const prog = game.plan ? Math.min(1, game.spawnedCount / game.plan.count) : 0;
    this.el.waveFill.style.width = `${prog * 100}%`;

    // ability cooldown rings
    this.el.abilities.forEach((btn) => {
      const id = btn.dataset.ability;
      const cd = game.cooldowns[id] || 0;
      const max = ABILITIES[id].cooldown;
      const ratio = cd / max;
      btn.querySelector(".ability-cd").style.transform = `scaleY(${ratio})`;
      btn.classList.toggle("ready", cd <= 0);
    });
  }

  // ---------------------------------------------------------------- shop
  openShop() {
    this.el.shop.classList.remove("hidden");
    this.el.shopWave.textContent = this.game.wave;
    this.renderShop();
  }

  renderShop() {
    const g = this.game;
    this.el.shopCoins.textContent = g.coins;
    const items = [];

    // Next weapon tier
    const curIdx = WEAPONS.findIndex((w) => w.id === g.weaponId);
    const next = WEAPONS[curIdx + 1];
    if (next) {
      items.push({
        emoji: next.emoji,
        name: next.name,
        desc: next.desc,
        cost: next.unlockCost,
        level: "NEW WEAPON",
        action: () => g.buyWeapon(next.id),
      });
    } else {
      items.push({
        emoji: "⚙️",
        name: "Max Weapon",
        desc: "Top-tier firepower owned.",
        maxed: true,
        level: getWeapon(g.weaponId).name,
      });
    }

    items.push({
      emoji: "⬆️",
      name: "Damage +25%",
      desc: "More punch per bullet.",
      cost: 60 + g.boosts.damageLvl * 55,
      level: `Lv ${g.boosts.damageLvl}`,
      action: () => g.buyUpgrade("damage"),
    });
    items.push({
      emoji: "🔥",
      name: "Fire Rate +18%",
      desc: "Shoot faster.",
      cost: 60 + g.boosts.fireRateLvl * 55,
      level: `Lv ${g.boosts.fireRateLvl}`,
      action: () => g.buyUpgrade("firerate"),
    });
    items.push({
      emoji: "👥",
      name: "Add Soldier",
      desc: "Another gun in the squad.",
      cost: 80 + (g.player.squadSize - 1) * 90,
      level: g.player.squadSize >= 5 ? "MAX" : `${g.player.squadSize}/5`,
      maxed: g.player.squadSize >= 5,
      action: () => g.buyUpgrade("squad"),
    });
    items.push({
      emoji: "❤️",
      name: "Full Heal",
      desc: "Restore all health.",
      cost: 50,
      level: `${Math.round(g.player.health)}/${g.player.maxHealth}`,
      action: () => g.buyUpgrade("heal"),
    });
    items.push({
      emoji: "🛡️",
      name: "Max HP +25",
      desc: "Tougher squad.",
      cost: 70,
      level: `${g.player.maxHealth} HP`,
      action: () => g.buyUpgrade("maxhp"),
    });

    this.el.shopItems.innerHTML = "";
    for (const item of items) {
      const div = document.createElement("div");
      div.className = "shop-item";
      const affordable = !item.maxed && item.cost != null && g.coins >= item.cost;
      if (item.maxed) div.classList.add("maxed");
      else if (affordable) div.classList.add("affordable");
      else if (item.cost != null) div.classList.add("locked");

      div.innerHTML = `
        <span class="shop-item-emoji">${item.emoji}</span>
        <span class="shop-item-name">${item.name}</span>
        <span class="shop-item-desc">${item.desc}</span>
        <span class="shop-item-level">${item.level || ""}</span>
        ${item.maxed ? "" : `<div class="shop-item-cost">🪙 ${item.cost}</div>`}
      `;
      if (!item.maxed && item.action) {
        div.addEventListener("click", () => {
          if (item.action()) this.renderShop();
        });
      }
      this.el.shopItems.appendChild(div);
    }
  }

  closeShop() {
    this.el.shop.classList.add("hidden");
  }

  showGameOver(game) {
    this.el.hud.classList.add("hidden");
    this.el.gameover.classList.remove("hidden");
    this.el.goWave.textContent = game.wave;
    this.el.goKills.textContent = game.kills;
    this.el.goBest.textContent = game.bestWave;
  }

  showPause(show) {
    this.el.pause.classList.toggle("hidden", !show);
  }
}
