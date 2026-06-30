#!/usr/bin/env bash
# Add a 10% coordinate grid overlay to an image.
# Useful for estimating normalized [x,y] coordinates from a topo photo.
# Usage: ./add-grid-overlay.sh <input.jpg|png> <output.jpg|png>

set -euo pipefail

input="${1:-}"
output="${2:-}"
if [[ -z "$input" || -z "$output" ]]; then
  echo "Usage: $0 <input> <output>" >&2
  exit 1
fi

W=$(identify -format '%w' "$input")
H=$(identify -format '%h' "$input")

args=("$input" -strokewidth 1 -stroke 'rgba(255,0,0,0.5)')

for i in $(seq 0 10); do
  x=$(awk "BEGIN{printf \"%.0f\", $i*$W/10}")
  y=$(awk "BEGIN{printf \"%.0f\", $i*$H/10}")
  args+=(-draw "line $x,0 $x,$H")
  args+=(-draw "line 0,$y $W,$y")
done

args+=(-pointsize 14 -fill 'rgba(255,0,0,0.9)' -stroke none)

for i in $(seq 0 10); do
  x=$(awk "BEGIN{printf \"%.0f\", $i*$W/10}")
  y=$(awk "BEGIN{printf \"%.0f\", $i*$H/10}")
  args+=(-draw "text $x,15 'x$i'")
  args+=(-draw "text 5,$y 'y$i'")
done

args+=("$output")
convert "${args[@]}"
echo "Grid overlay written to $output"
