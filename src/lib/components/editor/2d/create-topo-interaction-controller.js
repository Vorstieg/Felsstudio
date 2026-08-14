/**
 * Applies pointer movement to the active editor interaction. Pointer input is
 * already normalized by createCanvasInput, so this module contains only topo
 * editing behavior and can be tested without a DOM.
 */
export function createTopoInteractionController({
	editor,
	getCurrentTool,
	getEditablePath,
	snapRoutePoint,
	referenceFixpoint,
	editTools
} = {}) {
	function update(input) {
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

	return { update };
}
