import { getOutlinePoints } from '$lib/assets/js/outline-geometry.js';

export function createSelectionRegion(start, end) {
	return {
		start,
		end,
		left: Math.min(start.x, end.x),
		right: Math.max(start.x, end.x),
		top: Math.min(start.y, end.y),
		bottom: Math.max(start.y, end.y),
		containsOnly: end.x >= start.x
	};
}

const isInside = (point, region) =>
	point[0] >= region.left &&
	point[0] <= region.right &&
	point[1] >= region.top &&
	point[1] <= region.bottom;

function segmentsIntersect(a, b, c, d) {
	const cross = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
	const abC = cross(a, b, c);
	const abD = cross(a, b, d);
	const cdA = cross(c, d, a);
	const cdB = cross(c, d, b);
	return abC * abD <= 0 && cdA * cdB <= 0;
}

function touchesRegion(points, region) {
	if (points.some((point) => isInside(point, region))) return true;
	const corners = [
		[region.left, region.top],
		[region.right, region.top],
		[region.right, region.bottom],
		[region.left, region.bottom]
	];
	return points.some((point, index) => {
		if (!index) return false;
		return corners.some((corner, cornerIndex) =>
			segmentsIntersect(
				point,
				points[index - 1],
				corner,
				corners[(cornerIndex + 1) % corners.length]
			)
		);
	});
}

function matchesPath(points, region) {
	if (!points?.length) return false;
	return region.containsOnly
		? points.every((point) => isInside(point, region))
		: touchesRegion(points, region);
}

export function getRegionSelection(topo, region, canvasSize) {
	const selected = [];
	const add = (type, id) => selected.push({ type, id });

	topo.routes.forEach((route) => {
		const paths = [
			route.points2D,
			...(route.pitches || []).map((pitch) => pitch.points2D),
			...(route.variants || []).map((variant) => variant.points2D)
		];
		if (paths.some((points) => matchesPath(points, region))) add('route', route.id);
	});
	topo.outlines.forEach((outline) => {
		if (matchesPath(getOutlinePoints(outline, canvasSize), region)) add('outline', outline.id);
	});
	topo.fixPoints.forEach((symbol) => {
		if (symbol.position2D && isInside(symbol.position2D, region)) add('symbol', symbol.id);
	});
	(topo.textLabels || []).forEach((label) => {
		if (label.position2D && isInside(label.position2D, region)) add('text', label.id);
	});
	return selected;
}
