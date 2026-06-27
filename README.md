# Last Stand — Zombie Survival Shooter

A lane-based survival shooter inspired by "Last Z" / endless-runner shooters:
a squad of gunmen holds a road while waves of zombies pour down toward them.
The squad **auto-fires**; you move left/right to aim and dodge. Survive waves,
earn coins, upgrade your arsenal, and call in **giant titan allies** (Godzilla 🦖
and Kong 🦍) when the horde gets out of hand.

Built with plain **HTML5 Canvas + vanilla JavaScript** — no build step, no
dependencies. It runs on desktop browsers today and is touch-ready + installable
on mobile as a PWA. A path to a native mobile app (Capacitor) is described below.

## Play it

Because the game uses ES modules and a service worker, open it through a local
web server (not `file://`):

```bash
# from the project root
python3 -m http.server 8099
# then open http://localhost:8099 in your browser
```

Any static server works (`npx serve`, VS Code Live Server, etc.).

### Controls

| Action            | Desktop                          | Mobile            |
| ----------------- | -------------------------------- | ----------------- |
| Move squad        | Mouse drag · `A`/`D` · `←`/`→`   | Drag finger       |
| Fire              | Automatic                        | Automatic         |
| Airstrike         | `Q` or on-screen button          | Tap ✈️ button     |
| Summon Godzilla   | `E` or on-screen button          | Tap 🦖 button     |
| Summon Kong       | `R` or on-screen button          | Tap 🦍 button     |
| Pause             | `P` / `Esc`                      | ⏸ button          |

## Gameplay loop

- **Waves** get harder each round: more zombies, tankier, faster, and spawning
  quicker. Every **5th wave is a boss wave** (a giant 👹).
- **Zombie types**: walkers (slow), runners (fast/weak), brutes (tanky), bosses.
- **Coins** drop from kills and a wave-clear bonus. Spend them in the shop
  between waves.
- **Shop upgrades**: next weapon tier (Pistol → SMG → Shotgun → Assault Rifle →
  Minigun), +Damage, +Fire Rate, extra Soldier (up to 5 guns), Full Heal, +Max HP.
- **Titan allies** are big cooldown abilities that march down the road smashing
  everything in a wide swath — your "get out of jail" button for crowds and bosses.
- **Sound** — all sound effects are synthesized at runtime with the Web Audio
  API (no audio files). Toggle with the 🔊 button; the choice is saved.
- **Haptics** — short vibrations on phones when a zombie reaches your base, a
  titan/boss arrives, or you're overrun (Android browsers; iOS Safari has no
  web-vibration support, so it's a no-op there). On by default, can be disabled.
- Best wave reached is saved in `localStorage`.

## Project structure

```
index.html              Layout, HUD, menus, canvas
css/style.css           Styling, responsive + safe-area for mobile
manifest.webmanifest    PWA manifest (installable)
sw.js                   Service worker (offline cache)
icon.svg                App icon
js/
  main.js               Bootstrap, game loop, button wiring, SW registration
  game.js               Core engine: state, update/render, waves, abilities, shop
  entities.js           Player squad, Zombie, Bullet, Particle, Titan, Explosion
  levels.js             Difficulty curve & wave generation
  weapons.js            Weapon tiers and effective-stat math
  input.js              Keyboard + pointer/touch input
  ui.js                 HUD, shop, menu/overlay management
  audio.js              Web Audio engine: synthesized SFX
  haptics.js            Phone vibration feedback (Web Vibration API)
  render3d.js           Three.js renderer (3D view of the live game state)
vendor/three/           Vendored Three.js ESM build (offline-capable)
```

## 3D renderer

This branch renders the game in **3D with Three.js** instead of the 2D canvas.
The simulation in `game.js`/`entities.js` is unchanged — `render3d.js` reads the
live game state each frame (`Renderer3D.sync(game, dt)`) and draws a third-person
view down a bridge: low-poly soldiers, zombies (per type), titans, bullet tracers,
muzzle flashes and explosions, with the existing DOM HUD layered on top. Three.js
is vendored locally so the PWA still works offline.

Notes / follow-ups: models are procedural low-poly placeholders (swap in rigged
`.glb` characters later); the renderer caps drawn zombies for performance — large
hordes still need instancing/LOD (see `3D_SPEC.md`) to hit the mobile frame budget.

## Roadmap → native mobile

The web version is already mobile-playable (touch controls, portrait layout,
safe-area insets) and **installable as a PWA** (Add to Home Screen). To ship to
the App Store / Play Store, wrap the same code with [Capacitor](https://capacitorjs.com):

```bash
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap init "Last Stand" com.example.laststand --web-dir .
npx cap add ios
npx cap add android
npx cap sync
npx cap open android   # build/run in Android Studio
npx cap open ios       # build/run in Xcode
```

No code changes are required — Capacitor loads `index.html` in a native WebView.
Recommended follow-ups for a store release: replace `icon.svg` with raster icons
+ splash screens, add haptics (`@capacitor/haptics`) on hits/abilities, and lock
orientation to portrait in the native config.

## Ideas for future upgrades

- Sprite art / animation frames in place of emoji.
- More creative allies (tank, drone swarm, airstrike chains).
- Number "gates" across the road that multiply/boost the squad (as in the
  reference game).
- Persistent meta-progression between runs.
