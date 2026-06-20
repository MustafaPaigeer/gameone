// Game entities. All positions are in CSS pixels matching the canvas size.
import { ZOMBIE_TYPES } from "./levels.js";

let _id = 0;
const nextId = () => ++_id;

// ---------------------------------------------------------------- Bullet
export class Bullet {
  constructor(x, y, vx, vy, damage, color) {
    this.id = nextId();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.color = color;
    this.radius = 3.5;
    this.dead = false;
  }
  update(dt) {
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
  constructor(type, x, y, hpScale, speedScale) {
    const t = ZOMBIE_TYPES[type];
    this.id = nextId();
    this.type = type;
    this.x = x; this.y = y;
    this.maxHp = Math.round(t.hp * hpScale);
    this.hp = this.maxHp;
    this.speed = t.speed * speedScale;
    this.radius = t.radius;
    this.damage = t.damage;
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
export class Player {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.maxHealth = 100;
    this.health = 100;
    this.speed = 420;
    this.squadSize = 1;       // visual soldiers; also small fire-rate bonus
    this.fireCooldown = 0;
    this.muzzle = 0;          // muzzle-flash timer
    this.hitFlash = 0;
  }
  update(dt, input, world) {
    // Pointer drag takes priority; otherwise keyboard.
    if (input.pointerActive && input.pointerX != null) {
      const targetX = input.pointerX * world.w;
      const dx = targetX - this.x;
      this.x += Math.max(-this.speed * dt, Math.min(this.speed * dt, dx));
    } else {
      this.x += input.moveDir * this.speed * dt;
    }
    const margin = 34;
    this.x = Math.max(margin, Math.min(world.w - margin, this.x));
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    if (this.muzzle > 0) this.muzzle -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
  }
  // Returns array of bullets if it fired this frame, else null.
  tryFire(dt, stats) {
    if (this.fireCooldown > 0) return null;
    const rate = stats.fireRate * (1 + 0.05 * (this.squadSize - 1));
    this.fireCooldown = 1 / rate;
    this.muzzle = 0.05;
    const bullets = [];
    const gunY = this.y - 18;
    const positions = this.gunPositions();
    for (const gx of positions) {
      for (let i = 0; i < stats.bullets; i++) {
        const angle =
          -Math.PI / 2 +
          (stats.bullets > 1
            ? (i / (stats.bullets - 1) - 0.5) * stats.spread
            : (Math.random() - 0.5) * stats.spread);
        const vx = Math.cos(angle) * stats.bulletSpeed;
        const vy = Math.sin(angle) * stats.bulletSpeed;
        bullets.push(new Bullet(gx, gunY, vx, vy, stats.damage, stats.color));
      }
    }
    return bullets;
  }
  gunPositions() {
    const n = Math.min(this.squadSize, 5);
    if (n === 1) return [this.x];
    const spread = 18;
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push(this.x + (i - (n - 1) / 2) * spread);
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
