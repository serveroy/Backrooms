#!/bin/sh
# Rebuild every creature model into src/assets/creatures/.
# Needs Python 3.13 with the bpy and scikit-image packages:
#   pip install bpy==5.2.3 scikit-image
# Set BLENDER_PY to that interpreter if it isn't `python3`.
set -e
PY=${BLENDER_PY:-python3}
cd "$(dirname "$0")/../.."
$PY tools/blender/howler.py
for v in faceling skinstealer partygoer phantom smiler; do
  $PY tools/blender/human.py -- "$v"
done
$PY tools/blender/hound.py
$PY tools/blender/deathmoth.py
$PY tools/blender/leviathan.py
node tools/optimize-models.mjs
