import type { createTopo2DEditorState } from '$lib/state/topo-2d-editor-state.svelte.ts';

type Editor = ReturnType<typeof createTopo2DEditorState>;

export class SelectTool {
	id = 'select';
	private readonly state: Editor;

	constructor(editor: Editor) {
		this.state = editor;
	}

	onMouseDown(): void {
		// Topo2DEditor handles selection and deselection before tool actions.
	}

	onMouseMove(): void {}
	onMouseUp(): void {}
	onKeyDown(event: Pick<KeyboardEvent, 'key'>): void {
		if (event.key !== 'Delete' && event.key !== 'Backspace') return;
		const idToDelete = this.state.selectedId('symbol');
		if (idToDelete) this.state.deleteSymbols([idToDelete]);
	}
	onActivate(): void {}
	onDeactivate(): void {}
}
