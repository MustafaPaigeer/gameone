// Unified input: keyboard for desktop, pointer/touch drag for both desktop and
// mobile. While a pointer is held, it reports a normalized target position
// (x and y); the squad follows it directly (see Player.update). Pressing
// anywhere grabs control — you don't have to press on the squad itself.

const clamp01 = (v) => Math.max(0, Math.min(1, v));

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pointerX = null;     // normalized 0..1 across the canvas, or null
    this.pointerY = null;     // normalized 0..1 down the canvas, or null
    this.pointerActive = false;
    this.abilityQueue = [];   // ability ids triggered this frame

    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (k === "q") this.queueAbility("airstrike");
      if (k === "e") this.queueAbility("godzilla");
      if (k === "r") this.queueAbility("kong");
      if (["arrowleft", "arrowright", "arrowup", "arrowdown", " "].includes(k)) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));

    const setPointer = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      this.pointerX = clamp01((clientX - rect.left) / rect.width);
      this.pointerY = clamp01((clientY - rect.top) / rect.height);
    };

    canvas.addEventListener("pointerdown", (e) => {
      this.pointerActive = true;
      setPointer(e.clientX, e.clientY);
      // Capture so the drag keeps tracking even if the pointer leaves the canvas.
      try { canvas.setPointerCapture(e.pointerId); } catch { /* unsupported */ }
    });
    canvas.addEventListener("pointermove", (e) => {
      if (this.pointerActive) setPointer(e.clientX, e.clientY);
    });
    const release = () => { this.pointerActive = false; this.pointerX = null; this.pointerY = null; };
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
  }

  queueAbility(id) {
    this.abilityQueue.push(id);
  }

  // Keyboard movement, -1 / 0 / +1 on each axis.
  get moveX() {
    let d = 0;
    if (this.keys.has("arrowleft") || this.keys.has("a")) d -= 1;
    if (this.keys.has("arrowright") || this.keys.has("d")) d += 1;
    return d;
  }
  get moveY() {
    let d = 0;
    if (this.keys.has("arrowup") || this.keys.has("w")) d -= 1;
    if (this.keys.has("arrowdown") || this.keys.has("s")) d += 1;
    return d;
  }

  consumeAbilities() {
    const a = this.abilityQueue;
    this.abilityQueue = [];
    return a;
  }
}
