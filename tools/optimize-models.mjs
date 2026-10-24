// Shrinks the Blender-exported creature models before they are inlined into
// the game: quantized vertex data (KHR_mesh_quantization, which three.js
// reads natively) and resampled animation tracks (redundant keys dropped).
// Run after the tools/blender scripts:  node tools/optimize-models.mjs
import fs from 'fs';
import path from 'path';
import { NodeIO, PropertyType } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, quantize, resample } from '@gltf-transform/functions';

/**
 * Drop animation channels that never leave the bone's rest value (the
 * Blender scripts key every bone every frame; most locations and scales never
 * move). three.js restores rest values for properties a clip doesn't drive.
 */
function dropStillChannels(eps = 1e-4) {
  return (doc) => {
    let n = 0;
    for (const anim of doc.getRoot().listAnimations()) {
      for (const ch of anim.listChannels()) {
        const node = ch.getTargetNode();
        const out = ch.getSampler().getOutput();
        const rest = { translation: node.getTranslation(), rotation: node.getRotation(), scale: node.getScale() }[ch.getTargetPath()];
        if (!rest) continue;
        const el = [];
        let still = true;
        for (let i = 0; i < out.getCount() && still; i++) {
          out.getElement(i, el);
          // q and -q are the same rotation
          const sign = ch.getTargetPath() === 'rotation' && el[3] * rest[3] < 0 ? -1 : 1;
          for (let k = 0; k < el.length; k++) if (Math.abs(el[k] * sign - rest[k]) > eps) still = false;
        }
        if (still) {
          const sampler = ch.getSampler();
          ch.dispose();
          sampler.dispose();
          n++;
        }
      }
    }
    return n;
  };
}

const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '../src/assets/creatures');
const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);
let total = 0;
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.glb'))) {
  const file = path.join(dir, f);
  const before = fs.statSync(file).size;
  const doc = await io.read(file);
  if (doc.getRoot().listExtensionsUsed().some((e) => e.extensionName === 'KHR_mesh_quantization')) {
    console.log(`${f}: already optimized`);
    total += before;
    continue;
  }
  await doc.transform(
    dropStillChannels(),
    resample({ tolerance: 1e-4 }),
    // keep UVs: the face and wing textures are attached at runtime, not in the file
    prune({ keepAttributes: true }),
    // materials are matched by name in game (face, eye, wing, glow): keep them apart
    dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH, PropertyType.SKIN] }),
    quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeColor: 8, quantizeWeight: 8 })
  );
  await io.write(file, doc);
  const after = fs.statSync(file).size;
  total += after;
  console.log(`${f}: ${(before / 1024).toFixed(0)} KB -> ${(after / 1024).toFixed(0)} KB`);
}
console.log(`total ${(total / 1024).toFixed(0)} KB`);
