import { describe, expect, it } from 'vitest';
import { createTopo2DEditorFacade } from './create-topo-2d-editor-facade.svelte.js';

describe('createTopo2DEditorFacade', () => {
	it('exposes selection, commands, clipboard, and history as one editor surface', () => {
		const topo = { routes: [], fixPoints: [], outlines: [], textLabels: [] };
		const ui = {};
		const editor = createTopo2DEditorFacade({ getTopo: () => topo, ui, restore: () => {} });

		const id = editor.commands.createTextLabel({ x: 0.1, y: 0.2 });

		expect(editor.selectedId('text')).toBe(id);
		expect(editor.selectedItems).toEqual(new Set([`text:${id}`]));
		expect(editor.history).toBeDefined();
		expect(editor.clipboard).toBeDefined();
	});
});
