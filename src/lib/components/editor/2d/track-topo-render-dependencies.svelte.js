import { getOutlinePoints } from '$lib/assets/js/outline-geometry.js';

/**
 * Reads every nested value that the imperative renderer consumes. Svelte's
 * effect tracking then invalidates the render when an editor object is
 * mutated in place.
 */
export function trackTopoRenderDependencies({
	topo,
	currentRoutePoints,
	currentOutlinePoints,
	brushPreview,
	baseWidth,
	baseHeight
}) {
	for (const route of topo.routes) {
		route.lineStyle;
		if (route.labelOffset2D) (route.labelOffset2D[0], route.labelOffset2D[1]);
		for (const point of route.points2D || []) (point[0], point[1]);
		for (const pitch of route.pitches || []) {
			pitch.lineStyle;
			pitch.grade;
			pitch.length;
			pitch.pitchNumber;
			if (pitch.labelOffset2D) (pitch.labelOffset2D[0], pitch.labelOffset2D[1]);
			for (const point of pitch.points2D || []) (point[0], point[1]);
		}
		for (const variant of route.variants || []) {
			variant.name;
			variant.lineStyle;
			variant.grade;
			variant.length;
			if (variant.labelOffset2D) (variant.labelOffset2D[0], variant.labelOffset2D[1]);
			for (const point of variant.points2D || []) (point[0], point[1]);
		}
	}
	for (const outline of topo.outlines) {
		outline.lineStyle;
		outline.fillColor;
		outline.fillOpacity;
		outline.closed;
		outline.shape?.type;
		outline.shape?.radius2D;
		outline.shape?.fromCenter;
		outline.shape?.square;
		for (const point of getOutlinePoints(outline, { baseWidth, baseHeight })) (point[0], point[1]);
	}
	for (const symbol of topo.fixPoints) {
		if (symbol.position2D) {
			symbol.position2D[0];
			symbol.position2D[1];
			symbol.rotation2D;
			symbol.scale2D;
			symbol.scaleX2D;
			symbol.scaleY2D;
		}
	}
	for (const label of topo.textLabels || []) {
		label.text;
		label.fontSize2D;
		label.color;
		label.fontWeight;
		label.textAlign2D;
		if (label.position2D) (label.position2D[0], label.position2D[1]);
	}
	for (const point of currentRoutePoints) (point[0], point[1]);
	for (const point of currentOutlinePoints) (point[0], point[1]);
	for (const point of brushPreview?.points || []) (point[0], point[1]);
	for (const point of brushPreview?.contourPoints || []) (point[0], point[1]);
}
