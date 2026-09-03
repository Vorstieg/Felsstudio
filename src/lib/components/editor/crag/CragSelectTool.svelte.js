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
	function querySelectableFeatures(event, pathsOnly = false) {
		const map = getMap();
		if (!map) return [];
		const radius = getMapHitRadius(24) / 2;
		const layers = [
			'route-paths-line',
			'tracks-line-saved',
			...(pathsOnly ? [] : ['sector-polygons-fill', 'sector-polygons-outline'])
		].filter((layer) => map.getLayer(layer));
		return layers.length
			? map.queryRenderedFeatures(
					[
						[event.point.x - radius, event.point.y - radius],
						[event.point.x + radius, event.point.y + radius]
					],
					{ layers }
				)
			: [];
	}

	function firstSelectableFeature(features, pathsOnly = false) {
		const pathFeature = features.find(
			({ properties }) => properties?.feature === 'route-path' || properties?.kind === 'approach'
		);
		if (pathFeature || pathsOnly) return pathFeature;
		return features.find(({ properties }) => properties?.feature === 'sector') || features[0];
	}

	function routeForPath(documentPath, pathId) {
		return (getRouteDocuments?.() || [])
			.find((entry) => entry.path === documentPath)
			?.data?.routes?.find((item) =>
				(item.pathRefs || []).some((ref) => String(ref.pathId) === String(pathId))
			);
	}

	function selectFeature(properties, { editPath = false } = {}) {
		if (properties.feature === 'route-path' && properties.documentPath && properties.pathId) {
			const pathIndex = Number(properties.pathIndex);
			selectObject({
				type: 'route-path',
				documentPath: properties.documentPath,
				pathId: String(properties.pathId),
				...(Number.isInteger(pathIndex) ? { pathIndex } : {})
			});
			setActiveTab?.('registry');
			if (editPath) {
				const route = routeForPath(properties.documentPath, properties.pathId);
				onEditRoutePath?.(properties.documentPath, route?.id, properties.pathId, pathIndex);
			}
			return true;
		}
		if (properties.kind === 'approach' && properties.accessFeatureId) {
			selectObject({ type: 'approach', id: properties.accessFeatureId });
			setActiveTab?.('registry');
			if (editPath) onEditTrack?.(properties.accessFeatureId);
			return true;
		}
		if (properties.feature === 'sector' && properties.id) {
			selectObject({ type: 'sector', id: properties.id });
			setActiveTab?.('sectors');
			return true;
		}
		return false;
	}

	function handlePathMapClick(event, options = {}) {
		const feature = firstSelectableFeature(querySelectableFeatures(event, true), true);
		return feature ? selectFeature(feature.properties || {}, options) : false;
	}

	function handleMapClick(event) {
		const features = querySelectableFeatures(event);
		const feature = firstSelectableFeature(features);
		if (feature) return selectFeature(feature.properties || {});
		selectObject(null);
		return true;
	}

	return { handleMapClick, handlePathMapClick };
}
