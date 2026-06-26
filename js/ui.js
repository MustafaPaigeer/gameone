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
    const nextWaveEl = document.getElementById("shop-next-wave");
    if (nextWaveEl) nextWaveEl.textContent = this.game.wave + 1;
    this.renderShop();
  }

  // A small dot meter showing how many levels of an upgrade you've earned.
  pips(filled, total) {
    let s = '<span class="card-pips">';
    for (let i = 0; i < total; i++) {
      s += `<span class="pip${i < filled ? " on" : ""}"></span>`;
    }
    return s + "</span>";
  }

  renderShop() {
    const g = this.game;
    this.el.shopCoins.textContent = g.coins;
    const fullHp = g.player.health >= g.player.maxHealth;
    const items = [];

    // Next weapon tier — the headline purchase.
    const curIdx = WEAPONS.findIndex((w) => w.id === g.weaponId);
    const next = WEAPONS[curIdx + 1];
    if (next) {
      items.push({
        emoji: next.emoji, name: next.name, desc: next.desc,
        cost: next.unlockCost, badge: "NEW WEAPON",
        meta: `Upgrade from ${getWeapon(g.weaponId).name}`,
        action: () => g.buyWeapon(next.id),
      });
    } else {
      items.push({
        emoji: "⚙️", name: getWeapon(g.weaponId).name,
        desc: "Top-tier firepower equipped.", maxed: true,
        meta: "Best weapon owned",
      });
    }

    items.push({
      emoji: "⬆️", name: "Damage", desc: "+25% damage per shot",
      cost: g.upgradeCost("damage"), meta: this.pips(g.boosts.damageLvl, 6),
      action: () => g.buyUpgrade("damage"),
    });
    items.push({
      emoji: "🔥", name: "Fire Rate", desc: "+18% shots per second",
      cost: g.upgradeCost("firerate"), meta: this.pips(g.boosts.fireRateLvl, 6),
      action: () => g.buyUpgrade("firerate"),
    });
    items.push({
      emoji: "❤️", name: "Repair", desc: "Restore full health",
      cost: g.upgradeCost("heal"), meta: `${Math.round(g.player.health)}/${g.player.maxHealth} HP`,
      disabled: fullHp, disabledLabel: "Full HP",
      action: () => g.buyUpgrade("heal"),
    });
    items.push({
      emoji: "🛡️", name: "Max Health", desc: "+25 maximum HP",
      cost: g.upgradeCost("maxhp"), meta: `${g.player.maxHealth} HP cap`,
      action: () => g.buyUpgrade("maxhp"),
    });

    this.el.shopItems.innerHTML = "";
    for (const item of items) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "shop-card";

      const affordable = !item.maxed && !item.disabled && g.coins >= item.cost;
      let buyHtml;
      if (item.maxed) {
        card.classList.add("maxed");
        card.disabled = true;
        buyHtml = `<span class="card-buy maxed">Maxed</span>`;
      } else if (item.disabled) {
        card.classList.add("locked");
        card.disabled = true;
        buyHtml = `<span class="card-buy off">${item.disabledLabel}</span>`;
      } else if (affordable) {
        card.classList.add("affordable");
        buyHtml = `<span class="card-buy can">Buy <b>🪙 ${item.cost}</b></span>`;
      } else {
        card.classList.add("locked");
        card.disabled = true;
        const need = item.cost - g.coins;
        buyHtml = `<span class="card-buy off">Need 🪙 ${need} more</span>`;
      }

      card.innerHTML = `
        <span class="card-top">
          <span class="card-icon">${item.emoji}</span>
          ${item.badge ? `<span class="card-badge">${item.badge}</span>` : ""}
        </span>
        <span class="card-name">${item.name}</span>
        <span class="card-desc">${item.desc}</span>
        <span class="card-meta">${item.meta || ""}</span>
        ${buyHtml}
      `;

      if (affordable && item.action) {
        card.addEventListener("click", () => {
          if (item.action()) {
            this.audio?.buy();
            this.flashCoins();
            this.renderShop();
          }
        });
      }
      this.el.shopItems.appendChild(card);
    }
  }

  // One restrained motion beat: the balance pulses when coins are spent.
  flashCoins() {
    const el = this.el.shopCoins;
    el.classList.remove("spent");
    void el.offsetWidth; // restart the animation
    el.classList.add("spent");
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
