import { select } from 'd3-selection';
import { getOutlineLineStyle } from '@vorstieg/topo-renderer';
import {
	getOutlinePoints,
	isClosedShape,
	pointsToSmoothSvgPath,
	pointsToSvg
} from '$lib/assets/js/outline-geometry.ts';
import { getHitAreaSize } from '$lib/assets/js/mobile-utils.ts';
import type { OutlineRecord } from '$lib/assets/js/outline-geometry.ts';
import type { TopoRenderContext } from './topo-render-context.ts';

type OutlineLayerInput = Pick<
	TopoRenderContext,
	| 'layers'
	| 'topo'
	| 'renderModel'
	| 'activeTool'
	| 'baseWidth'
	| 'baseHeight'
	| 'canvasInput'
	| 'editTools'
	| 'hideControlPoints'
	| 'isSelected'
	| 'onObjectMouseDown'
	| 'onObjectClick'
>;

/** Renders persisted outlines and their editable vertices. */
export function renderOutlinesLayer({
	layers,
	topo,
	renderModel,
	activeTool,
	baseWidth,
	baseHeight,
	canvasInput,
	editTools,
	hideControlPoints,
	isSelected,
	onObjectMouseDown: handleObjectMouseDown,
	onObjectClick: handleObjectClick
}: OutlineLayerInput): void {
	const outlineEditTool = editTools?.outline;
	const outlinesLayer = layers.outlines;
	const outlines = topo.outlines;
	const canInteract =
		activeTool === 'select' || activeTool === 'eraser' || activeTool === outlineEditTool?.id;
	const handleOutlineDown = (event: MouseEvent, outline: OutlineRecord) => {
		if (['select', 'eraser', outlineEditTool?.id].includes(activeTool)) {
			outlineEditTool?.handleOutlineDown(event, outline, canvasInput);
		} else {
			handleObjectMouseDown(event, { type: 'outline', id: outline.id });
		}
	};
	const handleOutlineTouch = (event: TouchEvent, outline: OutlineRecord) => {
		if (['select', 'eraser', outlineEditTool?.id].includes(activeTool)) {
			outlineEditTool?.handleTouchOutlineDown(event, outline, canvasInput);
		} else if (event.touches.length === 1) {
			event.preventDefault();
			event.stopPropagation();
			canvasInput.trackTouch(event.touches[0]);
			handleObjectMouseDown(event.touches[0], { type: 'outline', id: outline.id });
		}
	};
	const getOutlinePath = (outline: OutlineRecord) => {
		const points = getOutlinePoints(outline, { baseWidth, baseHeight });
		const closed = isClosedShape(points);
		const curvedPath = outline.curve?.enabled
			? pointsToSmoothSvgPath(points, {
					closed,
					tension: outline.curve.tension,
					baseWidth,
					baseHeight
				})
			: null;
		if (curvedPath) return curvedPath;
		const straightPoints = pointsToSvg(points, { baseWidth, baseHeight });
		return straightPoints
			? `M ${straightPoints.replaceAll(' ', ' L ')}${closed ? ' Z' : ''}`
			: null;
	};
	// Remove flat paths left by the previous renderer during an in-place update.
	// They would otherwise remain above the grouped outlines and hide their borders.
	outlinesLayer
		.selectAll<SVGPathElement, unknown>('path')
		.filter(function () {
			return this.parentNode === outlinesLayer.node();
		})
		.remove();

	const groups = outlinesLayer
		.selectAll<SVGGElement, OutlineRecord>('g.outline-group')
		.data(outlines, (outline) => outline.id)
		.join('g')
		.attr('class', 'outline-group');
	groups.each(function (outline) {
		const points = getOutlinePoints(outline, { baseWidth, baseHeight });
		const parts = [
			...(isClosedShape(points) ? ['background'] : []),
			...(outline.fillColor && points.length > 2 ? ['fill'] : []),
			'stroke',
			'hit'
		];
		const path = getOutlinePath(outline);
		const style = getOutlineLineStyle(outline.lineStyle);
		const selected = isSelected('outline', outline.id);
		const paths = select(this)
			.selectAll<SVGPathElement, string>('path')
			.data(parts, (part) => part)
			.join('path')
			.attr('class', (part) =>
				part === 'background'
					? 'outline-background'
					: part === 'fill'
						? 'outline-fill'
						: part === 'stroke'
							? 'cursor-move rock-outline'
							: 'outline-hit-area hit-area cursor-pointer'
			)
			.attr('d', path)
			.attr('fill', (part) =>
				part === 'background' ? '#fff' : part === 'fill' ? outline.fillColor || 'none' : 'none'
			)
			.attr('fill-opacity', (part) => (part === 'fill' ? (outline.fillOpacity ?? 0.3) : null))
			.attr('stroke', (part) =>
				part === 'stroke'
					? selected
						? '#3b82f6'
						: style.stroke
					: part === 'hit'
						? 'transparent'
						: 'none'
			)
			.attr('stroke-width', (part) =>
				part === 'stroke'
					? style.width + (selected ? 1 : 0)
					: part === 'hit'
						? getHitAreaSize(8)
						: null
			)
			.attr('stroke-dasharray', (part) => (part === 'stroke' ? style.dash : null))
			.attr('stroke-linecap', (part) => (part === 'stroke' ? 'round' : null))
			.attr('stroke-linejoin', (part) => (part === 'stroke' ? 'round' : null))
			.attr('data-testid', (part) =>
				part === 'stroke' || part === 'hit' ? `topo-object-outline-${outline.id}` : null
			)
			.style('pointer-events', (part) => (part === 'hit' && canInteract ? 'auto' : 'none'));
		paths
			.filter((part) => part === 'hit')
			.on('mousedown', (event) => handleOutlineDown(event, outline))
			.on('touchstart', (event) => handleOutlineTouch(event, outline))
			.on('click', (event) => handleObjectClick(event, 'outline', outline.id));
	});

	outlineEditTool?.render({
		layers,
		renderModel,
		baseWidth,
		baseHeight,
		canvasInput,
		hideControlPoints
	});
}
