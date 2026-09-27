import type { TextLabel } from '@vorstieg/fels-types/types';
import type {
	InteractionId,
	InteractionPoint,
	SelectionSnapshot
} from '$lib/state/topo-2d-editor-interactions.ts';
import type { createTopo2DEditorState } from '$lib/state/topo-2d-editor-state.svelte.ts';
import type { CanvasInput } from './create-canvas-input.svelte.ts';

export type ObjectInteractionEvent = Event | Touch;

export type ObjectInteractionTarget =
	| {
			type: 'route';
			id: InteractionId;
			pitchId?: InteractionId | null;
			variantId?: InteractionId | null;
	  }
	| { type: 'outline' | 'symbol' | 'text'; id: InteractionId };

type ObjectInteractionControllerOptions = {
	editor: Pick<
		ReturnType<typeof createTopo2DEditorState>,
		| 'ui'
		| 'drafts'
		| 'isSelected'
		| 'selectObject'
		| 'selectPath'
		| 'setDrawingTarget'
		| 'startInteraction'
	>;
	canvasInput: CanvasInput;
	createSelectionSnapshot: (point: InteractionPoint) => SelectionSnapshot;
};

/** Owns object-level selection and drag interaction dispatch. */
export function createTopoObjectInteractionController({
	editor,
	canvasInput,
	createSelectionSnapshot
}: ObjectInteractionControllerOptions) {
	function stopPropagation(event: ObjectInteractionEvent) {
		if ('stopPropagation' in event) event.stopPropagation();
	}

	function isTouchEvent(event: ObjectInteractionEvent): event is Touch {
		return 'identifier' in event;
	}

	function normalizeEvent(event: ObjectInteractionEvent) {
		return isTouchEvent(event)
			? canvasInput.normalizeEvent(event)
			: canvasInput.normalizeEvent(event);
	}

	function selectAndStart(event: ObjectInteractionEvent, target: ObjectInteractionTarget) {
		if (editor.ui.activeTool !== 'select') return;
		stopPropagation(event);
		const mouse = normalizeEvent(event)?.point;
		if (!mouse) return;

		if (isTouchEvent(event) && editor.ui.mobileSelectionMode) {
			editor.selectObject(target.type, target.id, true);
			return;
		}
		if (!editor.isSelected(target.type, target.id)) {
			editor.selectObject(target.type, target.id, editor.ui.isShiftPressed);
		}
		if (target.type === 'route') {
			if (target.pitchId) editor.selectPath('pitch', target.id, target.pitchId);
			else if (target.variantId) editor.selectPath('variant', target.id, target.variantId);
			editor.setDrawingTarget(
				target.pitchId
					? { type: 'pitch', routeId: target.id, pitchId: target.pitchId }
					: target.variantId
						? { type: 'variant', routeId: target.id, variantId: target.variantId }
						: null
			);
		}
		editor.startInteraction({ kind: 'move-selection', ...createSelectionSnapshot(mouse) });
	}

	function objectMouseDown(event: ObjectInteractionEvent, target: ObjectInteractionTarget) {
		selectAndStart(event, target);
	}

	function textMouseDown(event: ObjectInteractionEvent, label: TextLabel) {
		if (editor.ui.activeTool !== 'select') return;
		stopPropagation(event);
		const mouse = normalizeEvent(event)?.point;
		if (!mouse || !label.position2D) return;
		if (isTouchEvent(event) && editor.ui.mobileSelectionMode) {
			editor.selectObject('text', label.id, true);
			return;
		}
		if (!editor.isSelected('text', label.id)) {
			editor.selectObject('text', label.id, editor.ui.isShiftPressed);
		}
		editor.startInteraction({ kind: 'move-selection', ...createSelectionSnapshot(mouse) });
	}

	function objectClick(event: Event, type: ObjectInteractionTarget['type'], id: InteractionId) {
		event.stopPropagation();
		if (editor.ui.activeTool !== 'select') return;
		const { route, multipitch, outline } = editor.drafts;
		if (route.points.length || multipitch.points.length || outline.points.length) return;
		editor.selectObject(type, id, editor.ui.isShiftPressed);
	}

	return { objectMouseDown, textMouseDown, objectClick };
}
