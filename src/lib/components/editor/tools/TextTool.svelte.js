import { TEXT_LABEL_DEFAULTS } from '@vorstieg/topo-renderer';

export class TextTool {
	id = 'text';
	editingId = $state(null);
	editingValue = $state('');
	editingOriginalValue = $state('');
	editingPosition = $state(null);
	fontSize2D = $state(TEXT_LABEL_DEFAULTS.fontSize2D);
	color = $state(TEXT_LABEL_DEFAULTS.color);
	fontWeight = $state(TEXT_LABEL_DEFAULTS.fontWeight);
	textAlign2D = $state(TEXT_LABEL_DEFAULTS.textAlign2D);
	focusRequested = false;

	constructor({ context, state } = {}) {
		this.state = state;
		this.getTopo = context?.document?.getTopo || (() => state?.topo || {});
		this.selectObject = context?.selection?.selectObject || (() => {});
		this.selectedId = context?.selection?.selectedId || (() => null);
		this.createTextLabel = context?.commands?.createTextLabel;
		this.updateTextLabel = context?.commands?.updateTextLabel;
		this.removeTextLabel = context?.commands?.removeTextLabel;
	}

	onMouseDown(event, point) {
		event?.stopPropagation?.();
		this.beginCreate(point);
	}

	beginCreate(point) {
		this.editingId = null;
		this.editingValue = '';
		this.editingOriginalValue = '';
		this.editingPosition = [point.x, point.y];
		this.requestFocus();
		return true;
	}

	beginEdit(id) {
		const label = this.getLabel(id);
		if (!label) return false;
		this.editingId = id;
		this.editingValue = label.text || '';
		this.editingOriginalValue = label.text || '';
		this.editingPosition = [...label.position2D];
		this.fontSize2D = Number(label.fontSize2D ?? TEXT_LABEL_DEFAULTS.fontSize2D);
		this.color = label.color || TEXT_LABEL_DEFAULTS.color;
		this.fontWeight = label.fontWeight ?? TEXT_LABEL_DEFAULTS.fontWeight;
		this.textAlign2D = label.textAlign2D || TEXT_LABEL_DEFAULTS.textAlign2D;
		this.selectObject('text', id);
		this.requestFocus();
		return true;
	}

	setValue(value) {
		this.editingValue = value;
	}

	format(changes) {
		if (changes.fontSize2D != null) {
			this.fontSize2D = Math.min(72, Math.max(12, Number(changes.fontSize2D)));
		}
		if (changes.color) this.color = changes.color;
		if (changes.fontWeight != null) this.fontWeight = Number(changes.fontWeight);
		if (changes.textAlign2D) this.textAlign2D = changes.textAlign2D;

		if (!this.editingPosition) {
			const id = this.selectedId('text');
			if (id) this.updateTextLabel?.(id, this.currentStyle());
		}
	}

	commitEdit() {
		if (!this.editingPosition) return false;
		const text = this.editingValue.trim();
		const id = this.editingId;
		if (!text) {
			if (id) this.removeTextLabel?.(id);
			this.resetEdit();
			return Boolean(id);
		}

		if (id) {
			this.updateTextLabel?.(id, { text, ...this.currentStyle() });
		} else {
			this.createTextLabel?.(
				{ x: this.editingPosition[0], y: this.editingPosition[1] },
				{ text, ...this.currentStyle() }
			);
		}
		this.resetEdit();
		return true;
	}

	cancelEdit() {
		if (!this.editingPosition) return false;
		this.resetEdit();
		return true;
	}

	handleComposerKeyDown(event) {
		event.stopPropagation();
		if (event.key === 'Escape') {
			event.preventDefault();
			this.cancelEdit();
		} else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
			event.preventDefault();
			this.commitEdit();
		}
	}

	onKeyDown(event) {
		if (event.key !== 'Enter' || this.editingPosition) return false;
		const id = this.selectedId('text');
		if (!id) return false;
		event.preventDefault?.();
		this.beginEdit(id);
		return true;
	}

	currentStyle() {
		return {
			fontSize2D: this.fontSize2D,
			color: this.color,
			fontWeight: this.fontWeight,
			textAlign2D: this.textAlign2D
		};
	}

	getLabel(id) {
		return (this.getTopo().textLabels || []).find((label) => String(label.id) === String(id));
	}

	requestFocus() {
		this.focusRequested = true;
	}

	consumeFocusRequest() {
		if (!this.focusRequested) return false;
		this.focusRequested = false;
		return true;
	}

	resetEdit() {
		this.editingId = null;
		this.editingValue = '';
		this.editingOriginalValue = '';
		this.editingPosition = null;
		this.focusRequested = false;
	}

	onActivate() {}
	onDeactivate() {
		this.cancelEdit();
	}
	onMouseMove() {}
	onMouseUp() {}
}
