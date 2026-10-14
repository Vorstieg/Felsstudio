import type { Map as MapLibreMap, MapMouseEvent, MapGeoJSONFeature } from 'maplibre-gl';
import {
	queryCragFeatures,
	trackTargetFromProperties,
	type CragMapProperties
} from './crag-map-hit-testing.ts';
import type { CragSelection, RouteDocument } from './crag-route-types.ts';

type SelectableProperties = CragMapProperties;
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
		pathIndex?: number
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
		return queryCragFeatures(getMap(), event.point, pathsOnly);
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
		const target = trackTargetFromProperties(properties);
		if (
			properties.feature === 'route-path' &&
			properties.documentPath &&
			properties.pathId != null
		) {
			const pathIndex = target?.kind === 'route-path' ? target.pathIndex : undefined;
			selectObject({
				type: 'route-path',
				documentPath: properties.documentPath,
				pathId: String(properties.pathId),
				...(pathIndex != null ? { pathIndex } : {})
			});
			setActiveTab?.('registry');
			if (editPath) {
				const route = routeForPath(properties.documentPath, properties.pathId);
				onEditRoutePath?.(
					properties.documentPath,
					route?.id,
					properties.pathId,
					pathIndex ?? undefined
				);
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
		if (feature)
			return selectFeature((feature.properties || {}) as SelectableProperties, { editPath: true });
		selectObject(null);
		return true;
	}

	return { handleMapClick, handlePathMapClick };
}
