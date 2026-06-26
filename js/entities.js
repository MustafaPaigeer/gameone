// Game entities. All positions are in CSS pixels matching the canvas size.
import { ZOMBIE_TYPES } from "./levels.js";

let _id = 0;
const nextId = () => ++_id;

// ---------------------------------------------------------------- Bullet
export class Bullet {
  constructor(x, y, vx, vy, damage, color) {
    this.id = nextId();
    this.x = x; this.y = y;
    this.px = x; this.py = y;   // previous position, for swept collision
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.color = color;
    this.radius = 3.5;
    this.dead = false;
  }
  update(dt) {
    this.px = this.x; this.py = this.y;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.y < -20 || this.x < -20 || this.x > 9999) this.dead = true;
  }
  draw(ctx) {
    ctx.save();
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 8;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    // Tracer: a short streak in the direction of travel.
    ctx.ellipse(this.x, this.y, this.radius, this.radius * 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ---------------------------------------------------------------- Zombie
export class Zombie {
  constructor(type, x, y, hpScale, speedScale, damageScale = 1) {
    const t = ZOMBIE_TYPES[type];
    this.id = nextId();
    this.type = type;
    this.x = x; this.y = y;
    this.maxHp = Math.round(t.hp * hpScale);
    this.hp = this.maxHp;
    this.speed = t.speed * speedScale;
    this.radius = t.radius;
    this.damage = Math.round(t.damage * damageScale);
    this.coins = t.coins;
    this.emoji = t.emoji;
    this.color = t.color;
    this.dead = false;
    this.reached = false;     // crossed the player's defense line
    this.hitFlash = 0;
    this.wobble = Math.random() * Math.PI * 2;
    this.drift = (Math.random() - 0.5) * 18;  // slight horizontal sway
  }
  update(dt, targetY) {
    this.wobble += dt * 6;
    this.y += this.speed * dt;
    this.x += Math.sin(this.wobble) * this.drift * dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.y >= targetY) this.reached = true;
  }
  hurt(dmg) {
    this.hp -= dmg;
    this.hitFlash = 0.08;
    if (this.hp <= 0) this.dead = true;
    return this.dead;
  }
  draw(ctx) {
    const size = this.radius * 2.2;
    ctx.save();
    ctx.font = `${size}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (this.hitFlash > 0) {
      ctx.globalAlpha = 0.85;
      ctx.shadowColor = "#fff";
      ctx.shadowBlur = 16;
    }
    ctx.fillText(this.emoji, this.x, this.y);
    ctx.restore();

    // Health bar (only when damaged).
    if (this.hp < this.maxHp) {
      const w = this.radius * 2;
      const h = 4;
      const x = this.x - w / 2;
      const y = this.y - this.radius - 8;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = this.type === "boss" ? "#ff5252" : "#8bc34a";
      ctx.fillRect(x, y, w * (this.hp / this.maxHp), h);
    }
  }
}

// ---------------------------------------------------------------- Player squad
export const GUN_CAP = 9;    // max soldiers drawn / firing as distinct guns
export const ARMY_CAP = 50;  // hard ceiling on army size (keeps DPS sane)

export class Player {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.tx = x; this.ty = y;   // target the squad eases toward
    this.maxHealth = 100;
    this.health = 100;
    this.speed = 620;           // keyboard speed (px/s)
    this.responsiveness = 26;   // higher = snappier follow (frame-rate independent)
    this.lift = 30;             // squad sits slightly above the pointer/finger
    this.squadSize = 1;         // army count — grown by gates; drives firepower
    this.fireCooldown = 0;
    this.muzzle = 0;            // muzzle-flash timer
    this.hitFlash = 0;
    this.armyPulse = 0;         // brief scale-up when the count changes (gates)
  }

  // Clamp + animate the army count when a gate changes it.
  setArmy(n) {
    this.squadSize = Math.max(1, Math.min(ARMY_CAP, Math.round(n)));
    this.armyPulse = 0.35;
  }
  update(dt, input, world) {
    const margin = 34;
    // The squad roams a band — from below the spawn zone down to the wall — so
    // it can move freely up/down as well as left/right.
    const moveTop = world.h * 0.22;
    const moveBottom = world.defenseLine;

    if (input.pointerActive && input.pointerX != null) {
      // Follow the pointer directly, wherever it was pressed.
      this.tx = input.pointerX * world.w;
      this.ty = input.pointerY * world.h - this.lift;
    } else {
      this.tx += input.moveX * this.speed * dt;
      this.ty += input.moveY * this.speed * dt;
    }
    this.tx = Math.max(margin, Math.min(world.w - margin, this.tx));
    this.ty = Math.max(moveTop, Math.min(moveBottom, this.ty));

    // Frame-rate independent smoothing: fast to respond, smooth to watch.
    const a = 1 - Math.exp(-this.responsiveness * dt);
    this.x += (this.tx - this.x) * a;
    this.y += (this.ty - this.y) * a;

    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    if (this.muzzle > 0) this.muzzle -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.armyPulse > 0) this.armyPulse -= dt;
  }
  // Returns array of bullets if it fired this frame, else null.
  // Army drives firepower: up to GUN_CAP soldiers fire as distinct guns, and
  // any army beyond that adds a damage multiplier (so 50 soldiers stay sane).
  tryFire(dt, stats) {
    if (this.fireCooldown > 0) return null;
    const army = this.squadSize;
    const guns = Math.min(army, GUN_CAP);
    const rate = stats.fireRate * (1 + 0.03 * Math.min(army - 1, GUN_CAP));
    this.fireCooldown = 1 / rate;
    this.muzzle = 0.05;
    const dmgMult = army > GUN_CAP ? 1 + (army - GUN_CAP) * 0.06 : 1;
    const dmg = stats.damage * dmgMult;
    const bullets = [];
    const gunY = this.y - 18;
    const positions = this.gunPositions(guns);
    for (const gx of positions) {
      for (let i = 0; i < stats.bullets; i++) {
        const angle =
          -Math.PI / 2 +
          (stats.bullets > 1
            ? (i / (stats.bullets - 1) - 0.5) * stats.spread
            : (Math.random() - 0.5) * stats.spread);
        const vx = Math.cos(angle) * stats.bulletSpeed;
        const vy = Math.sin(angle) * stats.bulletSpeed;
        bullets.push(new Bullet(gx, gunY, vx, vy, dmg, stats.color));
      }
    }
    return bullets;
  }
  gunPositions(guns = Math.min(this.squadSize, GUN_CAP)) {
    if (guns <= 1) return [this.x];
    const spread = 16;
    const out = [];
    for (let i = 0; i < guns; i++) {
      out.push(this.x + (i - (guns - 1) / 2) * spread);
    }
    return out;
  }
  hurt(dmg) {
    this.health -= dmg;
    this.hitFlash = 0.15;
    if (this.health < 0) this.health = 0;
  }
  draw(ctx) {
    const positions = this.gunPositions();
    for (const gx of positions) {
      ctx.save();
      ctx.translate(gx, this.y);
      // Body
      ctx.fillStyle = this.hitFlash > 0 ? "#ff8a80" : "#1e3a8a";
      roundRect(ctx, -10, -16, 20, 28, 5);
      ctx.fill();
      // Vest
      ctx.fillStyle = "#3949ab";
      roundRect(ctx, -8, -6, 16, 14, 3);
      ctx.fill();
      // Head
      ctx.fillStyle = "#5d4037";
      ctx.beginPath();
      ctx.arc(0, -22, 7, 0, Math.PI * 2);
      ctx.fill();
      // Gun
      ctx.fillStyle = "#212121";
      ctx.fillRect(-3, -22, 6, -14);
      // Muzzle flash
      if (this.muzzle > 0) {
        ctx.fillStyle = "#ffd54f";
        ctx.beginPath();
        ctx.arc(0, -38, 7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Army count — the big growing number, à la the reference game.
    const scale = 1 + Math.max(0, this.armyPulse) * 0.9;
    const fs = 26 * scale;
    ctx.save();
    ctx.font = `900 ${fs}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.8)";
    ctx.fillStyle = this.armyPulse > 0 ? "#ffd54f" : "#fff";
    const ny = this.y - 44;
    ctx.strokeText(this.squadSize, this.x, ny);
    ctx.fillText(this.squadSize, this.x, ny);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- Number gate
// A pair of gates splitting the road in half. The squad passes through one and
// its operation is applied to the army count — the reference game's core hook.
export class GateSet {
  constructor(world, left, right) {
    this.world = world;
    this.left = left;     // { kind, value, label, good }
    this.right = right;
    this.mid = world.w / 2;
    this.y = -34;
    this.speed = 155;
    this.h = 44;
    this.applied = false;
    this.dead = false;
    this.chosen = null;
    this.flash = 0;
  }
  // Returns the chosen op exactly once, when the gate line crosses the squad.
  update(dt, player) {
    this.y += this.speed * dt;
    let result = null;
    if (!this.applied && this.y >= player.y) {
      this.applied = true;
      this.chosen = player.x < this.mid ? "left" : "right";
      result = this.chosen === "left" ? this.left : this.right;
      this.flash = 0.3;
    }
    if (this.flash > 0) this.flash -= dt;
    if (this.y > this.world.h + 60) this.dead = true;
    return result;
  }
  draw(ctx) {
    const w = this.world.w;
    const panels = [
      { op: this.left, x0: 0, x1: this.mid, side: "left" },
      { op: this.right, x0: this.mid, x1: w, side: "right" },
    ];
    ctx.save();
    ctx.font = "900 24px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const p of panels) {
      const rgb = p.op.good ? "0,200,83" : "229,57,53";
      const pw = p.x1 - p.x0;
      const picked = this.applied && this.chosen === p.side;
      ctx.fillStyle = `rgba(${rgb},${picked ? 0.4 : 0.2})`;
      ctx.fillRect(p.x0 + 4, this.y, pw - 8, this.h);
      ctx.strokeStyle = `rgba(${rgb},0.95)`;
      ctx.lineWidth = 3;
      ctx.strokeRect(p.x0 + 4, this.y, pw - 8, this.h);
      const cx = (p.x0 + p.x1) / 2;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.fillStyle = "#fff";
      ctx.strokeText(p.op.label, cx, this.y + this.h / 2);
      ctx.fillText(p.op.label, cx, this.y + this.h / 2);
    }
    ctx.restore();
  }
}

export function applyGateOp(op, army) {
  switch (op.kind) {
    case "add": return army + op.value;
    case "sub": return army - op.value;
    case "mul": return army * op.value;
    case "div": return army / op.value;
    default: return army;
  }
}

// ---------------------------------------------------------------- Particles
export class Particle {
  constructor(x, y, color) {
    this.x = x; this.y = y;
    const a = Math.random() * Math.PI * 2;
    const s = 60 + Math.random() * 180;
    this.vx = Math.cos(a) * s;
    this.vy = Math.sin(a) * s;
    this.life = 0.4 + Math.random() * 0.4;
    this.maxLife = this.life;
    this.color = color;
    this.size = 2 + Math.random() * 3;
    this.dead = false;
  }
  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += 240 * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }
  draw(ctx) {
    ctx.globalAlpha = Math.max(0, this.life / this.maxLife);
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x, this.y, this.size, this.size);
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------- Titan ally
// Godzilla / Kong march down the road smashing everything in a wide swath.
export class Titan {
  constructor(kind, x, world) {
    this.kind = kind;
    this.emoji = kind === "godzilla" ? "🦖" : "🦍";
    this.x = x;
    this.y = -120;
    this.world = world;
    this.radius = 110;
    this.speed = 150;
    this.dps = 1200;
    this.dead = false;
    this.stomp = 0;
    this.scream = kind === "godzilla" ? "🔥" : "💢";
  }
  update(dt, zombies, particles) {
    this.y += this.speed * dt;
    this.stomp += dt;
    // Smash zombies in range.
    for (const z of zombies) {
      if (z.dead) continue;
      const dx = z.x - this.x;
      const dy = z.y - this.y;
      if (dx * dx + dy * dy < (this.radius + z.radius) ** 2) {
        if (z.hurt(this.dps * dt)) {
          for (let i = 0; i < 6; i++) particles.push(new Particle(z.x, z.y, z.color));
        }
      }
    }
    if (this.y > this.world.h + 140) this.dead = true;
  }
  draw(ctx) {
    const bob = Math.sin(this.stomp * 6) * 8;
    ctx.save();
    ctx.font = "150px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // aura
    ctx.shadowColor = this.kind === "godzilla" ? "#ff6d00" : "#90caf9";
    ctx.shadowBlur = 40;
    ctx.fillText(this.emoji, this.x, this.y + bob);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- Explosion (airstrike)
export class Explosion {
  constructor(x, y, radius, damage) {
    this.x = x; this.y = y;
    this.radius = radius;
    this.damage = damage;
    this.t = 0;
    this.duration = 0.35;
    this.applied = false;
    this.dead = false;
  }
  update(dt, zombies, particles) {
    if (!this.applied) {
      this.applied = true;
      for (const z of zombies) {
        if (z.dead) continue;
        const dx = z.x - this.x, dy = z.y - this.y;
        if (dx * dx + dy * dy < this.radius * this.radius) {
          if (z.hurt(this.damage)) {
            for (let i = 0; i < 5; i++) particles.push(new Particle(z.x, z.y, z.color));
          }
        }
      }
      for (let i = 0; i < 14; i++) particles.push(new Particle(this.x, this.y, "#ff9800"));
    }
    this.t += dt;
    if (this.t >= this.duration) this.dead = true;
  }
  draw(ctx) {
    const p = this.t / this.duration;
    ctx.save();
    ctx.globalAlpha = 1 - p;
    ctx.strokeStyle = "#ffab40";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * p, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,152,0,0.35)";
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * p * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
