import { select } from 'd3-selection';

export { fixpointSymbols, topoSymbols } from './symbols.js';

export const TEXT_LABEL_DEFAULTS = Object.freeze({
	fontSize2D: 24,
	color: '#111827',
	fontWeight: 600,
	textAlign2D: 'center'
});

export function getTextLabelStyle(label = {}) {
	const textAlign2D = ['left', 'center', 'right'].includes(label.textAlign2D)
		? label.textAlign2D
		: TEXT_LABEL_DEFAULTS.textAlign2D;
	return {
		fontSize2D: Number.isFinite(Number(label.fontSize2D))
			? Number(label.fontSize2D)
			: TEXT_LABEL_DEFAULTS.fontSize2D,
		color: label.color || TEXT_LABEL_DEFAULTS.color,
		fontWeight: label.fontWeight ?? TEXT_LABEL_DEFAULTS.fontWeight,
		textAlign2D,
		textAnchor: { left: 'start', center: 'middle', right: 'end' }[textAlign2D]
	};
}

export function renderTextLabelLines(textSelection, label) {
	const lines = String(label?.text ?? '').split('\n');
	textSelection
		.selectAll('tspan')
		.data(lines)
		.join('tspan')
		.attr('x', 0)
		.attr('dy', (_, index) => (index === 0 ? 0 : '1.2em'))
		.text((line) => line);
}

export const ROUTE_LINE_STYLES = {
	red: { stroke: '#dc2626', width: 4, dash: null },
	redDashed: { stroke: '#dc2626', width: 4, dash: '18 12' },
	redDotted: { stroke: '#dc2626', width: 4, dash: '1 10' },
	variant: { stroke: '#8f8a84', width: 3, dash: '8 8' }
};

export const OUTLINE_LINE_STYLES = {
	rock: { stroke: '#000000', width: 3, dash: null },
	approach: { stroke: '#eab308', width: 4, dash: null },
	descent: { stroke: '#6b7280', width: 3, dash: '10 10' },
	variant: { stroke: '#8f8a84', width: 3, dash: '8 8' },
	fixedRope: { stroke: '#1d70b8', width: 5, dash: null }
};

export function getRouteLineStyle(styleId = 'red') {
	return ROUTE_LINE_STYLES[styleId] || ROUTE_LINE_STYLES.red;
}

export function getOutlineLineStyle(styleId = 'rock') {
	return OUTLINE_LINE_STYLES[styleId] || OUTLINE_LINE_STYLES.rock;
}

export function normalizeCanvasSize(canvasSize = {}) {
	return {
		baseWidth: Math.max(canvasSize?.baseWidth || 1, 1),
		baseHeight: Math.max(canvasSize?.baseHeight || 1, 1)
	};
}

export function normalizedToSvgPoint([x, y], canvasSize = {}) {
	const { baseWidth, baseHeight } = normalizeCanvasSize(canvasSize);
	return [x * baseWidth, y * baseHeight];
}

export function svgToNormalizedPoint([x, y], canvasSize = {}) {
	const { baseWidth, baseHeight } = normalizeCanvasSize(canvasSize);
	return [x / baseWidth, y / baseHeight];
}

export function pointsToSvg(points = [], canvasSize = {}) {
	const { baseWidth, baseHeight } = normalizeCanvasSize(canvasSize);
	return points.map((point) => `${point[0] * baseWidth},${point[1] * baseHeight}`).join(' ');
}

/**
 * Turns normalized vertices into a Catmull-Rom-derived cubic Bézier SVG path.
 * It is a rendering-only conversion and leaves the supplied vertices intact.
 */
export function pointsToSmoothSvgPath(
	points = [],
	{ closed = false, tension = 0.45, baseWidth = 1, baseHeight = 1 } = {}
) {
	if (!Array.isArray(points) || points.length < 3) return null;
	const hasRepeatedClosingPoint =
		points[0]?.[0] === points.at(-1)?.[0] && points[0]?.[1] === points.at(-1)?.[1];
	const vertices = closed && hasRepeatedClosingPoint ? points.slice(0, -1) : points;
	if (vertices.length < 3) return null;
	const amount = Math.min(
		1,
		Math.max(0, Number.isFinite(Number(tension)) ? Number(tension) : 0.45)
	);
	const svgVertices = vertices.map(([x, y]) => [x * baseWidth, y * baseHeight]);
	const pointAt = (index) => {
		if (closed) return svgVertices[(index + svgVertices.length) % svgVertices.length];
		return svgVertices[Math.max(0, Math.min(index, svgVertices.length - 1))];
	};
	const format = ([x, y]) => `${x},${y}`;
	let path = `M ${format(svgVertices[0])}`;
	const segmentCount = closed ? svgVertices.length : svgVertices.length - 1;
	for (let index = 0; index < segmentCount; index++) {
		const p0 = pointAt(index - 1);
		const p1 = pointAt(index);
		const p2 = pointAt(index + 1);
		const p3 = pointAt(index + 2);
		const controlScale = amount / 6;
		const c1 = [p1[0] + (p2[0] - p0[0]) * controlScale, p1[1] + (p2[1] - p0[1]) * controlScale];
		const c2 = [p2[0] - (p3[0] - p1[0]) * controlScale, p2[1] - (p3[1] - p1[1]) * controlScale];
		path += ` C ${format(c1)} ${format(c2)} ${format(p2)}`;
	}
	return closed ? `${path} Z` : path;
}

function rectanglePoints(start, end, shape, size) {
	if (!start || !end) return [];
	let [x1, y1] = start;
	let [x2, y2] = end;
	if (shape.fromCenter) {
		let dx = x2 - x1;
		let dy = y2 - y1;
		if (shape.square) {
			const length = Math.max(Math.abs(dx) * size.baseWidth, Math.abs(dy) * size.baseHeight);
			dx = Math.sign(dx || 1) * (length / size.baseWidth);
			dy = Math.sign(dy || 1) * (length / size.baseHeight);
		}
		x2 = x1 + dx;
		y2 = y1 + dy;
		x1 -= dx;
		y1 -= dy;
	} else if (shape.square) {
		const length = Math.max(
			Math.abs(x2 - x1) * size.baseWidth,
			Math.abs(y2 - y1) * size.baseHeight
		);
		x2 = x1 + Math.sign(x2 - x1 || 1) * (length / size.baseWidth);
		y2 = y1 + Math.sign(y2 - y1 || 1) * (length / size.baseHeight);
	}
	const minX = Math.min(x1, x2);
	const maxX = Math.max(x1, x2);
	const minY = Math.min(y1, y2);
	const maxY = Math.max(y1, y2);
	return [
		[minX, minY],
		[maxX, minY],
		[maxX, maxY],
		[minX, maxY],
		[minX, minY]
	];
}

function circlePoints(shape, size) {
	if (!shape.center2D || !Number.isFinite(shape.radius2D)) return [];
	const segments = shape.segments || 48;
	const radiusY = shape.radius2D * (size.baseWidth / size.baseHeight);
	const points = Array.from({ length: segments }, (_, index) => {
		const angle = (index / segments) * Math.PI * 2;
		return [
			shape.center2D[0] + shape.radius2D * Math.cos(angle),
			shape.center2D[1] + radiusY * Math.sin(angle)
		];
	});
	return [...points, points[0]];
}

export function getOutlinePoints(outline, size) {
	size = normalizeCanvasSize(size);
	const shape = outline?.shape;
	if (!shape?.type) return outline?.points2D || [];
	if (shape.type === 'rectangle') return rectanglePoints(shape.start2D, shape.end2D, shape, size);
	if (shape.type === 'circle') return circlePoints(shape, size);
	return shape.points2D || outline?.points2D || [];
}

export function isClosedShape(points = []) {
	if (points.length < 3) return false;
	const first = points[0];
	const last = points.at(-1);
	return first?.[0] === last?.[0] && first?.[1] === last?.[1];
}

export function getOutlineBounds(outline, canvasSize = {}) {
	const points = getOutlinePoints(outline, canvasSize);
	if (!points.length) return null;
	const xs = points.map((point) => point[0]);
	const ys = points.map((point) => point[1]);
	return {
		minX: Math.min(...xs),
		maxX: Math.max(...xs),
		minY: Math.min(...ys),
		maxY: Math.max(...ys)
	};
}

export function formatPitchLabel(pitch, pitchIndex) {
	const number = pitch.pitchNumber || pitchIndex + 1;
	const details = [Number(pitch.length) > 0 ? `${pitch.length}m` : '', pitch.grade || '']
		.filter(Boolean)
		.join(' / ');
	return details ? `${number}.SL / ${details}` : `${number}.SL`;
}

export function formatVariantLabel(variant, variantIndex) {
	const details = [Number(variant.length) > 0 ? `${variant.length}m` : '', variant.grade || '']
		.filter(Boolean)
		.join(' / ');
	const name = variant.name || `Variant ${variantIndex + 1}`;
	return details ? `${name} / ${details}` : name;
}

function isMultiPitch(route) {
	return Array.isArray(route.type)
		? route.type.includes('multi-pitch')
		: route.type === 'multi-pitch';
}

/** Turns topo JSON into the individual lines rendered by a topo viewer. */
export function getRenderableRoutes(routes = []) {
	return routes.flatMap((route, routeIndex) => {
		const makeLine = (item, kind, index, label) =>
			item?.points2D?.length
				? [
						{
							id: route.id,
							key: `${route.id}-${kind}-${item.id || index}`,
							kind,
							points2D: item.points2D,
							label,
							lineStyle: item.lineStyle || route.lineStyle,
							curve: item.curve || route.curve,
							labelOffset2D: item.labelOffset2D,
							route,
							item
						}
					]
				: [];

		if (!isMultiPitch(route)) return makeLine(route, 'main', routeIndex, routeIndex + 1);
		return [
			...(route.pitches || []).flatMap((pitch, index) =>
				makeLine(pitch, 'pitch', index, formatPitchLabel(pitch, index))
			),
			...(route.variants || []).flatMap((variant, index) =>
				makeLine(variant, 'variant', index, formatVariantLabel(variant, index))
			)
		];
	});
}

export function renderTopoSvg({
	gElement,
	topo = {},
	routes = [],
	baseWidth,
	baseHeight,
	selectedRouteId = null,
	hoveredRouteId = null,
	onRouteSelect = () => {},
	onRouteHover = () => {},
	getHitAreaSize = (size) => size,
	symbols = [],
	symbolHref = (type) => `/icons/topo-symbols/${type}.svg`
}) {
	if (!gElement) return;
	const size = { baseWidth, baseHeight };
	const mainG = select(gElement);
	const layer = (className) => {
		let result = mainG.select(`g.${className}`);
		if (result.empty()) result = mainG.append('g').attr('class', className);
		return result;
	};
	const background = layer('background-layer');
	const outlinesLayer = layer('outlines-layer');
	const routesLayer = layer('routes-layer');
	const symbolsLayer = layer('symbols-layer');
	const textLayer = layer('text-layer');

	background
		.selectAll('image.bg-image')
		.data(topo.image2D ? [topo.image2D] : [])
		.join(
			(enter) => enter.append('image').attr('class', 'bg-image'),
			(update) => update,
			(exit) => exit.remove()
		)
		.attr('href', (image) => image)
		.attr('width', baseWidth)
		.attr('height', baseHeight)
		.attr('preserveAspectRatio', `xMidYMid ${topo.backgroundFit === 'cover' ? 'slice' : 'meet'}`);

	const outlines = (topo.outlines || []).map((outline, index) => ({
		...outline,
		key: outline.id || index
	}));
	const outlinePath = (outline) => {
		const points = getOutlinePoints(outline, size);
		const closed = isClosedShape(points);
		const curvedPath = outline.curve?.enabled
			? pointsToSmoothSvgPath(points, { closed, tension: outline.curve.tension, ...size })
			: null;
		if (curvedPath) return curvedPath;
		const straightPoints = pointsToSvg(points, size);
		return straightPoints
			? `M ${straightPoints.replaceAll(' ', ' L ')}${closed ? ' Z' : ''}`
			: null;
	};
	outlinesLayer
		.selectAll('path.outline-fill')
		.data(
			outlines.filter((outline) => outline.fillColor && getOutlinePoints(outline, size).length > 2),
			(outline) => outline.key
		)
		.join('path')
		.attr('class', 'outline-fill')
		.attr('d', outlinePath)
		.attr('fill', (outline) => outline.fillColor)
		.attr('fill-opacity', (outline) => outline.fillOpacity ?? 0.3);
	outlinesLayer
		.selectAll('path.rock-outline')
		.data(outlines, (outline) => outline.key)
		.join('path')
		.attr('class', 'rock-outline')
		.attr('fill', 'none')
		.attr('d', outlinePath)
		.attr('stroke', (outline) => getOutlineLineStyle(outline.lineStyle).stroke)
		.attr('stroke-width', (outline) => getOutlineLineStyle(outline.lineStyle).width)
		.attr('stroke-dasharray', (outline) => getOutlineLineStyle(outline.lineStyle).dash)
		.attr('stroke-linecap', 'round')
		.attr('stroke-linejoin', 'round');

	const lines = getRenderableRoutes(routes).map((line) => ({
		...line,
		points: pointsToSvg(line.points2D, size),
		path: line.curve?.enabled
			? pointsToSmoothSvgPath(line.points2D, { tension: line.curve.tension, ...size })
			: null
	}));
	const groups = routesLayer
		.selectAll('g.route-group')
		.data(lines, (line) => line.key)
		.join((enter) => {
			const group = enter.append('g').attr('class', 'route-group');
			group.append('path').attr('class', 'hit-area');
			group.append('path').attr('class', 'visible-line');
			group.append('text').attr('class', 'route-label');
			return group;
		});
	groups.each(function (line) {
		const group = select(this);
		const highlighted = line.id === selectedRouteId || line.id === hoveredRouteId;
		const style = getRouteLineStyle(
			line.lineStyle || (line.kind === 'variant' ? 'variant' : 'red')
		);
		group
			.on('click', (event) => {
				event.stopPropagation();
				onRouteSelect(line.route);
			})
			.on('mouseenter', () => onRouteHover(line.id))
			.on('mouseleave', () => onRouteHover(null));
		group
			.select('.hit-area')
			.attr('d', line.path || `M ${line.points.replaceAll(' ', ' L ')}`)
			.attr('fill', 'none')
			.attr('stroke', 'transparent')
			.attr('stroke-width', getHitAreaSize(7))
			.attr('stroke-linecap', 'round')
			.attr('stroke-linejoin', 'round');
		group
			.select('.visible-line')
			.attr('d', line.path || `M ${line.points.replaceAll(' ', ' L ')}`)
			.attr('fill', 'none')
			.attr('stroke', highlighted ? '#3b82f6' : style.stroke)
			.attr('stroke-width', highlighted ? style.width + 2 : style.width)
			.attr('stroke-dasharray', style.dash)
			.attr('stroke-linecap', 'round')
			.attr('stroke-linejoin', 'round');
		const offset = line.labelOffset2D || [0, 10 / baseHeight];
		group
			.select('.route-label')
			.attr('x', (line.points2D[0][0] + offset[0]) * baseWidth)
			.attr('y', (line.points2D[0][1] + offset[1]) * baseHeight)
			.attr('font-size', 20)
			.attr('font-weight', 'bold')
			.attr('text-anchor', 'middle')
			.attr('fill', highlighted ? '#3b82f6' : style.stroke)
			.text(line.label);
	});

	symbolsLayer
		.selectAll('g.symbol-group')
		.data(
			(topo.fixPoints || []).filter((symbol) => symbol.position2D),
			(symbol) => symbol.id
		)
		.join((enter) => {
			const group = enter.append('g').attr('class', 'symbol-group');
			group.append('image');
			return group;
		})
		.attr('transform', (symbol) => {
			const scale = symbol.scale2D || 1;
			return `translate(${symbol.position2D[0] * baseWidth}, ${symbol.position2D[1] * baseHeight}) rotate(${symbol.rotation2D || 0}) scale(${scale * (symbol.scaleX2D || 1)}, ${scale * (symbol.scaleY2D || 1)})`;
		})
		.each(function (symbol) {
			const meta = symbols.find((candidate) => candidate.id === symbol.type);
			const width = meta?.width || 24;
			select(this)
				.select('image')
				.attr('width', width)
				.attr('height', meta?.height || width)
				.attr('x', -width / 2)
				.attr('y', -(meta?.height || width) / 2)
				.attr('href', meta?.icon || symbolHref(symbol.type));
		});

	const textGroups = textLayer
		.selectAll('g.text-label-group')
		.data(
			(topo.textLabels || []).filter((label) => label.position2D),
			(label) => label.id
		)
		.join('g')
		.attr('class', 'text-label-group')
		.attr(
			'transform',
			(label) =>
				`translate(${label.position2D[0] * baseWidth}, ${label.position2D[1] * baseHeight})`
		);

	textGroups.each(function (label) {
		const style = getTextLabelStyle(label);
		const text = select(this)
			.selectAll('text.text-label')
			.data([label])
			.join('text')
			.attr('class', 'text-label')
			.attr('font-size', style.fontSize2D)
			.attr('font-weight', style.fontWeight)
			.attr('text-anchor', style.textAnchor)
			.attr('fill', style.color)
			.attr('stroke', 'rgba(255,255,255,0.9)')
			.attr('stroke-width', 3)
			.attr('stroke-linejoin', 'round')
			.attr('paint-order', 'stroke fill');
		renderTextLabelLines(text, label);
	});
}
