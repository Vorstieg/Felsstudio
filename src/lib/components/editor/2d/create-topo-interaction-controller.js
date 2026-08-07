/**
 * Applies pointer movement to the active editor interaction. Pointer input is
 * already normalized by createCanvasInput, so this module contains only topo
 * editing behavior and can be tested without a DOM.
 */
export function createTopoInteractionController({
	getTopo,
	getInteraction,
	getCurrentTool,
	getEditablePath,
	snapRoutePoint,
	referenceFixpoint,
	outlineEditTool,
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
			interaction.items.paths.forEach(({ target, snapshot }) => {
				getEditablePath?.(target)?.translateFrom(snapshot, [deltaX, deltaY]);
			});
			interaction.items.symbols.forEach(({ symbolId, startPos }) => {
				const symbol = getTopo().fixPoints.find((item) => item.id === symbolId);
				if (symbol) symbol.position2D = [startPos[0] + deltaX, startPos[1] + deltaY];
			});
			interaction.items.texts.forEach(({ textId, startPos }) => {
				const label = (getTopo().textLabels || []).find((item) => item.id === textId);
				if (label) label.position2D = [startPos[0] + deltaX, startPos[1] + deltaY];
			});
			return;
		}

		if (interaction.kind === 'move-point') {
			const snapped = snapRoutePoint(mouse);
			const route = interaction.routeId
				? getTopo().routes.find((candidate) => candidate.id === interaction.routeId)
				: null;
			if (route) referenceFixpoint(route, snapped.fixPointId);
			getEditablePath?.(interaction)?.movePoint(interaction.pointIndex, [
				snapped.point.x,
				snapped.point.y
			]);
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
			return;
		}

		if (interaction.kind === 'move-text') {
			const label = (getTopo().textLabels || []).find((item) => item.id === interaction.id);
			if (label) {
				label.position2D = [
					interaction.startPos[0] + mouse.x - interaction.startMouse.x,
					interaction.startPos[1] + mouse.y - interaction.startMouse.y
				];
			}
		}
	}

	return { update };
}
