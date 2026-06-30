#!/usr/bin/env node
/**
 * Validate a Felsstudio topo JSON file.
 * Checks: JSON parse, coordinate ranges, route/pitch line styles, outline line styles.
 * Usage: node validate-topo.mjs <path/to/topo.json>
 */
import fs from 'fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node validate-topo.mjs <path/to/topo.json>');
  process.exit(1);
}

let topo;
try {
  topo = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (err) {
  console.error('JSON parse error:', err.message);
  process.exit(1);
}

let min = Infinity, max = -Infinity;
const scan = (v, key = '') => {
  if (key === 'labelOffset2D') return;
  if (Array.isArray(v)) {
    if (v.length >= 2 && typeof v[0] === 'number' && typeof v[1] === 'number') {
      min = Math.min(min, v[0], v[1]);
      max = Math.max(max, v[0], v[1]);
    } else {
      v.forEach((child) => scan(child));
    }
  } else if (v && typeof v === 'object') {
    for (const [childKey, child] of Object.entries(v)) scan(child, childKey);
  }
};
scan(topo);

const issues = [];
if (min < 0 || max > 1) {
  issues.push(`Coordinates out of 0..1 range: min=${min}, max=${max}`);
}

const validRouteTypes = ['sports-climbing', 'multi-pitch', 'bouldering', 'trad'];
for (const route of topo.routes || []) {
  if (!validRouteTypes.includes(route.type)) {
    issues.push(`Route "${route.id}" has invalid type "${route.type}"`);
  }
  if (!['red', 'redDashed'].includes(route.lineStyle)) {
    issues.push(`Route "${route.id}" has invalid lineStyle "${route.lineStyle}"`);
  }
  for (const pitch of route.pitches || []) {
    if (pitch.lineStyle && !['red', 'redDashed', ''].includes(pitch.lineStyle)) {
      issues.push(`Pitch "${pitch.id}" has invalid lineStyle "${pitch.lineStyle}"`);
    }
  }
}

const validOutlines = ['rock', 'approach', 'descent', 'variant', 'fixedRope'];
for (const outline of topo.outlines || []) {
  if (!validOutlines.includes(outline.lineStyle)) {
    issues.push(`Outline "${outline.id}" has invalid lineStyle "${outline.lineStyle}"`);
  }
}

if (issues.length === 0) {
  console.log(`✓ ${file} is valid (coords ${min}..${max})`);
  process.exit(0);
} else {
  console.error(`✗ ${file} has ${issues.length} issue(s):`);
  for (const issue of issues) console.error('  -', issue);
  process.exit(1);
}
