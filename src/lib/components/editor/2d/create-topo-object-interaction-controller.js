/** Owns object-level selection and drag interaction dispatch. */
export function createTopoObjectInteractionController({
	getActiveTool,
	normalizeEvent,
	getMobileSelectionMode,
	getIsShiftPressed,
	getDraftState,
	selection,
	createSelectionSnapshot,
	setDrawingTarget
} = {}) {
	function selectAndStart(event, target) {
		if (getActiveTool() !== 'select') return;
		event?.stopPropagation?.();
		const mouse = normalizeEvent(event)?.point;
		if (!mouse) return;

		const isTouch = event?.identifier != null;
		if (isTouch && getMobileSelectionMode()) {
			selection.selectObject(target.type, target.id, true);
			return;
		}
		if (!selection.isSelected(target.type, target.id)) {
			selection.selectObject(target.type, target.id, getIsShiftPressed());
		}
		if (target.type === 'route') {
			if (target.pitchId && selection.selectPath) selection.selectPath('pitch', target.id, target.pitchId);
			else if (target.variantId && selection.selectPath) selection.selectPath('variant', target.id, target.variantId);
			setDrawingTarget(
				target.pitchId
					? { type: 'pitch', routeId: target.id, pitchId: target.pitchId }
					: target.variantId
						? { type: 'variant', routeId: target.id, variantId: target.variantId }
						: null
			);
		}
		selection.startInteraction('move-selection', createSelectionSnapshot(mouse));
	}

	function objectMouseDown(event, target) {
		selectAndStart(event, target);
	}

	function textMouseDown(event, label) {
		if (getActiveTool() !== 'select') return;
		event?.stopPropagation?.();
		const mouse = normalizeEvent(event)?.point;
		if (!mouse || !label.position2D) return;
		if (event?.identifier != null && getMobileSelectionMode()) {
			selection.selectObject('text', label.id, true);
			return;
		}
		if (!selection.isSelected('text', label.id)) {
			selection.selectObject('text', label.id, getIsShiftPressed());
		}
		selection.startInteraction('move-selection', createSelectionSnapshot(mouse));
	}

	function objectClick(event, type, id) {
		event?.stopPropagation?.();
		if (getActiveTool() !== 'select') return;
		const draft = getDraftState();
		if (draft.routePoints > 0 || draft.outlinePoints > 0) return;
		selection.selectObject(type, id, getIsShiftPressed());
	}

	function routeLabelMouseDown(event, target) {
		event?.stopPropagation?.();
		selection.startInteraction('move-route-label', target);
	}

	return { objectMouseDown, textMouseDown, objectClick, routeLabelMouseDown };
}
