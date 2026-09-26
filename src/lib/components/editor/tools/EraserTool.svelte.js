export class EraserTool {
	id = 'eraser';

	constructor(editor) {
		this.state = editor;
	}

	onMouseDown(_event, point) {
		this.state.deleteSymbolAt(point);
	}

	onMouseMove() {}
	onMouseUp() {}
	onKeyDown() {}
	onActivate() {}
	onDeactivate() {}
}
