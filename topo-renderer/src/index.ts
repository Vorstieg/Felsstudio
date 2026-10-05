import { select } from 'd3-selection';
import type {
	FelsTopoDocument,
	FixPoint,
	Outline,
	Pitch,
	Point2D,
	Route,
	TextLabel,
	Variant
} from '@vorstieg/fels-types/types';

export { fixpointSymbols, topoSymbols } from './symbols.js';

type CanvasSize = { baseWidth?: number; baseHeight?: number };
type RoutePath = Route | Pitch | Variant;
type SymbolMeta = { id: string; width?: number; height?: number; icon?: string };
type LineStyle = { stroke: string; width: number; dash: string | null };
type RenderTopoSvgOptions = {
	gElement: SVGGElement | null;
	topo?: Partial<FelsTopoDocument>;
	routes?: Route[];
	baseWidth: number;
	baseHeight: number;
	selectedRouteId?: string | number | null;
	hoveredRouteId?: string | number | null;
	onRouteSelect?: (route: Route) => void;
	onRouteHover?: (id: string | number | null) => void;
	getHitAreaSize?: (size: number) => number;
	symbols?: SymbolMeta[];
	symbolHref?: (type: string) => string;
};

export const TEXT_LABEL_DEFAULTS = Object.freeze({
	fontSize2D: 24,
	color: '#111827',
	fontWeight: 600,
	textAlign2D: 'center'
});

export function getTextLabelStyle(label: Partial<TextLabel> = {}) {
	const alignment = label.textAlign2D;
	const textAlign2D =
		alignment === 'left' || alignment === 'center' || alignment === 'right'
			? alignment
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

export function renderTextLabelLines(textSelection: any, label: TextLabel) {
	const lines = String(label?.text ?? '').split('\n');
	textSelection
		.selectAll('tspan')
		.data(lines)
		.join('tspan')
		.attr('x', 0)
		.attr('dy', (_: string, index: number) => (index === 0 ? 0 : '1.2em'))
		.text((line: string) => line);
}

export const ROUTE_LINE_STYLES = {
	red: { stroke: '#dc2626', width: 3, dash: null },
	redDashed: { stroke: '#dc2626', width: 3, dash: '18 12' },
	redDotted: { stroke: '#dc2626', width: 3, dash: '1 10' },
	variant: { stroke: '#8f8a84', width: 2, dash: '8 8' }
};

export const OUTLINE_LINE_STYLES = {
	rock: { stroke: '#000000', width: 1, dash: null },
	route: { ...ROUTE_LINE_STYLES.red },
	approach: { stroke: '#eab308', width: 2, dash: null },
	descent: { stroke: '#6b7280', width: 2, dash: '10 10' },
	variant: { stroke: '#8f8a84', width: 2, dash: '8 8' },
	fixedRope: { stroke: '#1d70b8', width: 2, dash: null }
};

export function getRouteLineStyle(styleId = 'red') {
	return (ROUTE_LINE_STYLES as Record<string, LineStyle>)[styleId] || ROUTE_LINE_STYLES.red;
}

export function getOutlineLineStyle(styleId = 'rock') {
	return (OUTLINE_LINE_STYLES as Record<string, LineStyle>)[styleId] || OUTLINE_LINE_STYLES.rock;
}

export function normalizeCanvasSize(canvasSize: CanvasSize = {}) {
	return {
		baseWidth: Math.max(canvasSize?.baseWidth || 1, 1),
		baseHeight: Math.max(canvasSize?.baseHeight || 1, 1)
	};
}

export function normalizedToSvgPoint([x, y]: Point2D, canvasSize: CanvasSize = {}): Point2D {
	const { baseWidth, baseHeight } = normalizeCanvasSize(canvasSize);
	return [x * baseWidth, y * baseHeight];
}

export function svgToNormalizedPoint([x, y]: Point2D, canvasSize: CanvasSize = {}): Point2D {
	const { baseWidth, baseHeight } = normalizeCanvasSize(canvasSize);
	return [x / baseWidth, y / baseHeight];
}

export function pointsToSvg(points: Point2D[] = [], canvasSize: CanvasSize = {}) {
	const { baseWidth, baseHeight } = normalizeCanvasSize(canvasSize);
	return points.map((point) => `${point[0] * baseWidth},${point[1] * baseHeight}`).join(' ');
}

/**
 * Turns normalized vertices into a Catmull-Rom-derived cubic Bézier SVG path.
 * It is a rendering-only conversion and leaves the supplied vertices intact.
 */
export function pointsToSmoothSvgPath(
	points: Point2D[] = [],
	{
		closed = false,
		tension = 0.45,
		baseWidth = 1,
		baseHeight = 1
	}: CanvasSize & {
		closed?: boolean;
		tension?: number;
	} = {}
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
	const svgVertices: Point2D[] = vertices.map(([x, y]) => [x * baseWidth, y * baseHeight]);
	const pointAt = (index: number): Point2D => {
		if (closed) return svgVertices[(index + svgVertices.length) % svgVertices.length];
		return svgVertices[Math.max(0, Math.min(index, svgVertices.length - 1))];
	};
	const format = ([x, y]: Point2D) => `${x},${y}`;
	let path = `M ${format(svgVertices[0])}`;
	const segmentCount = closed ? svgVertices.length : svgVertices.length - 1;
	for (let index = 0; index < segmentCount; index++) {
		const p0 = pointAt(index - 1);
		const p1 = pointAt(index);
		const p2 = pointAt(index + 1);
		const p3 = pointAt(index + 2);
		const controlScale = amount / 6;
		const c1: Point2D = [
			p1[0] + (p2[0] - p0[0]) * controlScale,
			p1[1] + (p2[1] - p0[1]) * controlScale
		];
		const c2: Point2D = [
			p2[0] - (p3[0] - p1[0]) * controlScale,
			p2[1] - (p3[1] - p1[1]) * controlScale
		];
		path += ` C ${format(c1)} ${format(c2)} ${format(p2)}`;
	}
	return closed ? `${path} Z` : path;
}

function rectanglePoints(
	start: Point2D | undefined,
	end: Point2D | undefined,
	shape: NonNullable<Outline['shape']>,
	size: Required<CanvasSize>
): Point2D[] {
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

function circlePoints(shape: NonNullable<Outline['shape']>, size: Required<CanvasSize>): Point2D[] {
	const { center2D, radius2D } = shape;
	if (!center2D || radius2D == null || !Number.isFinite(radius2D)) return [];
	const segments = shape.segments || 48;
	const radiusY = radius2D * (size.baseWidth / size.baseHeight);
	const points: Point2D[] = Array.from({ length: segments }, (_, index) => {
		const angle = (index / segments) * Math.PI * 2;
		return [center2D[0] + radius2D * Math.cos(angle), center2D[1] + radiusY * Math.sin(angle)];
	});
	return [...points, points[0]];
}

export function getOutlinePoints(
	outline: Outline | null | undefined,
	size: CanvasSize = {}
): Point2D[] {
	const normalizedSize = normalizeCanvasSize(size);
	const shape = outline?.shape;
	if (!shape?.type) return outline?.points2D || [];
	if (shape.type === 'rectangle')
		return rectanglePoints(shape.start2D, shape.end2D, shape, normalizedSize);
	if (shape.type === 'circle') return circlePoints(shape, normalizedSize);
	return outline?.points2D || [];
}

export function isClosedShape(points: Point2D[] = []) {
	if (points.length < 3) return false;
	const first = points[0];
	const last = points.at(-1);
	return first?.[0] === last?.[0] && first?.[1] === last?.[1];
}

export function getOutlineBounds(outline: Outline, canvasSize: CanvasSize = {}) {
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

function gradeLabel(grade: unknown) {
	const value = grade && typeof grade === 'object' && 'value' in grade ? grade.value : grade;
	return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

export function formatPitchLabel(pitch: object, pitchIndex: number) {
	const { pitchNumber, length, grade } = pitch as Partial<Pitch>;
	const number = pitchNumber || pitchIndex + 1;
	const details = [Number(length) > 0 ? `${length}m` : '', gradeLabel(grade)]
		.filter(Boolean)
		.join(' / ');
	return details ? `${number}.SL / ${details}` : `${number}.SL`;
}

export function formatVariantLabel(variant: object, variantIndex: number) {
	const { name: variantName, length, grade } = variant as Partial<Variant>;
	const details = [Number(length) > 0 ? `${length}m` : '', gradeLabel(grade)]
		.filter(Boolean)
		.join(' / ');
	const name =
		typeof variantName === 'string' && variantName ? variantName : `Variant ${variantIndex + 1}`;
	return details ? `${name} / ${details}` : name;
}

function isMultiPitch(route: Route) {
	return Array.isArray(route.type)
		? route.type.includes('multi-pitch')
		: route.type === 'multi-pitch';
}

/** Turns topo JSON into the individual lines rendered by a topo viewer. */
export function getRenderableRoutes(routes: Route[] = []) {
	return routes.flatMap((route, routeIndex) => {
		const makeLine = (item: RoutePath, kind: string, index: number, label: string | number) =>
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
}: RenderTopoSvgOptions) {
	if (!gElement) return;
	const size = { baseWidth, baseHeight };
	const mainG = select(gElement);
	const layer = (className: string) => {
		let result = mainG.select<SVGGElement>(`g.${className}`);
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
	const outlinePath = (outline: Outline) => {
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
	const outlineGroups = outlinesLayer
		.selectAll<SVGGElement, (typeof outlines)[number]>('g.outline-group')
		.data(outlines, (outline) => outline.key)
		.join('g')
		.attr('class', 'outline-group');
	outlineGroups.each(function (outline) {
		const points = getOutlinePoints(outline, size);
		const parts = [
			...(isClosedShape(points) ? ['background'] : []),
			...(outline.fillColor && points.length > 2 ? ['fill'] : []),
			'stroke'
		];
		const path = outlinePath(outline);
		const style = getOutlineLineStyle(outline.lineStyle);
		select(this)
			.selectAll<SVGPathElement, string>('path')
			.data(parts, (part) => part)
			.join('path')
			.attr('class', (part) =>
				part === 'background'
					? 'outline-background'
					: part === 'fill'
						? 'outline-fill'
						: 'rock-outline'
			)
			.attr('d', path)
			.attr('fill', (part) =>
				part === 'background' ? '#fff' : part === 'fill' ? (outline.fillColor ?? 'none') : 'none'
			)
			.attr('fill-opacity', (part) => (part === 'fill' ? (outline.fillOpacity ?? 0.3) : null))
			.attr('stroke', (part) => (part === 'stroke' ? style.stroke : 'none'))
			.attr('stroke-width', (part) => (part === 'stroke' ? style.width : null))
			.attr('stroke-dasharray', (part) => (part === 'stroke' ? style.dash : null))
			.attr('stroke-linecap', (part) => (part === 'stroke' ? 'round' : null))
			.attr('stroke-linejoin', (part) => (part === 'stroke' ? 'round' : null))
			.attr('pointer-events', (part) => (part === 'stroke' ? null : 'none'));
	});

	const lines = getRenderableRoutes(routes).map((line) => ({
		...line,
		points: pointsToSvg(line.points2D, size),
		path: line.curve?.enabled
			? pointsToSmoothSvgPath(line.points2D, { tension: line.curve.tension, ...size })
			: null
	}));
	const groups = routesLayer
		.selectAll<SVGGElement, (typeof lines)[number]>('g.route-group')
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

	const positionedSymbols = (topo.fixPoints || []).filter(
		(symbol): symbol is FixPoint & { position2D: Point2D } => Boolean(symbol.position2D)
	);
	symbolsLayer
		.selectAll<SVGGElement, (typeof positionedSymbols)[number]>('g.symbol-group')
		.data(positionedSymbols, (symbol, index) => symbol.id ?? index)
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

	const positionedLabels = (topo.textLabels || []).filter(
		(label): label is TextLabel & { position2D: Point2D } => Boolean(label.position2D)
	);
	const textGroups = textLayer
		.selectAll<SVGGElement, (typeof positionedLabels)[number]>('g.text-label-group')
		.data(positionedLabels, (label, index) => label.id ?? index)
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
