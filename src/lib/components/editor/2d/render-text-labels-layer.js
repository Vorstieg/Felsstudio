import { select } from 'd3-selection';
import {
	getTextLabelStyle,
	renderTextLabelLines,
	TEXT_LABEL_DEFAULTS
} from '@vorstieg/topo-renderer';

function labelBounds(label) {
	const style = getTextLabelStyle(label);
	const lines = String(label.text || '').split('\n');
	const width = Math.max(
		style.fontSize2D,
		...lines.map((line) => line.length * style.fontSize2D * 0.62)
	);
	const height = Math.max(1, lines.length) * style.fontSize2D * 1.2;
	const x = style.textAlign2D === 'left' ? 0 : style.textAlign2D === 'right' ? -width : -width / 2;
	return { x, y: -style.fontSize2D * 0.85, width, height };
}

/** Renders multiline annotations, deterministic hit regions, selection bounds, and the composer. */
export function renderTextLabelsLayer({
	layers,
	topo,
	activeTool,
	baseWidth,
	baseHeight,
	isSelected,
	canvasInput,
	textTool,
	onTextMouseDown
}) {
	const labels = topo.textLabels || [];
	const groups = layers.text
		.selectAll('g.text-label-group')
		.data(labels, (label) => label.id)
		.join('g')
		.attr('class', 'text-label-group cursor-move')
		.attr('data-testid', (label) => `topo-object-text-${label.id}`)
		.attr(
			'transform',
			(label) =>
				`translate(${(label.position2D?.[0] || 0) * baseWidth}, ${(label.position2D?.[1] || 0) * baseHeight})`
		)
		.style('touch-action', 'none')
		.style('pointer-events', ['select', 'text', 'eraser'].includes(activeTool) ? 'auto' : 'none')
		.on('mousedown', (event, label) => {
			if (activeTool === 'text') {
				event.stopPropagation();
				textTool?.beginEdit(label.id);
			} else onTextMouseDown?.(event, label);
		})
		.on('touchstart', (event, label) => {
			if (event.touches.length !== 1) return;
			event.preventDefault();
			event.stopPropagation();
			canvasInput?.trackTouch(event.touches[0]);
			if (activeTool === 'text') textTool?.beginEdit(label.id);
			else onTextMouseDown?.(event.touches[0], label);
		})
		.on('dblclick', (event, label) => {
			if (!['select', 'text'].includes(activeTool)) return;
			event.stopPropagation();
			textTool?.beginEdit(label.id);
		});

	groups.each(function (label) {
		const group = select(this);
		const style = getTextLabelStyle(label);
		const bounds = labelBounds(label);
		group
			.selectAll('rect.text-hit-region')
			.data([label])
			.join('rect')
			.attr('class', 'text-hit-region')
			.attr('x', bounds.x - 6)
			.attr('y', bounds.y - 4)
			.attr('width', Math.max(24, bounds.width + 12))
			.attr('height', Math.max(24, bounds.height + 8))
			.attr('fill', 'transparent');

		const text = group
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
			.attr('paint-order', 'stroke fill')
			.style('pointer-events', 'none')
			.style('user-select', 'none');
		renderTextLabelLines(text, label);

		group
			.selectAll('rect.text-selection')
			.data(isSelected?.('text', label.id) ? [label] : [])
			.join('rect')
			.attr('class', 'text-selection')
			.attr('x', bounds.x - 5)
			.attr('y', bounds.y - 3)
			.attr('width', bounds.width + 10)
			.attr('height', bounds.height + 6)
			.attr('fill', 'none')
			.attr('stroke', '#2563eb')
			.attr('stroke-width', 2)
			.style('pointer-events', 'none');
	});

	const editing = textTool?.editingPosition
		? [
				{
					id: textTool.editingId || 'new',
					position2D: textTool.editingPosition,
					fontSize2D: textTool.fontSize2D,
					color: textTool.color,
					fontWeight: textTool.fontWeight,
					textAlign2D: textTool.textAlign2D
				}
			]
		: [];
	const editors = layers.text
		.selectAll('foreignObject.text-composer')
		.data(editing, (draft) => draft.id)
		.join((enter) => {
			const foreignObject = enter.append('foreignObject').attr('class', 'text-composer');
			foreignObject
				.append('xhtml:textarea')
				.attr('data-testid', 'text-label-composer')
				.style('box-sizing', 'border-box')
				.style('width', '100%')
				.style('height', '100%')
				.style('resize', 'none')
				.style('border', '2px solid #2563eb')
				.style('border-radius', '3px')
				.style('background', 'rgba(255,255,255,0.96)')
				.style('padding', '4px')
				.style('outline', 'none')
				.on('mousedown touchstart click dblclick', (event) => event.stopPropagation())
				.on('input', (event) => textTool?.setValue(event.currentTarget.value))
				.on('keydown', (event) => textTool?.handleComposerKeyDown(event))
				.on('blur', () => textTool?.commitEdit());
			return foreignObject;
		});

	editors
		.attr('x', (draft) => {
			const width = Math.max(
				160,
				String(textTool.editingValue || '')
					.split('\n')
					.reduce((max, line) => Math.max(max, line.length), 0) *
					draft.fontSize2D *
					0.62 +
					24
			);
			return draft.textAlign2D === 'left' ? 0 : draft.textAlign2D === 'right' ? -width : -width / 2;
		})
		.attr('y', (draft) => -draft.fontSize2D)
		.attr('width', (draft) =>
			Math.max(
				160,
				String(textTool.editingValue || '')
					.split('\n')
					.reduce((max, line) => Math.max(max, line.length), 0) *
					draft.fontSize2D *
					0.62 +
					24
			)
		)
		.attr('height', (draft) =>
			Math.max(
				64,
				String(textTool.editingValue || '').split('\n').length * draft.fontSize2D * 1.2 + 16
			)
		)
		.attr(
			'transform',
			(draft) =>
				`translate(${draft.position2D[0] * baseWidth}, ${draft.position2D[1] * baseHeight})`
		)
		.style('overflow', 'visible');

	editors
		.select('textarea')
		.property('value', textTool?.editingValue || '')
		.style('font-size', (draft) => `${draft.fontSize2D || TEXT_LABEL_DEFAULTS.fontSize2D}px`)
		.style('font-weight', (draft) => draft.fontWeight)
		.style('color', (draft) => draft.color)
		.style('text-align', (draft) => draft.textAlign2D)
		.each(function () {
			if (!textTool?.consumeFocusRequest?.()) return;
			requestAnimationFrame(() => {
				this.focus();
				this.select();
			});
		});
}
