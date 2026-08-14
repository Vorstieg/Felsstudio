/** Owns object-level selection and drag interaction dispatch. */
export function createTopoObjectInteractionController({
	editor,
	canvasInput,
	createSelectionSnapshot
} = {}) {
	function selectAndStart(event, target) {
		if (editor.ui.activeTool !== 'select') return;
		event?.stopPropagation?.();
		const mouse = canvasInput.normalizeEvent(event)?.point;
		if (!mouse) return;

		const isTouch = event?.identifier != null;
		if (isTouch && editor.ui.mobileSelectionMode) {
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
		editor.startInteraction('move-selection', createSelectionSnapshot(mouse));
	}

	function objectMouseDown(event, target) {
		selectAndStart(event, target);
	}

	function textMouseDown(event, label) {
		if (editor.ui.activeTool !== 'select') return;
		event?.stopPropagation?.();
		const mouse = canvasInput.normalizeEvent(event)?.point;
		if (!mouse || !label.position2D) return;
		if (event?.identifier != null && editor.ui.mobileSelectionMode) {
			editor.selectObject('text', label.id, true);
			return;
		}
		if (!editor.isSelected('text', label.id)) {
			editor.selectObject('text', label.id, editor.ui.isShiftPressed);
		}
		editor.startInteraction('move-selection', createSelectionSnapshot(mouse));
	}

	function objectClick(event, type, id) {
		event?.stopPropagation?.();
		if (editor.ui.activeTool !== 'select') return;
		const { route, multipitch, outline } = editor.drafts;
		if (route.points.length || multipitch.points.length || outline.points.length) return;
		editor.selectObject(type, id, editor.ui.isShiftPressed);
	}

	return { objectMouseDown, textMouseDown, objectClick };
}
