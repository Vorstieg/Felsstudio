import { select } from 'd3-selection';

/** Renders text labels, selection bounds, and the inline editing input. */
export function renderTextLabelsLayer({
	layers,
	topo,
	activeTool,
	baseWidth,
	baseHeight,
	editingTextLabelId,
	editingTextValue,
	editingTextNeedsFocus,
	isSelected,
	canvasInput,
	onTextMouseDown: handleTextMouseDown,
	onBeginTextEdit: beginTextEdit,
	onTextEditKeyDown: handleTextEditKeyDown,
	onTextValueChange,
	onCommitTextEdit: commitTextEdit,
	onTextFocusHandled
}) {
	const textLayer = layers.text;
	const textLabels = topo.textLabels || [];
	const textSelection = textLayer.selectAll('g.text-label-group').data(textLabels, (d) => d.id);

const textGroups = textSelection
	.join(
		(enter) =>
			enter
				.append('g')
				.attr('class', 'text-label-group cursor-move')
				.style('touch-action', 'none')
				.on('mousedown', (e, d) => handleTextMouseDown(e, d))
				.on('touchstart', (e, d) => {
					if (e.touches.length === 1) {
						e.preventDefault();
						e.stopPropagation();
						canvasInput.trackTouch(e.touches[0]);
						handleTextMouseDown(e.touches[0], d);
					}
				})
				.on('dblclick', (e, d) => {
					e.stopPropagation();
					beginTextEdit(d.id);
				}),
		(update) => update,
		(exit) => exit.remove()
	)
	.attr(
		'transform',
		(d) =>
			`translate(${(d.position2D?.[0] || 0) * baseWidth}, ${(d.position2D?.[1] || 0) * baseHeight}) rotate(${d.rotation2D || 0})`
	)
	.style('pointer-events', activeTool !== 'select' && activeTool !== 'eraser' ? 'none' : 'auto');

textGroups
	.selectAll('text.text-label')
	.data((d) => [d])
	.join(
		(enter) =>
			enter
				.append('text')
				.attr('class', 'text-label')
				.attr('dominant-baseline', 'middle')
				.attr('text-anchor', 'middle')
				.style('user-select', 'none'),
		(update) => update,
		(exit) => exit.remove()
	)
	.attr('font-size', (d) => (d.fontSize2D || 0.025) * baseHeight)
	.attr('font-weight', (d) => d.fontWeight || 700)
	.attr('fill', (d) => d.color || '#23201d')
	.text((d) => d.text || '');

	const editingTextLabel = textLabels.find(
	(label) => label.id === editingTextLabelId
);

const textEditors = textLayer
	.selectAll('foreignObject.text-editor')
	.data(editingTextLabel ? [editingTextLabel] : [], (d) => d.id);

const textEditorObjects = textEditors
	.join(
		(enter) => {
			const editor = enter
				.append('foreignObject')
				.attr('class', 'text-editor')
				.style('overflow', 'visible')
				.style('pointer-events', 'all');

			editor
				.append('xhtml:input')
				.attr('type', 'text')
				.attr('class', 'text-editor-input')
				.style('width', '100%')
				.style('height', '100%')
				.style('box-sizing', 'border-box')
				.style('border', '1px solid #3b82f6')
				.style('border-radius', '2px')
				.style('background', 'rgba(255, 255, 255, 0.96)')
				.style('color', '#23201d')
				.style('font', 'inherit')
				.style('font-weight', '700')
				.style('line-height', '1')
				.style('outline', 'none')
				.style('padding', '2px 5px')
				.style('text-align', 'center')
				.on('mousedown', (event) => event.stopPropagation())
				.on('click', (event) => event.stopPropagation())
				.on('dblclick', (event) => event.stopPropagation())
				.on('touchstart', (event) => event.stopPropagation())
				.on('keydown', handleTextEditKeyDown)
				.on('input', (event) => {
							onTextValueChange(event.currentTarget.value);
				})
				.on('blur', commitTextEdit);

			return editor;
		},
		(update) => update,
		(exit) => exit.remove()
	)
	.attr(
		'transform',
		(d) =>
			`translate(${(d.position2D?.[0] || 0) * baseWidth}, ${(d.position2D?.[1] || 0) * baseHeight}) rotate(${d.rotation2D || 0})`
	)
	.attr('x', (d) => {
		const fontSize = (d.fontSize2D || 0.025) * baseHeight;
		const width = Math.max(120, (editingTextValue.length || 4) * fontSize * 0.75);
		return -width / 2;
	})
	.attr('y', (d) => -((d.fontSize2D || 0.025) * baseHeight) * 0.9)
	.attr('width', (d) => {
		const fontSize = (d.fontSize2D || 0.025) * baseHeight;
		return Math.max(120, (editingTextValue.length || 4) * fontSize * 0.75);
	})
	.attr('height', (d) => Math.max(28, (d.fontSize2D || 0.025) * baseHeight * 1.8));

textEditorObjects
	.select('input.text-editor-input')
	.property('value', editingTextValue)
	.style('font-size', (d) => `${Math.max(14, (d.fontSize2D || 0.025) * baseHeight)}px`)
	.style('font-weight', (d) => d.fontWeight || 700)
	.style('color', (d) => d.color || '#23201d')
	.each(function () {
		if (!editingTextNeedsFocus) return;
		requestAnimationFrame(() => {
			this.focus();
			this.select();
		});
				onTextFocusHandled();
	});

textGroups.each(function (label) {
	const group = select(this);
	const selected = isSelected('text', label.id);
	group
		.selectAll('rect.text-selection')
		.data(selected ? [label] : [])
		.join(
			(enter) =>
				enter
					.append('rect')
					.attr('class', 'text-selection')
					.attr('fill', 'none')
					.attr('stroke', '#3b82f6')
					.attr('stroke-width', 1)
					.attr('stroke-dasharray', '2,2'),
			(update) => update,
			(exit) => exit.remove()
		)
		.each(function () {
			const textNode = group.select('text.text-label').node();
			if (!textNode) return;
			const box = textNode.getBBox();
			select(this)
				.attr('x', box.x - 4)
				.attr('y', box.y - 2)
				.attr('width', box.width + 8)
				.attr('height', box.height + 4);
		});
});
}
