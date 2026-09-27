import { TEXT_LABEL_DEFAULTS } from '@vorstieg/topo-renderer';
import type { TextLabel } from '@vorstieg/fels-types/types';
import type { createTopo2DEditorState } from '$lib/state/topo-2d-editor-state.svelte.ts';

type Editor = ReturnType<typeof createTopo2DEditorState>;
type Point = { x: number; y: number };
type TextLabelStyle = Pick<TextLabel, 'fontSize2D' | 'color' | 'fontWeight' | 'textAlign2D'>;
type TextStyleChanges = Partial<TextLabelStyle>;
type TextAlignment = NonNullable<TextLabel['textAlign2D']>;

export class TextTool {
	id = 'text';
	editingId = $state<string | number | null>(null);
	editingValue = $state('');
	editingOriginalValue = $state('');
	editingPosition = $state<[number, number] | null>(null);
	fontSize2D = $state<number>(TEXT_LABEL_DEFAULTS.fontSize2D);
	color = $state<string>(TEXT_LABEL_DEFAULTS.color);
	fontWeight = $state<number>(TEXT_LABEL_DEFAULTS.fontWeight);
	textAlign2D = $state<TextAlignment>(TEXT_LABEL_DEFAULTS.textAlign2D);
	focusRequested = false;

	private readonly getTopo: () => Editor['topo'];
	private readonly selectObject: Editor['selectObject'];
	private readonly selectedId: Editor['selectedId'];
	private readonly createTextLabel: Editor['createTextLabel'];
	private readonly updateTextLabel: Editor['updateTextLabel'];
	private readonly removeTextLabel: Editor['removeTextLabel'];

	constructor(editor: Editor) {
		this.getTopo = () => editor.topo;
		this.selectObject = editor.selectObject;
		this.selectedId = editor.selectedId;
		this.createTextLabel = editor.createTextLabel;
		this.updateTextLabel = editor.updateTextLabel;
		this.removeTextLabel = editor.removeTextLabel;
	}

	onMouseDown(event: Pick<Event, 'stopPropagation'> | null | undefined, point: Point): void {
		event?.stopPropagation();
		this.beginCreate(point);
	}

	beginCreate(point: Point): true {
		this.editingId = null;
		this.editingValue = '';
		this.editingOriginalValue = '';
		this.editingPosition = [point.x, point.y];
		this.requestFocus();
		return true;
	}

	beginEdit(id: string | number): boolean {
		const label = this.getLabel(id);
		if (!label?.position2D) return false;
		this.editingId = id;
		this.editingValue = label.text || '';
		this.editingOriginalValue = label.text || '';
		this.editingPosition = [label.position2D[0], label.position2D[1]];
		this.fontSize2D = Number(label.fontSize2D ?? TEXT_LABEL_DEFAULTS.fontSize2D);
		this.color = label.color || TEXT_LABEL_DEFAULTS.color;
		this.fontWeight = Number(label.fontWeight ?? TEXT_LABEL_DEFAULTS.fontWeight);
		this.textAlign2D = label.textAlign2D || TEXT_LABEL_DEFAULTS.textAlign2D;
		this.selectObject('text', id);
		this.requestFocus();
		return true;
	}

	setValue(value: string): void {
		this.editingValue = value;
	}

	format(changes: TextStyleChanges): void {
		if (changes.fontSize2D != null) {
			this.fontSize2D = Math.min(72, Math.max(12, Number(changes.fontSize2D)));
		}
		if (changes.color) this.color = changes.color;
		if (changes.fontWeight != null) this.fontWeight = Number(changes.fontWeight);
		if (changes.textAlign2D) this.textAlign2D = changes.textAlign2D;

		if (!this.editingPosition) {
			const id = this.selectedId('text');
			if (id) this.updateTextLabel(id, this.currentStyle());
		}
	}

	commitEdit(): boolean {
		if (!this.editingPosition) return false;
		const text = this.editingValue.trim();
		const id = this.editingId;
		if (!text) {
			if (id) this.removeTextLabel(id);
			this.resetEdit();
			return Boolean(id);
		}

		if (id) {
			this.updateTextLabel(id, { text, ...this.currentStyle() });
		} else {
			this.createTextLabel(
				{ x: this.editingPosition[0], y: this.editingPosition[1] },
				{ text, ...this.currentStyle() }
			);
		}
		this.resetEdit();
		return true;
	}

	cancelEdit(): boolean {
		if (!this.editingPosition) return false;
		this.resetEdit();
		return true;
	}

	handleComposerKeyDown(event: KeyboardEvent): void {
		event.stopPropagation();
		if (event.key === 'Escape') {
			event.preventDefault();
			this.cancelEdit();
		} else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
			event.preventDefault();
			this.commitEdit();
		}
	}

	onKeyDown(event: KeyboardEvent): boolean {
		if (event.key !== 'Enter' || this.editingPosition) return false;
		const id = this.selectedId('text');
		if (!id) return false;
		event.preventDefault();
		this.beginEdit(id);
		return true;
	}

	currentStyle(): TextLabelStyle {
		return {
			fontSize2D: this.fontSize2D,
			color: this.color,
			fontWeight: this.fontWeight,
			textAlign2D: this.textAlign2D
		};
	}

	getLabel(id: string | number): TextLabel | undefined {
		return this.getTopo().textLabels.find((label) => String(label.id) === String(id));
	}

	requestFocus(): void {
		this.focusRequested = true;
	}

	consumeFocusRequest(): boolean {
		if (!this.focusRequested) return false;
		this.focusRequested = false;
		return true;
	}

	resetEdit(): void {
		this.editingId = null;
		this.editingValue = '';
		this.editingOriginalValue = '';
		this.editingPosition = null;
		this.focusRequested = false;
	}

	onActivate(): void {}
	onDeactivate(): void {
		this.cancelEdit();
	}
	onMouseMove(): void {}
	onMouseUp(): void {}
}
