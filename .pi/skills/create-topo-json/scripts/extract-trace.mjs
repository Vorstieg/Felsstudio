#!/usr/bin/env node
/**
 * Extract normalized polylines and text labels from an SVG trace/preview.
 * Output is a JSON object with image size, all polylines grouped by stroke,
 * and text labels with normalized positions.
 *
 * Usage: node extract-trace.mjs <path/to/preview.svg>
 */
import fs from 'fs';

const file = process.argv[2];
if (!file) {
	console.error('Usage: node extract-trace.mjs <path/to/preview.svg>');
	process.exit(1);
}

const svg = fs.readFileSync(file, 'utf8');

function parseViewBoxOrSize() {
	const viewBoxMatch = svg.match(
		/viewBox=["']\s*([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s*["']/
	);
	if (viewBoxMatch) {
		return { width: Number(viewBoxMatch[3]), height: Number(viewBoxMatch[4]) };
	}
	const widthMatch = svg.match(/width=["']([\d.]+)["']/);
	const heightMatch = svg.match(/height=["']([\d.]+)["']/);
	if (widthMatch && heightMatch) {
		return { width: Number(widthMatch[1]), height: Number(heightMatch[1]) };
	}
	console.error('Could not determine SVG width/height or viewBox');
	process.exit(1);
}

const { width, height } = parseViewBoxOrSize();

function normPoints(ptsStr) {
	return ptsStr
		.trim()
		.split(/\s+/)
		.map((pair) => {
			const [x, y] = pair.split(',').map(Number);
			return [Number((x / width).toFixed(4)), Number((y / height).toFixed(4))];
		});
}

const polylines = [];
let m;
const polyRe = /<polyline[^>]*points=["']([^"']+)["'][^>]*>/g;
while ((m = polyRe.exec(svg)) !== null) {
	const tag = m[0];
	const strokeMatch = tag.match(/stroke=["']#?([0-9a-fA-F]+)["']/);
	const dashMatch = tag.match(/stroke-dasharray=["']([^"']*)["']/);
	const widthMatch = tag.match(/stroke-width=["']([\d.]+)["']/);
	polylines.push({
		stroke: strokeMatch ? `#${strokeMatch[1].toLowerCase()}` : null,
		dash: dashMatch ? dashMatch[1] : '',
		width: widthMatch ? Number(widthMatch[1]) : null,
		points: normPoints(m[1])
	});
}

const texts = [];
const textRe = /<text[^>]*x=["']([\d.]+)["'][^>]*y=["']([\d.]+)["'][^>]*>([^<]+)<\/text>/g;
while ((m = textRe.exec(svg)) !== null) {
	texts.push({
		x: Number((Number(m[1]) / width).toFixed(4)),
		y: Number((Number(m[2]) / height).toFixed(4)),
		text: m[3].trim()
	});
}

const result = {
	source: file,
	width,
	height,
	aspectRatio: Number((width / height).toFixed(4)),
	polylines,
	texts
};

console.log(JSON.stringify(result, null, 2));
