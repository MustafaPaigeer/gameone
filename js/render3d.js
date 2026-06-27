// 3D renderer for Last Stand. Replaces the 2D canvas drawing: it reads the live
// game state each frame (player, zombies, bullets, titans, explosions) and
// renders them with Three.js. The simulation in game.js is untouched — this is
// purely a view. Models are low-poly so the big high-wave hordes stay cheap.
import * as THREE from "../vendor/three/three.module.js";

// World layout (units). Game uses CSS pixels: x across the road, y depth.
const ROAD_W = 10;      // world width of the playable road
const FAR_Z = -34;      // where zombies spawn (game roadTop)
const NEAR_Z = 6;       // the defense line (game defenseLine)
const MAX_ZOMBIES = 90; // rendered cap (sim may exceed; rest culled for perf)
const MAX_BULLETS = 120;

const col = (c) => new THREE.Color(c);
const lamb = (c, flat = true) => new THREE.MeshLambertMaterial({ color: col(c), flatShading: flat });
const glow = (c, op = 1) => new THREE.MeshBasicMaterial({ color: col(c), transparent: op < 1, opacity: op });

// Capsule limb whose pivot sits at its TOP, so rotation.x swings it like a joint.
function capLimb(r, len, m) {
  const g = new THREE.CapsuleGeometry(r, len, 4, 8);
  g.translate(0, -(len / 2 + r), 0);
  const me = new THREE.Mesh(g, m);
  me.castShadow = true;
  return me;
}

const ZTYPE = {
  walker: { cloth: "#6f7d52", skin: "#9e9583", lean: 1.0 },
  runner: { cloth: "#8a9a5b", skin: "#aeb59a", lean: 0.85 },
  brute:  { cloth: "#4f6b2f", skin: "#8a8676", lean: 1.15 },
  tank:   { cloth: "#3a5226", skin: "#7c7a68", lean: 1.3 },
  swarm:  { cloth: "#9ab06a", skin: "#c2caa6", lean: 0.8 },
  boss:   { cloth: "#7a2230", skin: "#9a5560", lean: 1.25 },
};

export class Renderer3D {
  constructor(container) {
    this.container = container;
    const canvas = document.createElement("canvas");
    // pointer-events:none so drags pass through to the input canvas beneath it.
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;z-index:1;pointer-events:none;";
    container.appendChild(canvas);
    this.canvas = canvas;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xc9d0cf, 24, 60);
    this.scene = scene;

    // sky gradient
    const cv = document.createElement("canvas"); cv.width = 4; cv.height = 256;
    const g = cv.getContext("2d").createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "#aacbe0"); g.addColorStop(0.5, "#cdd9da"); g.addColorStop(1, "#e6dcc6");
    const sctx = cv.getContext("2d"); sctx.fillStyle = g; sctx.fillRect(0, 0, 4, 256);
    const skyTex = new THREE.CanvasTexture(cv); skyTex.colorSpace = THREE.SRGBColorSpace;
    scene.background = skyTex;

    this.camera = new THREE.PerspectiveCamera(54, 0.5625, 0.1, 200);
    this.camBase = new THREE.Vector3(0, 7.4, 12.5);
    this.camLook = new THREE.Vector3(0, 1.8, -6);
    this.camera.position.copy(this.camBase);
    this.camera.lookAt(this.camLook);

    // lights
    scene.add(new THREE.HemisphereLight(0xbcd6e6, 0x55503f, 0.7));
    const sun = new THREE.DirectionalLight(0xfff1da, 2.2);
    sun.position.set(-10, 18, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 60;
    sun.shadow.camera.left = -12; sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 16; sun.shadow.camera.bottom = -10;
    sun.shadow.bias = -0.0007;
    scene.add(sun); scene.add(sun.target); sun.target.position.set(0, 0, -6);

    this.buildEnvironment();
    this.buildPools();

    this.muzzleLight = new THREE.PointLight(0xffa64d, 0, 14, 2);
    this.muzzleLight.position.set(0, 2, NEAR_Z - 1);
    scene.add(this.muzzleLight);

    this.shake = 0;
    this.camX = 0;
    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  // -------------------------------------------------------------- environment
  buildEnvironment() {
    const env = new THREE.Group(); this.scene.add(env);
    // water
    const water = new THREE.Mesh(new THREE.PlaneGeometry(200, 240), lamb("#2c8c9c", false));
    water.rotation.x = -Math.PI / 2; water.position.set(0, -1.6, -30); env.add(water);
    // road deck
    const roadCv = document.createElement("canvas"); roadCv.width = 128; roadCv.height = 256;
    const rx = roadCv.getContext("2d");
    rx.fillStyle = "#8a8f95"; rx.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 900; i++) { rx.fillStyle = `rgba(${90 + Math.random() * 60 | 0},${90 + Math.random() * 60 | 0},${95 + Math.random() * 55 | 0},.4)`; rx.fillRect(Math.random() * 128, Math.random() * 256, 2, 2); }
    rx.fillStyle = "#c7ad45"; for (let y = 8; y < 256; y += 46) rx.fillRect(60, y, 8, 26);
    rx.fillStyle = "rgba(220,220,220,.5)"; rx.fillRect(10, 0, 4, 256); rx.fillRect(114, 0, 4, 256);
    const roadTex = new THREE.CanvasTexture(roadCv);
    roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping; roadTex.repeat.set(1, 8); roadTex.colorSpace = THREE.SRGBColorSpace;
    this.roadTex = roadTex;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(ROAD_W, 0.6, 130), new THREE.MeshLambertMaterial({ map: roadTex }));
    deck.position.set(0, -0.3, -30); deck.receiveShadow = true; env.add(deck);
    // rails
    for (const s of [-1, 1]) {
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 130), lamb("#aeb4ba"));
      top.position.set(ROAD_W / 2 * s, 0.9, -30); env.add(top);
      for (let z = 12; z > -94; z -= 5) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.1, 0.18), lamb("#7f868d"));
        p.position.set(ROAD_W / 2 * s, 0.45, z); env.add(p);
      }
    }
    // defense line marker
    const dl = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W - 0.4, 0.5), glow("#c24a2a", 0.5));
    dl.rotation.x = -Math.PI / 2; dl.position.set(0, 0.02, NEAR_Z - 0.2); env.add(dl);
  }

  // -------------------------------------------------------------- pools
  buildPools() {
    // soldiers (player squad) — built lazily up to a small cap
    this.soldierPool = [];
    this.soldiers = [];
    // zombies
    this.zPool = [];
    this.zById = new Map();   // game zombie id -> mesh
    this.dying = [];          // meshes playing a death anim
    // bullets
    this.bulletPool = [];
    const bmat = glow("#ff9a2e");
    for (let i = 0; i < MAX_BULLETS; i++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 5), bmat);
      b.rotation.x = Math.PI / 2; b.visible = false; this.scene.add(b); this.bulletPool.push(b);
    }
    // explosions
    this.explPool = [];
    for (let i = 0; i < 12; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 1.2, 24),
        new THREE.MeshBasicMaterial({ color: 0xffab40, transparent: true, opacity: 0, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.1; ring.visible = false;
      this.scene.add(ring); this.explPool.push(ring);
    }
    // titans (godzilla / kong) — 2 reusable
    this.titanPool = { godzilla: this.makeTitan("#3d5f55"), kong: this.makeTitan("#5a4632") };
    for (const k in this.titanPool) { this.titanPool[k].visible = false; this.scene.add(this.titanPool[k]); }
  }

  makeSoldier() {
    const g = new THREE.Group();
    const tan = lamb("#9c8c61", false), vest = lamb("#857650", false), helm = lamb("#736845", false),
      skin = lamb("#caa078", false), metal = lamb("#26262b", false);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.42, 4, 8), tan); torso.position.y = 1.25; torso.scale.z = 0.7; torso.castShadow = true; g.add(torso);
    const v = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.26, 3, 8), vest); v.position.y = 1.24; v.scale.set(1.05, 1, 0.82); g.add(v);
    const lL = capLimb(0.12, 0.5, tan); lL.position.set(-0.13, 0.9, 0); g.add(lL);
    const lR = capLimb(0.12, 0.5, tan); lR.position.set(0.13, 0.9, 0); g.add(lR);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), skin); head.position.y = 1.66; g.add(head);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.185, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.6), helm); hl.position.y = 1.7; g.add(hl);
    const arms = new THREE.Group(); arms.position.set(0, 1.45, 0); g.add(arms);
    const aL = capLimb(0.1, 0.36, tan); aL.position.set(-0.24, 0.05, 0.12); aL.rotation.set(-1.3, 0, -0.05); arms.add(aL);
    const aR = capLimb(0.1, 0.36, tan); aR.position.set(0.24, 0.03, 0.06); aR.rotation.set(-1.4, 0, 0.05); arms.add(aR);
    const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.5), metal); rifle.position.set(0.04, -0.22, 0.3); arms.add(rifle);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6), metal); barrel.rotation.x = Math.PI / 2; barrel.position.set(0.04, -0.22, 0.62); arms.add(barrel);
    const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.45), glow("#ffb24a")); flash.position.set(0.04, -0.22, 0.82); flash.visible = false; arms.add(flash);
    g.userData = { arms, flash, lL, lR, fireT: Math.random() * 0.1 };
    g.scale.setScalar(0.9);
    return g;
  }

  makeCreature() {
    const cloth = lamb("#6f7d52", true), skin = lamb("#9e9583", true), dark = lamb("#2b2724", true);
    const g = new THREE.Group();
    const torso = new THREE.Group(); torso.position.y = 1.15; g.add(torso);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.44, 4, 8), cloth); body.position.y = 0.1; body.scale.z = 0.8; body.castShadow = true; torso.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 7), skin); head.position.set(0.04, 0.52, 0.06); head.castShadow = true; torso.add(head);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.12), dark); jaw.position.set(0.05, 0.44, 0.12); torso.add(jaw);
    function arm(side) {
      const a = capLimb(0.09, 0.34, cloth); a.position.set(side * 0.24, 0.3, 0.02); a.rotation.x = -1.2; torso.add(a);
      const fore = capLimb(0.07, 0.2, skin); fore.position.y = -0.5; a.add(fore);
      return a;
    }
    const aL = arm(-1), aR = arm(1);
    const lL = capLimb(0.1, 0.5, cloth); lL.position.set(-0.12, 0.9, 0); g.add(lL);
    const lR = capLimb(0.1, 0.5, cloth); lR.position.set(0.12, 0.9, 0); g.add(lR);
    torso.rotation.x = 0.18;
    g.userData = { torso, head, aL, aR, lL, lR, mats: [cloth, skin], phase: Math.random() * 6.28 };
    return g;
  }

  makeTitan(bodyCol) {
    const g = new THREE.Group();
    const body = lamb(bodyCol, false), spike = lamb("#1e302b", false);
    const lL = capLimb(0.55, 2.2, body); lL.position.set(-0.7, 3.6, 0); g.add(lL);
    const lR = capLimb(0.55, 2.2, body); lR.position.set(0.7, 3.6, 0); g.add(lR);
    const torso = new THREE.Group(); torso.position.y = 3.7; g.add(torso);
    const chest = new THREE.Mesh(new THREE.CapsuleGeometry(1.25, 1.6, 6, 10), body); chest.position.y = 1.6; chest.scale.z = 0.72; chest.castShadow = true; torso.add(chest);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.85, 10, 8), body); head.position.set(0, 3.3, 0.05); torso.add(head);
    const eL = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), glow("#ffd24a")); eL.position.set(-0.32, 3.45, 0.78); torso.add(eL);
    const eR = eL.clone(); eR.position.x = 0.32; torso.add(eR);
    for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.38, 1.0, 5), spike); s.position.set(0, 1.7 + i * 0.5, -0.85 + i * 0.1); torso.add(s); }
    const aL = capLimb(0.42, 1.7, body); aL.position.set(-1.5, 2.5, 0); aL.rotation.x = 0.25; torso.add(aL);
    const aR = capLimb(0.42, 1.7, body); aR.position.set(1.5, 2.5, 0); aR.rotation.x = 0.25; torso.add(aR);
    g.userData = { lL, lR, torso, aL, aR };
    g.scale.setScalar(1.5);
    return g;
  }

  // -------------------------------------------------------------- mapping
  mapX(gx, w) { return (gx / w - 0.5) * ROAD_W; }
  mapZ(gy, world) {
    const f = (gy - world.roadTop) / (world.defenseLine - world.roadTop);
    return FAR_Z + f * (NEAR_Z - FAR_Z);
  }

  // -------------------------------------------------------------- per-frame
  sync(game, dt) {
    const world = game.world;
    this.roadTex.offset.y -= dt * 0.18;

    // death anims (decoupled from sim)
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const m = this.dying[i]; m.userData.dieT += dt;
      const k = Math.min(1, m.userData.dieT / 0.35);
      m.rotation.x = -k * 1.4; m.scale.setScalar(m.userData.baseScale * (1 - k));
      if (k >= 1) { m.visible = false; this.dying.splice(i, 1); this.zPool.push(m); }
    }

    if (game.player && game.state !== "menu") {
      this.syncSquad(game, dt);
      this.syncZombies(game, dt);
      this.syncBullets(game, world);
      this.syncTitans(game, dt);
      this.syncExplosions(game, world);
    }

    this.shake = game.shake || 0;
    this.updateCamera(game, dt);
  }

  syncSquad(game, dt) {
    const p = game.player, w = game.world;
    const positions = p.gunPositions();
    // grow soldier pool to match
    while (this.soldiers.length < positions.length) {
      const s = this.makeSoldier(); this.scene.add(s); this.soldiers.push(s);
    }
    const z = this.mapZ(p.y, w);
    let anyFlash = false;
    for (let i = 0; i < this.soldiers.length; i++) {
      const s = this.soldiers[i];
      const on = i < positions.length;
      s.visible = on;
      if (!on) continue;
      s.position.set(this.mapX(positions[i], w.w), 0, z);
      s.rotation.y = Math.PI; // face down the road (-Z)
      const u = s.userData;
      // firing flash driven by the sim's muzzle timer
      const firing = p.muzzle > 0;
      u.flash.visible = firing;
      if (firing) { anyFlash = true; u.flash.scale.setScalar(0.6 + Math.random() * 0.5); }
      // subtle idle bob
      s.position.y = Math.sin(performance.now() * 0.004 + i) * 0.012;
    }
    this.muzzleLight.position.set(this.mapX(p.x, w.w), 2, z - 1);
    this.muzzleLight.intensity = anyFlash ? 5 : this.muzzleLight.intensity * 0.6;
  }

  syncZombies(game, dt) {
    const w = game.world;
    const alive = new Set();
    let shown = 0;
    for (const zb of game.zombies) {
      if (zb.dead) continue;
      if (shown >= MAX_ZOMBIES) break;
      shown++;
      alive.add(zb.id);
      let m = this.zById.get(zb.id);
      if (!m) {
        m = this.zPool.pop() || this.makeCreature();
        this.scene.add(m); this.zById.set(zb.id, m);
        // style by type
        const t = ZTYPE[zb.type] || ZTYPE.walker;
        m.userData.mats[0].color.set(t.cloth);
        m.userData.mats[1].color.set(t.skin);
        m.userData.baseScale = (zb.radius / 16);
        m.rotation.x = 0; m.visible = true;
      }
      m.position.set(this.mapX(zb.x, w.w), 0, this.mapZ(zb.y, w));
      m.scale.setScalar(m.userData.baseScale);
      // walk cycle scaled by speed
      const u = m.userData;
      u.phase += dt * (2 + zb.speed * 0.06);
      const sw = Math.sin(u.phase);
      u.lL.rotation.x = sw * 0.8; u.lR.rotation.x = -sw * 0.8;
      u.aL.rotation.x = -1.2 + sw * 0.2; u.aR.rotation.x = -1.2 - sw * 0.2;
      m.position.y = Math.abs(sw) * 0.06;
      // hit flash
      const hf = zb.hitFlash > 0 ? 0.8 : 0;
      u.mats.forEach((mm) => mm.emissive && mm.emissive.setScalar(hf));
    }
    // any mesh whose zombie is gone -> death anim
    for (const [id, m] of this.zById) {
      if (!alive.has(id)) {
        this.zById.delete(id);
        m.userData.dieT = 0; this.dying.push(m);
      }
    }
  }

  syncBullets(game, world) {
    for (let i = 0; i < this.bulletPool.length; i++) {
      const b = this.bulletPool[i], gb = game.bullets[i];
      if (gb && i < MAX_BULLETS) {
        b.visible = true;
        b.position.set(this.mapX(gb.x, world.w), 1.2, this.mapZ(gb.y, world));
      } else b.visible = false;
    }
  }

  syncTitans(game, dt) {
    const w = game.world;
    const used = { godzilla: false, kong: false };
    for (const t of game.titans) {
      const m = this.titanPool[t.kind]; if (!m || used[t.kind]) continue;
      used[t.kind] = true;
      m.visible = true;
      m.position.set(this.mapX(t.x, w.w), 0, this.mapZ(t.y, w));
      m.rotation.y = Math.PI;
      const ph = performance.now() * 0.004;
      m.userData.lL.rotation.x = Math.sin(ph) * 0.5;
      m.userData.lR.rotation.x = -Math.sin(ph) * 0.5;
      m.userData.torso.position.y = 3.7 + Math.abs(Math.sin(ph)) * 0.2;
    }
    for (const k in this.titanPool) if (!used[k]) this.titanPool[k].visible = false;
  }

  syncExplosions(game, world) {
    for (let i = 0; i < this.explPool.length; i++) {
      const ring = this.explPool[i], e = game.explosions[i];
      if (e) {
        const k = e.t / e.duration;
        ring.visible = true;
        ring.position.set(this.mapX(e.x, world.w), 0.1, this.mapZ(e.y, world));
        ring.scale.setScalar(0.3 + k * (e.radius / 30));
        ring.material.opacity = Math.max(0, 1 - k);
      } else ring.visible = false;
    }
  }

  updateCamera(game, dt) {
    const w = game.world;
    let targetX = 0;
    if (game.player) targetX = this.mapX(game.player.x, w.w) * 0.35;
    this.camX += (targetX - this.camX) * Math.min(1, dt * 4);
    const sh = this.shake * 0.04;
    const sx = (Math.random() * 2 - 1) * sh, sy = (Math.random() * 2 - 1) * sh;
    this.camera.position.set(this.camBase.x + this.camX + sx, this.camBase.y + sy, this.camBase.z);
    this.camera.lookAt(this.camLook.x + this.camX * 0.6, this.camLook.y, this.camLook.z);
  }

  render() { this.renderer.render(this.scene, this.camera); }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
}
