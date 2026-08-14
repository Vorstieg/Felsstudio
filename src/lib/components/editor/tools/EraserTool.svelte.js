export class EraserTool {
	id = 'eraser';

	constructor(editor) {
		this.state = editor;
	}

	onMouseDown(event, point) {
		this.state.deleteSymbolAt(point);
	}

	onMouseMove(event, point) {}
	onMouseUp(event, point) {}
	onKeyDown(event) {}
	onActivate() {}
	onDeactivate() {}
}
