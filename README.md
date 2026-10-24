# The Backrooms

A 3D survival-horror game set in the Backrooms, playable in any desktop browser.
Textures, lighting and sound are generated procedurally at runtime, and the
creatures are sculpted, rigged and animated from code in Blender. The whole
game builds into one ~4 MB HTML file.

> *If you're not careful and you noclip out of reality in the wrong areas,
> you'll end up in the Backrooms, where it's nothing but the stink of old moist
> carpet, the madness of mono-yellow, the endless background noise of
> fluorescent lights at maximum hum-buzz, and approximately six hundred million
> square miles of randomly segmented empty rooms to be trapped in.*

## Play

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/index.html — a single self-contained file
```

Headphones recommended. Click to capture the mouse; `Esc` pauses.

| Key | Action |
| --- | --- |
| `W A S D` / mouse | Move / look |
| `Shift` | Sprint (stamina, noise) |
| `Ctrl` / `C` | Crouch (quiet; needed under low pipes) |
| `Space` | Jump |
| `E` | Interact: pick up, read, open doors, search crates |
| `F` | Flashlight (drains batteries) |
| `Q` | Drink Almond Water |
| `R` | Eat a Royal Ration |
| `Tab` / `J` | Journal: notes found, level info |
| `V` | Camcorder (VHS found-footage view) |

## The levels

Each level is infinite and procedurally generated per run.

| Level | | The way out |
| --- | --- | --- |
| **0 — The Lobby** | Mono-yellow wallpaper, moist carpet, humming troffers, dead-light zones, pits in the floor | Glitching walls (listen for static); a rare few lead to the Poolrooms instead; falling down a pit noclips you to Level 1 |
| **1 — Habitable Zone** | Foggy concrete warehouse, pillars, hanging strip lights, M.E.G. supply crates, sudden blackouts | Maintenance doors marked EXIT; a rare door with a balloon leads to Level Fun |
| **2 — Pipe Dreams** | Hot, dark pipe tunnels, caged bulbs, steam | Red fire-exit doors; corridors whose lights turn red drop you into Level ! |
| **3 — Electrical Station** | Brick and concrete, machinery, arcing panels, high entity count | Freight elevator |
| **4 — Abandoned Office** | Cubicles, windows onto nothing, water coolers that dispense Almond Water | Stairwell door |
| **5 — Terror Hotel** | Red carpet, damask, sconces, knockable doors, a piano. When the music stops, stop moving. | Boiler Room |
| **6 — Lights Out** | Total darkness; the dark swallows your flashlight | Follow the cold draft by ear |
| **7 — Thalassophobia** | Flooded rooms; something enormous beneath the deep water | The door with sunlight behind it (the ending) |
| **37 — The Poolrooms** | White tile, warm water, caustics, no entities | Dive into the deepest pool's drain → Level 4 |
| **Fun =)** | A party nobody came to. Balloons, cake, music box | Glitching walls back to Level 1 |
| **! — Run For Your Life** | Red strobes, an alarm, a corridor and something behind you | The green EXIT, ~330 m away |

## Survival

- **Thirst** drains over time (faster in Level 2's heat). **Sanity** drains
  faster in the dark and near entities. At low sanity the walls breathe, you hear
  whispers and footsteps, and shadow figures stand at the edge of your vision.
- **Almond Water** restores thirst and sanity. **Royal Rations** restore health.
  **Batteries** keep the flashlight alive.
- Notes from wanderers, the **M.E.G.** and the **Async Research Institute** explain
  each level and how to survive each entity.

## Entities

| Entity | Behaviour |
| --- | --- |
| **The Howler** (after Kane Pixels) | Stalks, notices you, howls, gallops on all fours. Break line of sight and keep turning corners. Lights flicker when it is near. |
| **Smilers** | Glowing grin in the dark. Don't shine your light on them, don't run, back away. |
| **Hounds** | Hold eye contact and they hesitate and flee; turn your back and they charge. Hunt by noise during blackouts. |
| **Deathmoths** | Drawn to your flashlight. |
| **Facelings** | Faceless wanderers. Mostly harmless. |
| **Skin-Stealers** | Call for help; only move while you aren't looking. |
| **Partygoers** | Hunt by sound: crouch to stay hidden. |
| **The Beast of Level 5** | When the piano stops, stand still until it plays again. |
| **The thing in Level 7** | Swim in the deep water too long and it rises. |

## How it works

- **World**: an infinite grid of 0.3 m cells streamed in 64×64-cell chunks.
  Generators are pure functions of the run seed and global coordinates, so
  chunks agree on shared walls without coordination (`src/levels/common.js`).
- **Lighting**: hundreds of fluorescent fixtures can't be real-time lights, so
  each chunk bakes per-vertex light: direct light from every fixture with wall
  occlusion (memoised grid ray casts) plus bounce light from a screened-Poisson
  diffusion over open cells. Each vertex keeps its four strongest fixtures as
  live slots in a float texture, so any light can flicker, die or black out
  (`src/world/bake.js`, `src/world/fixtures.js`).
- **Threads**: meshing and baking run in a pool of Web Workers
  (`src/world/chunkWorker.js`), with a main-thread fallback.
- **Rendering**: custom shaders (baked light, flashlight cookie, fog, grime,
  caustics, water, sanity warp), HDR bloom and a final pass for grading, grain,
  chromatic aberration, noclip glitches and the VHS camcorder look. Dynamic
  resolution keeps the frame rate up on slower GPUs.
- **Audio**: a Web Audio synth for the 120 Hz hum, footsteps per surface,
  reverb, and every entity voice (`src/audio/audio.js`).
- **Creatures**: built by Python scripts that drive Blender (`tools/blender/`).
  Each body is sculpted as a signed distance field: round cones, ellipsoids
  and boxes joined with smooth blends, so muscle flows into bone, plus carved
  details such as eye sockets and gill slits. Clothing is a layer offset from
  the body surface, with hard hems and cuffs. Marching cubes turns the field
  into a mesh, which Blender decimates and rigs with automatic weights. Vertex
  colours are baked: material regions (skin, shirt, trousers, hair) in RGB and
  ambient occlusion in alpha, so one model takes per-creature colours in game.
  Animations are keyed from code. Painted details (the Skin-Stealer's stitched
  face, the Partygoers' "=)", the moth's wings) are canvas textures on
  UV-mapped decals. The GLBs are then quantized and their animation tracks
  pruned (`tools/optimize-models.mjs`) before being inlined.

`tools/profile-chunks.mjs` profiles the chunk pipeline in Node, and
`tools/reachability.mjs` checks that every level's exits are reachable from the
spawn.

### Rebuilding the creatures

The built models are committed (`src/assets/creatures/`), so you only need
this to change a creature. You need Python 3.13 with Blender's Python module
and scikit-image:

```sh
pip install bpy==5.2.3 scikit-image
npm run models            # or BLENDER_PY=/path/to/python npm run models
```

Each script also renders previews, for example
`python tools/blender/human.py -- faceling out.glb previews/faceling` (add
`--motion` for a contact sheet of every animation).

## Credits

A fan game. The Backrooms began as an anonymous 4chan post in 2019 (quoted
above). Levels, entities, Almond Water and the M.E.G. come from the collaborative
fiction of the Backrooms Wikidot community (CC BY-SA). The Howler, the Async
Research Institute and the camcorder aesthetic are a tribute to Kane Pixels'
*The Backrooms (Found Footage)*.
