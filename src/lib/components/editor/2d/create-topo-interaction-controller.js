/**
 * Applies pointer movement to the active editor interaction. Pointer input is
 * already normalized by createCanvasInput, so this module contains only topo
 * editing behavior and can be tested without a DOM.
 */
export function createTopoInteractionController({
	getTopo,
	mutateDocument,
	getInteraction,
	getCurrentTool,
	getEditablePath,
	snapRoutePoint,
	referenceFixpoint,
	outlineEditTool,
	routeEditTool,
	symbolEditTool,
	onMoveRouteLabel
} = {}) {
	function update(input) {
		if (!input) return;
		const { point: mouse, sourceEvent: event } = input;
		getCurrentTool()?.onMouseMove?.(event, mouse);

		const interaction = getInteraction?.();
		if (!interaction) return;

		if (interaction.kind === 'selection-region') {
			interaction.end = mouse;
			return;
		}

		if (interaction.kind === 'move-selection') {
			const deltaX = mouse.x - interaction.startMouse.x;
			const deltaY = mouse.y - interaction.startMouse.y;
			(mutateDocument || ((mutator) => mutator()))(() => {
				interaction.items.paths.forEach(({ target, snapshot }) => {
					getEditablePath?.(target)?.translateFrom(snapshot, [deltaX, deltaY]);
				});
				interaction.items.symbols.forEach(({ symbolId, startPos }) => {
					const symbol = getTopo().fixPoints.find((item) => item.id === symbolId);
					if (symbol) symbol.position2D = [startPos[0] + deltaX, startPos[1] + deltaY];
				});
				interaction.items.texts?.forEach(({ textId, startPos }) => {
					const label = (getTopo().textLabels || []).find((item) => item.id === textId);
					if (label) label.position2D = [startPos[0] + deltaX, startPos[1] + deltaY];
				});
			});
			return;
		}

		if (interaction.kind === 'move-point') {
			const gridSnappedRoutePoint = routeEditTool?.snapPoint(mouse);
			const snapped = interaction.outlineId
				? { point: outlineEditTool?.snapPoint(mouse) || mouse, fixPointId: null }
				: gridSnappedRoutePoint
					? { point: gridSnappedRoutePoint, fixPointId: null }
					: snapRoutePoint(mouse);
			const route = interaction.routeId
				? getTopo().routes.find((candidate) => String(candidate.id) === String(interaction.routeId))
				: null;
			(mutateDocument || ((mutator) => mutator()))(() => {
				if (route) referenceFixpoint(route, snapped.fixPointId);
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
			(mutateDocument || ((mutator) => mutator()))(() => {
				for (const { target, start } of interaction.points || []) {
					getEditablePath?.(target)?.movePoint(target.index, [start[0] + dx, start[1] + dy]);
				}
			});
			return;
		}

		if (interaction.kind === 'transform-preset-outline') {
			outlineEditTool?.applySemanticTransform(interaction, mouse);
			return;
		}

		if (
			['move-symbol', 'rotate-symbol', 'scale-symbol', 'scale-symbol-x', 'scale-symbol-y'].includes(
				interaction.kind
			)
		) {
			symbolEditTool?.onMouseMove(event, mouse);
			return;
		}

		if (interaction.kind === 'move-route-label') {
			onMoveRouteLabel?.(interaction, mouse);
		}
	}

	return { update };
}
