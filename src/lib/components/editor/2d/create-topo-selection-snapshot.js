/** Builds a stable snapshot used by move-selection interactions. */
export function createTopoSelectionSnapshot({
	getTopo,
	selectedItems,
	drawingTarget,
	getEditablePath,
	startMouse
} = {}) {
	const paths = [];
	const symbols = [];
	const texts = [];
	const isMultiSelection = selectedItems.size > 1;
	const addPath = (target) => {
		const path = getEditablePath(target);
		if (path?.getPoints().length) paths.push({ target, snapshot: path.snapshot() });
	};

	selectedItems.forEach((itemKey) => {
		const [type, id] = itemKey.split(':');
		if (type === 'route') {
			const route = getTopo().routes.find((item) => item.id === id);
			if (!route) return;
			const selectedPitchId =
				!isMultiSelection && drawingTarget?.type === 'pitch' && drawingTarget.routeId === route.id
					? drawingTarget.pitchId
					: null;
			const selectedVariantId =
				!isMultiSelection && drawingTarget?.type === 'variant' && drawingTarget.routeId === route.id
					? drawingTarget.variantId
					: null;

			if (route.points2D && !selectedPitchId && !selectedVariantId) {
				addPath({ routeId: route.id });
			}
			(route.pitches || []).forEach((pitch) => {
				if ((!selectedPitchId || pitch.id === selectedPitchId) && pitch.points2D) {
					addPath({ routeId: route.id, pitchId: pitch.id });
				}
			});
			(route.variants || []).forEach((variant) => {
				if ((!selectedVariantId || variant.id === selectedVariantId) && variant.points2D) {
					addPath({ routeId: route.id, variantId: variant.id });
				}
			});
		} else if (type === 'outline') {
			addPath({ outlineId: id });
		} else if (type === 'symbol') {
			const symbol = getTopo().fixPoints.find((item) => item.id === id);
			if (symbol?.position2D) symbols.push({ symbolId: id, startPos: [...symbol.position2D] });
		} else if (type === 'text') {
			const label = (getTopo().textLabels || []).find((item) => item.id === id);
			if (label?.position2D) texts.push({ textId: id, startPos: [...label.position2D] });
		}
	});

	return { items: { paths, symbols, texts }, startMouse };
}
