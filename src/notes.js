// Lore notes found throughout the Backrooms. Three voices:
//  - wanderer: handwritten journal pages by people who got lost
//  - meg: field guides from the Major Explorer Group (M.E.G.)
//  - async: internal documents from the Async Research Institute
// Notes double as hints for the game's mechanics.

export const INTRO_QUOTE =
  "If you're not careful and you noclip out of reality in the wrong areas, you'll end up in the Backrooms, where it's nothing but the stink of old moist carpet, the madness of mono-yellow, the endless background noise of fluorescent lights at maximum hum-buzz, and approximately six hundred million square miles of randomly segmented empty rooms to be trapped in.\n\nGod save you if you hear something wandering around nearby, because it sure as hell has heard you.";

export const NOTES = [
  // ------------------------------------------------------------- LEVEL 0
  {
    id: 'l0-first',
    level: 'level0',
    kind: 'wanderer',
    title: 'Day 1?',
    body: "I was leaning on a wall at work. Then the wall wasn't there.\n\nIt smells like a basement that flooded twenty years ago and nobody ever dried. The lights never stop buzzing. I counted 400 of them before I gave up.\n\nThere is no door back. I checked every wall I could find.",
    sig: '— M.',
  },
  {
    id: 'l0-water',
    level: 'level0',
    kind: 'wanderer',
    title: 'Found water',
    body: "Little bottles of water, just sitting against the walls like somebody left them for us. It tastes like almonds. I don't care.\n\nAfter I drank one the buzzing got quieter. Not the lights — the buzzing in my head. Drink it when things start to feel wrong. They will.",
    sig: '',
  },
  {
    id: 'l0-meg-guide',
    level: 'level0',
    kind: 'meg',
    title: 'M.E.G. Survival Card — Level 0',
    body: "1. Stay calm. Level 0 is mostly empty. MOSTLY.\n2. Almond Water restores body and mind. Ration it.\n3. Where the lights are dead, do not linger. Things live where the light doesn't reach.\n4. You will not find a door out. Exits from Level 0 are glitches: walls that shimmer and stutter like a bad tape. Listen for static. Walk INTO them.\n5. If you hear running on carpet, it is not one of us.",
    sig: 'Major Explorer Group',
  },
  {
    id: 'l0-async-1',
    level: 'level0',
    kind: 'async',
    title: 'ASYNC RESEARCH INSTITUTE — Memo 7',
    body: "RE: Threshold test, Expedition 2\n\nCamera feed held for 41 minutes after entry. Operator described the environment exactly as predicted: yellow wallpaper, carpet, fluorescent ceiling grid. Operator reported distant 'galloping' at minute 37.\n\nFeed terminated at minute 41. The final frame shows something very tall at the end of a hallway. It is looking at the camera.\n\nRecommend Expedition 3 carries no light source that can be seen from a distance.",
    sig: '— Internal, do not distribute',
    stamp: 'CONFIDENTIAL',
  },
  {
    id: 'l0-howler',
    level: 'level0',
    kind: 'wanderer',
    title: 'it runs',
    body: "IT RUNS ON ALL FOURS. Long arms. The head was wrong, tilted like it was listening.\n\nI got away by breaking line of sight and not stopping. It loses you if it can't see you for a while. Don't look back while you run. Turn corners. Keep turning corners.",
    sig: '',
  },
  {
    id: 'l0-dark',
    level: 'level0',
    kind: 'wanderer',
    title: 'Dark rooms',
    body: "Some sections have no working lights at all. My flashlight only lasts so long — I pull the batteries out of anything I can find.\n\nThe longer I stay in the dark the worse I feel. My hands shake. I hear people talking where nobody is.",
    sig: '',
  },
  {
    id: 'l0-count',
    level: 'level0',
    kind: 'wanderer',
    title: '',
    body: "I keep finding my own footprints in the wet carpet.\n\nI haven't been here before.\n\nI HAVEN'T BEEN HERE BEFORE.",
    sig: '',
  },
  // ------------------------------------------------------------- LEVEL 1
  {
    id: 'l1-habitable',
    level: 'level1',
    kind: 'meg',
    title: 'M.E.G. Notice — Level 1 "Habitable Zone"',
    body: "Concrete floors, exposed rebar, fog that comes and goes. Supply crates appear and disappear at random — check them, they often hold Almond Water and batteries.\n\nThe lights here fail without warning. When it goes dark, STAND STILL and wait for them to return. Hounds hunt by movement and noise.\n\nThe way down is through the heavy maintenance doors. Look for the ones with the faded EXIT stencil.",
    sig: 'Base Alpha',
  },
  {
    id: 'l1-hound',
    level: 'level1',
    kind: 'meg',
    title: 'Entity Brief: Hounds',
    body: "Humanoid, emaciated, moves on all fours. Long matted hair.\n\nHounds are cowards. If one approaches, FACE IT. Do not turn your back and do not sprint unless you have somewhere to go. Sustained eye contact makes them hesitate and back away.\n\nRunning tells them you are prey.",
    sig: 'M.E.G. Entity Division',
  },
  {
    id: 'l1-moths',
    level: 'level1',
    kind: 'wanderer',
    title: 'moths',
    body: "Moths the size of dogs. They go for light. My flashlight was ON and one came straight out of the fog at me.\n\nIf you hear flapping, turn your light off and get low.",
    sig: '— Kev',
  },
  {
    id: 'l1-async',
    level: 'level1',
    kind: 'async',
    title: 'ASYNC — Threshold Log 12',
    body: "Subject passed from the 'yellow' environment to a concrete warehouse environment after walking into a visibly unstable wall section.\n\nSubject reported the transition as 'falling sideways out of a dream.'\n\nWe now believe the instability is not an accident. Something is letting people through.",
    sig: '',
    stamp: 'INTERNAL',
  },
  // ------------------------------------------------------------- LEVEL 2
  {
    id: 'l2-pipes',
    level: 'level2',
    kind: 'wanderer',
    title: 'Pipe Dreams',
    body: "It's so hot. The pipes sweat and hiss. Some of them are too hot to touch and some of them are cold as ice, side by side.\n\nThe corridors go on forever, all the same. I marked a pipe with my keys. I passed it four times.\n\nThere is a fire door somewhere. Someone painted an arrow on a pipe. I'm following the arrows.",
    sig: '',
  },
  {
    id: 'l2-smiler',
    level: 'level2',
    kind: 'meg',
    title: 'Entity Brief: Smilers',
    body: "You will see only the teeth and the eyes. They glow faintly in total darkness.\n\nDo NOT shine your light on a Smiler. Do NOT run.\n\nTurn your light off, back away slowly, and break line of sight. They are slow to follow a calm target.",
    sig: 'M.E.G. Entity Division',
  },
  {
    id: 'l2-red',
    level: 'level2',
    kind: 'wanderer',
    title: 'RED',
    body: "If the lights ever turn red and an alarm starts — RUN. Don't think. Don't look back. Run straight and don't stop until you see the exit.\n\nI don't know where that hallway goes. I know what was behind me.",
    sig: '',
  },
  // ------------------------------------------------------------- LEVEL 3
  {
    id: 'l3-electric',
    level: 'level3',
    kind: 'meg',
    title: 'M.E.G. Warning — Level 3 "Electrical Station"',
    body: "HIGH ENTITY DENSITY. Do not travel alone. Do not travel at all if you can avoid it.\n\nMachinery noise masks footsteps — yours and theirs. Exposed wiring arcs without warning.\n\nThe exit is a freight elevator. It still works. We don't know who maintains it.",
    sig: 'Major Explorer Group',
  },
  {
    id: 'l3-skin',
    level: 'level3',
    kind: 'wanderer',
    title: 'not a person',
    body: "Someone called for help. Said my name. I almost went.\n\nIt was wearing a person. The face didn't move when it talked.\n\nIf a wanderer calls you over, LOOK at them first. If they stop moving when you look, they're not one of us.",
    sig: '',
  },
  {
    id: 'l3-async',
    level: 'level3',
    kind: 'async',
    title: 'ASYNC — Facility Note',
    body: "The machinery in this environment produces power. Our instruments can measure it. It is going SOMEWHERE.\n\nHypothesis: the Backrooms are not empty. They are running.",
    sig: '',
    stamp: 'EYES ONLY',
  },
  // ------------------------------------------------------------- LEVEL 4
  {
    id: 'l4-office',
    level: 'level4',
    kind: 'wanderer',
    title: 'Office',
    body: "An empty office building. Cubicles, carpet, water coolers. The water coolers dispense almond water. I cried.\n\nThe windows show nothing. Just dark, and rain that never hits the glass.\n\nI think it's safe here. I think. The stairwell door is open. I can hear music downstairs.",
    sig: '— M.',
  },
  {
    id: 'l4-windows',
    level: 'level4',
    kind: 'meg',
    title: 'Advisory: Do not approach the windows',
    body: "There is nothing outside the windows of Level 4.\n\nIf you see something outside the windows of Level 4, walk away and do not return to that floor.",
    sig: 'M.E.G.',
  },
  {
    id: 'l4-async',
    level: 'level4',
    kind: 'async',
    title: 'ASYNC — Recovered Note',
    body: "Expedition 6 reached an office environment with working water dispensers. Subject's vitals stabilised.\n\nSubject requested to stay. Request denied. Subject proceeded down the stairwell at 14:02.\n\nWe have not heard from Expedition 6 since 14:09.",
    sig: '',
  },
  // ------------------------------------------------------------- LEVEL 5
  {
    id: 'l5-hotel',
    level: 'level5',
    kind: 'wanderer',
    title: 'Terror Hotel',
    body: "A grand hotel. Red carpet, brass lamps, a piano playing somewhere and nobody at it.\n\nThe rooms are all locked. I knocked once and something knocked back.\n\nThe boiler room is at the far end, everyone says so. Through the boiler room is darkness. Pure darkness. Bring light.",
    sig: '',
  },
  {
    id: 'l5-beast',
    level: 'level5',
    kind: 'meg',
    title: 'Level 5 Rules',
    body: "1. Do not open any door that you hear breathing behind.\n2. If the music stops, stop moving until it starts again.\n3. The Boiler Room leads on. It is very hot and very dark. Keep your batteries charged.",
    sig: 'M.E.G.',
  },
  // ------------------------------------------------------------- LEVEL 6
  {
    id: 'l6-dark',
    level: 'level6',
    kind: 'wanderer',
    title: 'lights out',
    body: "no lights. none. my flashlight barely works here, like the dark eats it.\n\nsomething touched my shoulder.\n\nthere's a draft. cold air. salt? I'm following it.",
    sig: '',
  },
  {
    id: 'l6-async',
    level: 'level6',
    kind: 'async',
    title: 'ASYNC — Final Transmission',
    body: "If you are reading this, you made it further than we did.\n\nPast the dark there is water. Past the water there is a door. We saw it on the last camera. We do not know where it leads.\n\nWe think it leads home. We are afraid it doesn't.",
    sig: '— A.R.I.',
    stamp: 'FINAL',
  },
  // ------------------------------------------------------------- LEVEL 7
  {
    id: 'l7-sea',
    level: 'level7',
    kind: 'wanderer',
    title: 'Thalassophobia',
    body: "An ocean. Indoors. The rooms are flooded and the water is perfectly still and black.\n\nThere is something under it. It is very, very big. It hasn't noticed me yet.\n\nI can see a door at the end of the last room, half under water. It has a little window and the light behind it is SUNLIGHT.",
    sig: '',
  },
  // ------------------------------------------------------------- LEVEL 37
  {
    id: 'l37-pool',
    level: 'level37',
    kind: 'wanderer',
    title: 'Poolrooms',
    body: "White tiles everywhere. Warm water. It's so quiet. It's the most peaceful place I've ever been and I have never been more afraid.\n\nThere are no entities here. Nobody knows why it feels like being watched.\n\nThe drains in the deep pools lead somewhere else. Somewhere with carpet and desks.",
    sig: '',
  },
  {
    id: 'l37-meg',
    level: 'level37',
    kind: 'meg',
    title: 'M.E.G. Note — Level 37 "Sublimity"',
    body: "Safe. Do not get comfortable.\n\nTo leave: swim down into the darkest pool you can find and let the drain take you. Explorers who did so arrived on Level 4.",
    sig: 'M.E.G.',
  },
  // ------------------------------------------------------------- LEVEL FUN
  {
    id: 'lfun-1',
    level: 'levelfun',
    kind: 'wanderer',
    title: 'DON\'T',
    body: "Balloons. Confetti. A party for nobody. Signs that say HAPPY BIRTHDAY in letters that are almost right.\n\nIf you see someone smiling at you, they are not smiling. They are DRAWN ON.\n\nThey want you to come to the party. DO NOT GO TO THE PARTY.\n\nThere's a door marked with a balloon that leads out. Find it fast.",
    sig: '',
  },
  {
    id: 'lfun-2',
    level: 'levelfun',
    kind: 'meg',
    title: 'Entity Brief: Partygoers',
    body: "Yellow humanoids with a crude smiley face '=)'. Extremely fast. Extremely hostile.\n\nThey have no eyes, so they hunt by sound. Crouch-walk and they will struggle to find you. Sprint and they will find you immediately.",
    sig: 'M.E.G. Entity Division',
  },
  // ------------------------------------------------------------- LEVEL !
  {
    id: 'lrun-1',
    level: 'levelrun',
    kind: 'wanderer',
    title: 'RUN FOR YOUR LIFE',
    body: 'RUN\nRUN\nRUN\nRUN\nDON\'T STOP',
    sig: '',
  },
];

export function notesForLevel(levelId) {
  return NOTES.filter((n) => n.level === levelId);
}

export function noteById(id) {
  return NOTES.find((n) => n.id === id);
}
