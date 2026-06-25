import { Player, Zombie, Particle, Titan, Explosion } from "./entities.js";
import { buildWave, pickType } from "./levels.js";
import { getWeapon, effectiveStats } from "./weapons.js";

export const ABILITIES = {
  airstrike: { name: "Airstrike", cooldown: 14 },
  godzilla:  { name: "Godzilla", cooldown: 38 },
  kong:      { name: "Kong", cooldown: 32 },
};

const BEST_KEY = "laststand_best_wave";

export class Game {
  constructor(canvas, input, ui, audio = null) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.input = input;
    this.ui = ui;
    this.audio = audio;
    this.world = { w: 0, h: 0, roadTop: 0, defenseLine: 0 };
    this.state = "menu";
    this.bestWave = parseInt(localStorage.getItem(BEST_KEY) || "1", 10);
    this.scroll = 0;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.world.w = rect.width;
    this.world.h = rect.height;
    this.world.roadTop = 40;
    this.world.defenseLine = rect.height - 90;
    if (this.player) {
      this.player.y = this.world.defenseLine;
      this.player.ty = this.world.defenseLine;
    }
  }

  newRun() {
    this.player = new Player(this.world.w / 2, this.world.defenseLine);
    this.bullets = [];
    this.zombies = [];
    this.particles = [];
    this.titans = [];
    this.explosions = [];
    this.coins = 0;
    this.kills = 0;
    this.wave = 0;
    this.weaponId = "pistol";
    this.boosts = { damageLvl: 0, fireRateLvl: 0 };
    this.cooldowns = { airstrike: 0, godzilla: 0, kong: 0 };
    this.shake = 0;
    this.startWave(1);
    this.state = "playing";
    this.audio?.startMusic();
  }

  startWave(wave) {
    this.wave = wave;
    this.plan = buildWave(wave);
    this.spawnTimer = 0.6;
    this.spawnedCount = 0;
    this.state = "playing";
  }

  // ---------------------------------------------------------------- abilities
  triggerAbility(id) {
    if (this.state !== "playing") return;
    if (this.cooldowns[id] > 0) return;
    const def = ABILITIES[id];
    this.cooldowns[id] = def.cooldown;
    if (id === "airstrike") {
      // Five explosions raining across the road on the densest area.
      for (let i = 0; i < 6; i++) {
        const x = 40 + Math.random() * (this.world.w - 80);
        const y = this.world.roadTop + Math.random() * (this.world.h * 0.55);
        // Stagger them slightly via short-lived spawns.
        setTimeout(() => {
          if (this.state === "playing") {
            this.explosions.push(new Explosion(x, y, 90, 140));
            this.audio?.explosion();
          }
          this.shake = Math.max(this.shake, 8);
        }, i * 90);
      }
    } else if (id === "godzilla") {
      this.titans.push(new Titan("godzilla", this.world.w * 0.35, this.world));
      this.shake = 14;
      this.audio?.titan();
    } else if (id === "kong") {
      this.titans.push(new Titan("kong", this.world.w * 0.65, this.world));
      this.shake = 14;
      this.audio?.titan();
    }
  }

  // ---------------------------------------------------------------- shop hooks
  buyWeapon(weaponId) {
    const w = getWeapon(weaponId);
    if (this.coins < w.unlockCost) return false;
    this.coins -= w.unlockCost;
    this.weaponId = weaponId;
    return true;
  }
  // Single source of truth for upgrade prices (shared with the shop UI).
  // Costs grow geometrically so you can't max everything and trivialise the run.
  upgradeCost(kind) {
    const maxhpLvl = Math.round((this.player.maxHealth - 100) / 25);
    switch (kind) {
      case "damage": return Math.round(60 * Math.pow(1.55, this.boosts.damageLvl));
      case "firerate": return Math.round(60 * Math.pow(1.55, this.boosts.fireRateLvl));
      case "squad": return Math.round(120 * Math.pow(1.9, this.player.squadSize - 1));
      case "heal": return 40;
      case "maxhp": return Math.round(70 * Math.pow(1.4, maxhpLvl));
      default: return Infinity;
    }
  }
  buyUpgrade(kind) {
    if (kind === "squad" && this.player.squadSize >= 5) return false;
    const cost = this.upgradeCost(kind);
    if (this.coins < cost) return false;
    this.coins -= cost;
    if (kind === "damage") this.boosts.damageLvl++;
    else if (kind === "firerate") this.boosts.fireRateLvl++;
    else if (kind === "squad") this.player.squadSize++;
    else if (kind === "heal") this.player.health = this.player.maxHealth;
    else if (kind === "maxhp") {
      this.player.maxHealth += 25;
      this.player.health += 25;
    }
    return true;
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    if (this.state !== "playing") return;

    // cooldowns
    for (const k in this.cooldowns) {
      if (this.cooldowns[k] > 0) this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
    }

    // abilities from input
    for (const a of this.input.consumeAbilities()) this.triggerAbility(a);

    // background scroll
    this.scroll = (this.scroll + 90 * dt) % 80;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 30);

    // player
    this.player.update(dt, this.input, this.world);

    // auto-fire
    const stats = effectiveStats(getWeapon(this.weaponId), this.boosts);
    const fired = this.player.tryFire(dt, stats);
    if (fired) { this.bullets.push(...fired); this.audio?.shoot(); }

    // spawning
    if (this.spawnedCount < this.plan.count) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        if (this.plan.boss && this.spawnedCount === 0) {
          // Boss wave: lead with the boss (or several at very high waves).
          for (let i = 0; i < this.plan.bossCount; i++) {
            this.spawnOne("boss");
            this.spawnedCount++;
          }
          this.audio?.bossSpawn();
        } else {
          // Spawn a batch so the screen keeps filling as waves climb.
          const n = Math.min(this.plan.batch, this.plan.count - this.spawnedCount);
          for (let i = 0; i < n; i++) {
            this.spawnOne(pickType(this.plan.weights));
            this.spawnedCount++;
          }
        }
        this.spawnTimer = this.plan.spawnInterval * (0.7 + Math.random() * 0.6);
      }
    }

    // bullets
    for (const b of this.bullets) b.update(dt);

    // zombies
    for (const z of this.zombies) {
      z.update(dt, this.world.defenseLine);
      if (z.reached && !z.dead) {
        this.player.hurt(z.damage);
        z.dead = true;
        this.shake = Math.max(this.shake, 6);
        this.audio?.playerHit();
        for (let i = 0; i < 4; i++) this.particles.push(new Particle(z.x, z.y, "#e53935"));
      }
    }

    // bullet/zombie collisions
    this.collide();

    // titans + explosions
    for (const t of this.titans) t.update(dt, this.zombies, this.particles);
    for (const e of this.explosions) e.update(dt, this.zombies, this.particles);
    for (const p of this.particles) p.update(dt);

    // reap dead zombies, award coins/kills
    for (const z of this.zombies) {
      if (z.dead && !z.counted) {
        z.counted = true;
        if (z.hp <= 0 && !z.reached) {
          this.kills++;
          this.coins += z.coins;
          this.audio?.kill(z.type);
          for (let i = 0; i < 5; i++) this.particles.push(new Particle(z.x, z.y, z.color));
        }
      }
    }

    // cleanup
    this.bullets = this.bullets.filter((b) => !b.dead);
    this.zombies = this.zombies.filter((z) => !z.dead);
    this.particles = this.particles.filter((p) => !p.dead);
    this.titans = this.titans.filter((t) => !t.dead);
    this.explosions = this.explosions.filter((e) => !e.dead);

    // death check
    if (this.player.health <= 0) {
      this.endRun();
      return;
    }

    // wave clear check
    if (this.spawnedCount >= this.plan.count && this.zombies.length === 0) {
      this.coins += this.plan.clearBonus;
      this.state = "shop";
      this.audio?.waveClear();
      this.ui.openShop();
    }

    this.ui.updateHud(this);
  }

  spawnOne(type) {
    const margin = 40;
    const x = margin + Math.random() * (this.world.w - margin * 2);
    const z = new Zombie(
      type, x, this.world.roadTop - 20,
      this.plan.hpScale, this.plan.speedScale, this.plan.damageScale
    );
    this.zombies.push(z);
  }

  collide() {
    for (const b of this.bullets) {
      if (b.dead) continue;
      for (const z of this.zombies) {
        if (z.dead) continue;
        // Cheap prune: bullets travel near-vertically, so if both ends of the
        // travel segment are on the same side of the zombie and far in x, skip
        // the full test. Keeps high zombie counts cheap without missing hits.
        const dxc = b.x - z.x, dxp = b.px - z.x;
        if (dxc * dxp > 0 && Math.min(Math.abs(dxc), Math.abs(dxp)) > z.radius + b.radius + 4) continue;
        // Swept test: measure the bullet's whole travel segment this frame
        // against the zombie so fast bullets can't tunnel through. The hit
        // radius is padded a little to match the drawn emoji size.
        const r = z.radius + b.radius + 2;
        if (segCircleHit(b.px, b.py, b.x, b.y, z.x, z.y, r)) {
          z.hurt(b.damage);
          b.dead = true;
          this.audio?.hit();
          this.particles.push(new Particle(b.x, b.y, "#ffeb3b"));
          break;
        }
      }
    }
  }

  endRun() {
    this.state = "gameover";
    this.audio?.gameOver();
    if (this.wave > this.bestWave) {
      this.bestWave = this.wave;
      localStorage.setItem(BEST_KEY, String(this.bestWave));
    }
    this.ui.showGameOver(this);
  }

  // ---------------------------------------------------------------- render
  render() {
    const ctx = this.ctx;
    const { w, h } = this.world;
    ctx.save();
    if (this.shake > 0) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }

    this.drawBackground(ctx, w, h);

    if (this.state === "menu") { ctx.restore(); return; }

    for (const e of this.explosions) e.draw(ctx);
    for (const b of this.bullets) b.draw(ctx);
    for (const z of this.zombies) z.draw(ctx);
    for (const t of this.titans) t.draw(ctx);
    if (this.player) this.player.draw(ctx);
    for (const p of this.particles) p.draw(ctx);

    ctx.restore();
  }

  drawBackground(ctx, w, h) {
    // Water/sky sides
    ctx.fillStyle = "#0a1a2a";
    ctx.fillRect(0, 0, w, h);
    // Road
    const roadW = w;
    ctx.fillStyle = "#3a3f47";
    ctx.fillRect(0, 0, roadW, h);
    // Lane dashes scrolling toward player to convey forward motion.
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 4;
    ctx.setLineDash([30, 50]);
    ctx.lineDashOffset = -this.scroll;
    for (let i = 1; i < 4; i++) {
      const x = (w / 4) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // Defense line
    if (this.state !== "menu") {
      ctx.strokeStyle = "rgba(255,87,34,0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, this.world.defenseLine + 22);
      ctx.lineTo(w, this.world.defenseLine + 22);
      ctx.stroke();
    }
  }
}

// Distance from a circle centre (cx,cy) to the closest point on segment A->B,
// returning true if it is within radius r. Used for swept bullet collision.
function segCircleHit(ax, ay, bx, by, cx, cy, r) {
  const abx = bx - ax, aby = by - ay;
  const len2 = abx * abx + aby * aby;
  let t = len2 ? ((cx - ax) * abx + (cy - ay) * aby) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const px = ax + abx * t, py = ay + aby * t;
  const dx = cx - px, dy = cy - py;
  return dx * dx + dy * dy <= r * r;
}
