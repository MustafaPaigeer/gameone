// Light haptic feedback via the Web Vibration API. Supported on Android
// browsers (Chrome/Firefox); iOS Safari does not implement navigator.vibrate,
// so this is a graceful no-op there. Buzzes are short and reserved for
// impactful moments so they add feel without being annoying.

export class Haptics {
  constructor() {
    this.supported =
      typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
    this.enabled = localStorage.getItem("laststand_haptics") !== "0"; // on by default
    this.last = 0;
  }

  setEnabled(v) {
    this.enabled = v;
    localStorage.setItem("laststand_haptics", v ? "1" : "0");
    if (!v && this.supported) navigator.vibrate(0); // cancel any ongoing buzz
  }
  toggle() { this.setEnabled(!this.enabled); return this.enabled; }

  // pattern: a number (ms) or an array [vibrate, pause, vibrate, ...].
  // minGap throttles dense events (e.g. several zombies landing at once).
  buzz(pattern, minGap = 60) {
    if (!this.supported || !this.enabled) return;
    const now = performance.now();
    if (now - this.last < minGap) return;
    this.last = now;
    try { navigator.vibrate(pattern); } catch { /* ignore */ }
  }

  hit() { this.buzz(30, 80); }                       // a zombie reaches the squad/base
  heavy() { this.buzz([0, 45, 35, 70], 120); }       // big impact: titan / boss
  gameOver() { this.buzz([0, 90, 50, 140, 50, 220], 0); }
}
