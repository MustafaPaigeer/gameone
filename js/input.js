// Unified input: keyboard for desktop, pointer/touch drag for both desktop and
// mobile. Movement is expressed as a target X (0..1 across the road) plus a
// keyboard direction (-1 / 0 / +1) so the player can use either scheme.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pointerX = null;     // normalized 0..1, or null if no pointer is down
    this.pointerActive = false;
    this.abilityQueue = [];   // ability ids triggered this frame

    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (k === "q") this.queueAbility("airstrike");
      if (k === "e") this.queueAbility("godzilla");
      if (k === "r") this.queueAbility("kong");
      if (["arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));

    const setPointer = (clientX) => {
      const rect = canvas.getBoundingClientRect();
      this.pointerX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    };

    canvas.addEventListener("pointerdown", (e) => {
      this.pointerActive = true;
      setPointer(e.clientX);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (this.pointerActive) setPointer(e.clientX);
    });
    const release = () => { this.pointerActive = false; this.pointerX = null; };
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
    canvas.addEventListener("pointerleave", release);
  }

  queueAbility(id) {
    this.abilityQueue.push(id);
  }

  // Keyboard movement direction.
  get moveDir() {
    let d = 0;
    if (this.keys.has("arrowleft") || this.keys.has("a")) d -= 1;
    if (this.keys.has("arrowright") || this.keys.has("d")) d += 1;
    return d;
  }

  consumeAbilities() {
    const a = this.abilityQueue;
    this.abilityQueue = [];
    return a;
  }
}
