import type { createTopo2DEditorState } from '$lib/state/topo-2d-editor-state.svelte.ts';
type Editor = ReturnType<typeof createTopo2DEditorState>;
type Point = { x: number; y: number };

export class EraserTool {
	id = 'eraser';
	private readonly state: Editor;

	constructor(editor: Editor) {
		this.state = editor;
	}

	onMouseDown(_event: Event, point: Point): void {
		this.state.deleteSymbolAt(point);
	}

	onMouseMove(): void {}
	onMouseUp(): void {}
	onKeyDown(): void {}
	onActivate(): void {}
	onDeactivate(): void {}
}
