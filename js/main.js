import { Game } from "./game.js";
import { UI } from "./ui.js";
import { Input } from "./input.js";
import { AudioEngine } from "./audio.js";
import { Haptics } from "./haptics.js";

const canvas = document.getElementById("game");
const input = new Input(canvas);
const ui = new UI();
const audio = new AudioEngine();
const haptics = new Haptics();
const game = new Game(canvas, input, ui, audio, haptics);
ui.bind(game);
ui.audio = audio;

// Debug handle: inspect or tweak the running game from the browser console.
window.game = game;

// ---------------------------------------------------------------- buttons
document.getElementById("start-btn").addEventListener("click", () => {
  audio.init(); // first user gesture — unlocks/starts the audio context
  game.newRun();
  ui.startGame();
});
document.getElementById("restart-btn").addEventListener("click", () => {
  audio.init();
  game.newRun();
  ui.startGame();
});
document.getElementById("next-wave-btn").addEventListener("click", () => {
  ui.closeShop();
  game.startWave(game.wave + 1);
});

const pauseBtn = document.getElementById("pause-btn");
const togglePause = () => {
  if (game.state === "playing") {
    game.state = "paused";
    ui.showPause(true);
    audio.stopMusic();
  } else if (game.state === "paused") {
    game.state = "playing";
    ui.showPause(false);
    audio.resume();
    audio.startMusic();
  }
};
pauseBtn.addEventListener("click", togglePause);
document.getElementById("resume-btn").addEventListener("click", togglePause);
document.getElementById("quit-btn").addEventListener("click", () => {
  game.state = "menu";
  ui.showPause(false);
  audio.stopMusic();
  ui.showMenu();
});

// Sound on/off toggle (persists via localStorage in the audio engine).
const muteBtn = document.getElementById("mute-btn");
const renderMute = () => { muteBtn.textContent = audio.muted ? "🔇" : "🔊"; };
renderMute();
muteBtn.addEventListener("click", () => {
  audio.init();
  audio.toggleMute();
  renderMute();
});
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k === "p" || k === "escape") togglePause();
});

ui.showMenu();

// ---------------------------------------------------------------- loop
let last = performance.now();
function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05; // clamp after tab switches
  game.update(dt);
  game.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------- PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    // updateViaCache:"none" makes the browser always revalidate sw.js from the
    // network, so a new deploy is picked up promptly instead of from HTTP cache.
    navigator.serviceWorker
      .register("sw.js", { updateViaCache: "none" })
      .then((reg) => reg.update())
      .catch(() => {});

    // When a freshly deployed worker takes control, reload once so the open
    // page swaps to the new code — users get updates just by reopening.
    const hadController = !!navigator.serviceWorker.controller;
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing || !hadController) return; // skip the first-ever install
      refreshing = true;
      window.location.reload();
    });
  });
}
