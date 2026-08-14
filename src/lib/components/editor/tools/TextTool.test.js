// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { TextTool } from './TextTool.svelte.js';

function setup(labels = []) {
	const topo = { textLabels: labels };
	let selected = labels[0]?.id || null;
	const createTextLabel = vi.fn((point, values) => {
		const id = 'text-new';
		topo.textLabels.push({ id, position2D: [point.x, point.y], ...values });
		selected = id;
		return id;
	});
	const updateTextLabel = vi.fn((id, changes) =>
		Object.assign(
			topo.textLabels.find((label) => label.id === id),
			changes
		)
	);
	const removeTextLabel = vi.fn((id) => {
		topo.textLabels = topo.textLabels.filter((label) => label.id !== id);
	});
	const tool = new TextTool({
		topo,
		selectObject: (_type, id) => (selected = id),
		selectedId: () => selected,
		createTextLabel,
		updateTextLabel,
		removeTextLabel
	});
	return { tool, topo, createTextLabel, updateTextLabel, removeTextLabel };
}

describe('TextTool', () => {
	it('creates a multiline label only after a nonblank draft is committed', () => {
		const { tool, topo, createTextLabel } = setup();
		tool.beginCreate({ x: 0.25, y: 0.4 });
		tool.setValue('Main Wall\nSouth Face');
		tool.commitEdit();

		expect(createTextLabel).toHaveBeenCalledWith(
			{ x: 0.25, y: 0.4 },
			expect.objectContaining({
				text: 'Main Wall\nSouth Face',
				fontSize2D: 24,
				fontWeight: 600,
				textAlign2D: 'center'
			})
		);
		expect(topo.textLabels).toHaveLength(1);
	});

	it('cancels and ignores blank new drafts', () => {
		const { tool, createTextLabel } = setup();
		tool.beginCreate({ x: 0.2, y: 0.3 });
		tool.cancelEdit();
		tool.beginCreate({ x: 0.2, y: 0.3 });
		tool.setValue('   ');
		tool.commitEdit();
		expect(createTextLabel).not.toHaveBeenCalled();
	});

	it('edits text and styling and deletes an existing label when cleared', () => {
		const { tool, updateTextLabel, removeTextLabel } = setup([
			{ id: 'text-1', text: 'Old', position2D: [0.1, 0.2] }
		]);
		tool.beginEdit('text-1');
		tool.setValue('New');
		tool.format({ fontSize2D: 36, fontWeight: 700, textAlign2D: 'right' });
		tool.commitEdit();
		expect(updateTextLabel).toHaveBeenCalledWith(
			'text-1',
			expect.objectContaining({
				text: 'New',
				fontSize2D: 36,
				fontWeight: 700,
				textAlign2D: 'right'
			})
		);

		tool.beginEdit('text-1');
		tool.setValue('');
		tool.commitEdit();
		expect(removeTextLabel).toHaveBeenCalledWith('text-1');
	});
});
