#!/usr/bin/env node
/**
 * Render a minimal layout SVG from a Felsstudio topo JSON.
 * Routes are drawn in red, outlines by their lineStyle. Text labels are omitted.
 * Useful for comparing route layout against a source trace.
 *
 * Usage: node preview-layout.mjs <path/to/topo.json> [output.svg]
 */
import fs from 'fs';

const input = process.argv[2];
const output = process.argv[3] || 'preview-layout.svg';
if (!input) {
  console.error('Usage: node preview-layout.mjs <path/to/topo.json> [output.svg]');
  process.exit(1);
}

const topo = JSON.parse(fs.readFileSync(input, 'utf8'));
const W = 1088;
const H = Math.round(W / (topo.imageAspectRatio || 1.5));

function pt(p) {
  return `${(p[0] * W).toFixed(1)},${(p[1] * H).toFixed(1)}`;
}

function routePoints(route) {
  if (route.type === 'multi-pitch' && route.pitches) {
    return route.pitches.map((p) => p.points2D).filter(Boolean);
  }
  return [route.points2D].filter(Boolean);
}

const outlineStyles = {
  rock: { stroke: '#746b61', dash: '' },
  approach: { stroke: '#308447', dash: '8 7' },
  descent: { stroke: '#6b7280', dash: '10 10' },
  variant: { stroke: '#d71920', dash: '10 8' },
  fixedRope: { stroke: '#7c3aed', dash: '4 4' }
};

let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n`;
svg += `<rect width="${W}" height="${H}" fill="#f7f1e8"/>\n`;

for (const o of topo.outlines || []) {
  const style = outlineStyles[o.lineStyle] || outlineStyles.rock;
  const pts = o.points2D.map(pt).join(' ');
  const dashAttr = style.dash ? `stroke-dasharray="${style.dash}"` : '';
  svg += `<polyline points="${pts}" fill="none" stroke="${style.stroke}" stroke-width="3" ${dashAttr} stroke-linecap="round" stroke-linejoin="round"/>\n`;
}

for (const r of topo.routes || []) {
  const dashAttr = r.lineStyle === 'redDashed' ? 'stroke-dasharray="10 8"' : '';
  for (const pts of routePoints(r)) {
    svg += `<polyline points="${pts.map(pt).join(' ')}" fill="none" stroke="#d71920" stroke-width="4" ${dashAttr} stroke-linecap="round" stroke-linejoin="round"/>\n`;
  }
}

svg += `</svg>`;
fs.writeFileSync(output, svg);
console.log(`Layout preview written to ${output}`);
