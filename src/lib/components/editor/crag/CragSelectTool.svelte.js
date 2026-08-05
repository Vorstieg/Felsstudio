import { getMapHitRadius } from '$lib/assets/js/mobile-utils.js';

/** Owns crag-object hit testing and selection changes. */
export function createCragSelectTool({
	getMap,
	selectObject,
	setActiveTab,
	getRouteDocuments,
	onEditRoutePath,
	onEditTrack
} = {}) {
	function handleMapClick(event) {
		const map = getMap();
		if (!map) return false;
		const radius = getMapHitRadius(24) / 2;
		const layers = [
			'route-paths-line',
			'tracks-line-saved',
			'sector-polygons-fill',
			'sector-polygons-outline'
		].filter((layer) => map.getLayer(layer));
		const features = layers.length
			? map.queryRenderedFeatures(
					[
						[event.point.x - radius, event.point.y - radius],
						[event.point.x + radius, event.point.y + radius]
					],
					{ layers }
				)
			: [];
		const properties =
			(
				features.find(({ properties: value }) => value?.feature === 'route-path') ||
				features.find(({ properties: value }) => value?.kind === 'approach') ||
				features.find(({ properties: value }) => value?.feature === 'sector') ||
				features[0]
			)?.properties || {};

		if (properties.feature === 'route-path' && properties.documentPath && properties.pathId) {
			selectObject({
				type: 'route-path',
				documentPath: properties.documentPath,
				pathId: properties.pathId
			});
			const route = (getRouteDocuments?.() || [])
				.find((entry) => entry.path === properties.documentPath)
				?.data?.routes?.find((item) =>
					(item.pathRefs || []).some((ref) => String(ref.pathId) === String(properties.pathId))
				);
			onEditRoutePath?.(properties.documentPath, route?.id, properties.pathId);
		} else if (properties.feature === 'sector' && properties.id) {
			selectObject({ type: 'sector', id: properties.id });
			setActiveTab('sectors');
		} else if (properties.kind === 'approach' && properties.accessFeatureId) {
			selectObject({ type: 'approach', id: properties.accessFeatureId });
			onEditTrack?.(properties.accessFeatureId);
		} else {
			selectObject(null);
		}
		return true;
	}

	return { handleMapClick };
}
