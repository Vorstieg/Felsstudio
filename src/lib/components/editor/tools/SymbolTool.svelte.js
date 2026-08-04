import { generateSymbolId } from '$lib/assets/js/id-utils.js';

export class SymbolTool {
	id = 'symbol';
	// No state needed for symbol tool currently as it places on click

	constructor({ state, saveHistory } = {}) {
		this.state = state;
		this.saveHistory = saveHistory || (() => {});
	}

	selectedType = 'bolt';

	onMouseDown(event, point) {
		const symbolId = generateSymbolId();
		this.state.topo.fixPoints.push({
			id: symbolId,
			type: this.selectedType,
			position2D: [point.x, point.y],
			rotation2D: 0,
			scale2D: 1,
			// Independent multipliers allow a symbol to be stretched without
			// changing the meaning of the legacy, proportional scale2D value.
			scaleX2D: 1,
			scaleY2D: 1
		});
		this.saveHistory();
	}

	onMouseMove(event, point) {}
	onMouseUp(event, point) {}
	onKeyDown(event) {}
	onActivate() {}
	onDeactivate() {}
}
