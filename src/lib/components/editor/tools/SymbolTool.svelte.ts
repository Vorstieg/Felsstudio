import type { createTopo2DEditorState } from '$lib/state/topo-2d-editor-state.svelte.ts';
type Editor = ReturnType<typeof createTopo2DEditorState>;
type Point = { x: number; y: number };

export class SymbolTool {
	id = 'symbol';
	private readonly state: Editor;
	selectedType: string = 'bolt';

	constructor(editor: Editor) {
		this.state = editor;
	}

	onMouseDown(_event: Event, point: Point): void {
		this.state.createSymbol(point, this.selectedType);
	}

	onMouseMove(): void {}
	onMouseUp(): void {}
	onKeyDown(): void {}
	onActivate(): void {}
	onDeactivate(): void {}
}
