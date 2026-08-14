import {
	createSelectionRegion,
	getRegionSelection,
	getRoutePointRegionSelection
} from './selection-geometry.js';

const EDIT_TOOLS = new Set(['symbolEdit', 'routeEdit', 'outlineEdit']);

/** Owns the normalized pointer lifecycle and editing interactions for the 2D editor. */
export function createTopoInputController({
	editor,
	getCurrentTool,
	textTool,
	getCanvasSize,
	getEditablePath,
	snapRoutePoint,
	referenceFixpoint,
	editTools
} = {}) {
	function down(input) {
		if (!input || (input.button !== 0 && !input.isTouch)) return;
		const { point, sourceEvent: event } = input;
		if (textTool?.editingPosition) {
			textTool.commitEdit();
			event.stopPropagation?.();
			return;
		}

		if (EDIT_TOOLS.has(editor.ui.activeTool)) {
			editor.clearSelection();
			editor.setDrawingTarget(null);
			editor.setActiveTool('select');
			return;
		}

		if (editor.ui.activeTool === 'select') {
			editor.startInteraction('selection-region', {
				start: point,
				end: point,
				mode:
					input.isTouch && editor.ui.mobileSelectionMode
						? 'add'
						: event.altKey
							? 'subtract'
							: input.shiftKey
								? 'add'
								: 'replace'
			});
			return;
		}

		getCurrentTool()?.onMouseDown?.(event, point);
	}

	function move(input) {
		if (!input) return;
		const { point: mouse, sourceEvent: event } = input;
		getCurrentTool()?.onMouseMove?.(event, mouse);

		const interaction = editor.interaction;
		if (!interaction) return;

		if (interaction.kind === 'selection-region') {
			interaction.end = mouse;
			return;
		}

		if (interaction.kind === 'move-selection') {
			const deltaX = mouse.x - interaction.startMouse.x;
			const deltaY = mouse.y - interaction.startMouse.y;
			editor.mutateDocument(() => {
				interaction.items.paths.forEach(({ target, snapshot }) => {
					getEditablePath?.(target)?.translateFrom(snapshot, [deltaX, deltaY]);
				});
				interaction.items.symbols.forEach(({ symbolId, startPos }) => {
					const symbol = editor.topo.fixPoints.find((item) => item.id === symbolId);
					if (symbol) symbol.position2D = [startPos[0] + deltaX, startPos[1] + deltaY];
				});
				interaction.items.texts?.forEach(({ textId, startPos }) => {
					const label = (editor.topo.textLabels || []).find((item) => item.id === textId);
					if (label) label.position2D = [startPos[0] + deltaX, startPos[1] + deltaY];
				});
			});
			return;
		}

		if (interaction.kind === 'move-point') {
			const gridSnappedRoutePoint = editTools?.route?.snapPoint(mouse);
			const snapped = interaction.outlineId
				? { point: editTools?.outline?.snapPoint(mouse) || mouse, anchorId: null }
				: gridSnappedRoutePoint
					? { point: gridSnappedRoutePoint, anchorId: null }
					: snapRoutePoint(mouse);
			const route = interaction.routeId
				? editor.topo.routes.find(
						(candidate) => String(candidate.id) === String(interaction.routeId)
					)
				: null;
			editor.mutateDocument(() => {
				if (route) referenceFixpoint(route, snapped.anchorId);
				getEditablePath?.(interaction)?.movePoint(interaction.pointIndex, [
					snapped.point.x,
					snapped.point.y
				]);
			});
			return;
		}

		if (interaction.kind === 'move-points') {
			const dx = mouse.x - interaction.startMouse.x;
			const dy = mouse.y - interaction.startMouse.y;
			editor.mutateDocument(() => {
				for (const { target, start } of interaction.points || []) {
					getEditablePath?.(target)?.movePoint(target.index, [start[0] + dx, start[1] + dy]);
				}
			});
			return;
		}

		if (interaction.kind === 'transform-preset-outline') {
			editTools?.outline?.applySemanticTransform(interaction, mouse);
			return;
		}

		if (
			['move-symbol', 'rotate-symbol', 'scale-symbol', 'scale-symbol-x', 'scale-symbol-y'].includes(
				interaction.kind
			)
		) {
			editTools?.symbol?.onMouseMove(event, mouse);
			return;
		}

		if (interaction.kind === 'move-route-label') {
			editor.moveRouteLabel(interaction.routeId, interaction, mouse);
		}
	}

	function up(input) {
		if (!input) return;
		const { point, sourceEvent: event } = input;
		getCurrentTool()?.onMouseUp?.(event, point);

		const interaction = editor.endInteraction();
		if (interaction?.kind === 'selection-region') {
			const region = createSelectionRegion(interaction.start, interaction.end);
			const moved = Math.hypot(region.right - region.left, region.bottom - region.top) > 0.005;
			if (moved) {
				const selectedRouteId = editor.ui.selectedRouteId;
				const routePoints = selectedRouteId
					? getRoutePointRegionSelection(editor.topo, selectedRouteId, editor.ui.drawingTarget)
					: [];
				if (routePoints.length) editor.selectRoutePoints(routePoints, interaction.mode);
				else {
					editor.selectRoutePoints([], 'replace');
					editor.selectItems(
						getRegionSelection(editor.topo, region, getCanvasSize()),
						interaction.mode
					);
				}
			} else if (interaction.mode === 'replace') {
				editor.clearSelection();
			}
		} else if (interaction) {
			editor.saveHistory();
		}
	}

	function emptyTouchTap() {
		if (!EDIT_TOOLS.has(editor.ui.activeTool)) return;
		editor.clearSelection();
		editor.setDrawingTarget(null);
		editor.setActiveTool('select');
	}

	function getGesturePolicy() {
		const activeTool = editor.ui.activeTool;
		const isEditTool = EDIT_TOOLS.has(activeTool);
		const isMobileSelection = activeTool === 'select' && editor.ui.mobileSelectionMode;
		return {
			panSingleTouch: isEditTool || (activeTool === 'select' && !isMobileSelection),
			routeSingleTouchToInput: activeTool !== 'select' || isMobileSelection,
			trackEmptyTouch: isEditTool
		};
	}

	return { down, move, up, emptyTouchTap, getGesturePolicy };
}
