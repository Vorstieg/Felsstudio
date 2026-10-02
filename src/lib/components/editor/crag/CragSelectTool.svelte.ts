import type { Map as MapLibreMap, MapMouseEvent, MapGeoJSONFeature } from 'maplibre-gl';
import { getMapHitRadius } from '$lib/assets/js/mobile-utils.ts';
import type { CragSelection, RouteDocument } from './crag-route-types.ts';

type SelectableProperties = {
	feature?: string;
	kind?: string;
	documentPath?: string;
	pathId?: string | number;
	pathIndex?: string | number;
	accessFeatureId?: string;
	path?: string;
};
type SelectableFeature = Pick<MapGeoJSONFeature, 'properties'>;
type CragSelectToolOptions = {
	getMap: () => MapLibreMap | null | undefined;
	selectObject: (selection: CragSelection | null) => void;
	setActiveTab?: (tab: string) => void;
	getRouteDocuments?: () => RouteDocument[];
	onEditRoutePath?: (
		documentPath: string,
		routeId: string | number | undefined,
		pathId: string | number,
		pathIndex: number
	) => void;
	onEditTrack?: (featureId: string) => void;
};

/** Owns crag-object hit testing and selection changes. */
export function createCragSelectTool({
	getMap,
	selectObject,
	setActiveTab,
	getRouteDocuments,
	onEditRoutePath,
	onEditTrack
}: CragSelectToolOptions) {
	function querySelectableFeatures(event: MapMouseEvent, pathsOnly = false): SelectableFeature[] {
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

	function firstSelectableFeature(features: SelectableFeature[], pathsOnly = false) {
		const pathFeature = features.find(({ properties }) => {
			const props = properties as SelectableProperties | null;
			return props?.feature === 'route-path' || props?.kind === 'approach';
		});
		if (pathFeature || pathsOnly) return pathFeature;
		return (
			features.find(
				({ properties }) => (properties as SelectableProperties | null)?.feature === 'child-entry'
			) || features[0]
		);
	}

	function routeForPath(documentPath: string, pathId: string | number) {
		return (getRouteDocuments?.() || [])
			.find((entry) => entry.path === documentPath)
			?.data?.routes?.find((item) =>
				(item.pathRefs || []).some((ref) => String(ref.pathId) === String(pathId))
			);
	}

	function selectFeature(
		properties: SelectableProperties,
		{ editPath = false }: { editPath?: boolean } = {}
	) {
		if (
			properties.feature === 'route-path' &&
			properties.documentPath &&
			properties.pathId != null
		) {
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
		if (properties.feature === 'child-entry' && properties.path) {
			selectObject({ type: 'entry', key: properties.path });
			setActiveTab?.('info');
			return true;
		}
		return false;
	}

	function handlePathMapClick(event: MapMouseEvent, options: { editPath?: boolean } = {}) {
		const feature = firstSelectableFeature(querySelectableFeatures(event, true), true);
		return feature
			? selectFeature((feature.properties || {}) as SelectableProperties, options)
			: false;
	}

	function handleMapClick(event: MapMouseEvent) {
		const features = querySelectableFeatures(event);
		const feature = firstSelectableFeature(features);
		if (feature) return selectFeature((feature.properties || {}) as SelectableProperties);
		selectObject(null);
		return true;
	}

	return { handleMapClick, handlePathMapClick };
}
