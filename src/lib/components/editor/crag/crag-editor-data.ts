import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { PathFeature, Point2D } from '@vorstieg/fels-types/types';
import type { AccessTrackFeature, ActiveTrackTarget, RoutePathTarget } from './crag-track-types.ts';

type CragSelection = {
	type?: string;
	id?: string | number;
	documentPath?: string;
	pathId?: string | number;
	pathIndex?: number | null;
};

type RoutePathItem = {
	documentPath: string;
	pathIndex: number;
	feature: PathFeature;
	assignedRouteIds?: Array<string | number>;
};

type EditorFeatureProperties = Record<string, unknown>;
type EditorFeature = Feature<Geometry, EditorFeatureProperties>;

export type BuildEditorFeatureCollectionOptions = {
	savedAccessFeatures?: AccessTrackFeature[];
	routePaths?: RoutePathItem[];
	selectedObject?: CragSelection | null;
	editingRoutePath?: RoutePathTarget | null;
	drawingPoints?: Point2D[];
	drawingTails?: Point2D[][];
	joinPreview?: { candidatePoints: Point2D[]; connection: Point2D[] } | null;
	removedDrawingPoints?: Point2D[];
	midpointSelected?: number | null;
	visibleDrawingPointIndexes?: number[];
	editingDrawingPath?: boolean;
	selectedTrackPointIndex?: number | null;
	selectedTrackPointIndexes?: number[];
	draggingTrackPointIndex?: number | null;
	activeTrackTarget?: ActiveTrackTarget | null;
};

/** Builds the GeoJSON source data for saved access tracks, route paths, and the active drawing. */
export function buildEditorFeatureCollection({
	savedAccessFeatures = [],
	routePaths = [],
	selectedObject = null,
	editingRoutePath = null,
	drawingPoints = [],
	drawingTails = [],
	joinPreview = null,
	removedDrawingPoints = [],
	midpointSelected = null,
	visibleDrawingPointIndexes = [],
	editingDrawingPath = false,
	selectedTrackPointIndexes = [],
	draggingTrackPointIndex = null,
	activeTrackTarget = null
}: BuildEditorFeatureCollectionOptions = {}): FeatureCollection<Geometry, EditorFeatureProperties> {
	const features: EditorFeature[] = [];
	savedAccessFeatures
		.filter((feature) => feature.properties?.kind === 'approach')
		.forEach((track) => {
			if (
				(activeTrackTarget?.kind === 'access' && activeTrackTarget.featureId === track.id) ||
				(track.geometry?.coordinates?.length ?? 0) <= 1
			)
				return;
			features.push({
				type: 'Feature',
				geometry: track.geometry as Geometry,
				properties: {
					...track.properties,
					state: 'saved',
					accessFeatureId: track.id,
					selected: selectedObject?.type === 'approach' && track.id === selectedObject.id
				}
			});
		});
	routePaths.forEach(({ documentPath, pathIndex, feature, assignedRouteIds = [] }) => {
		if (
			editingRoutePath?.documentPath === documentPath &&
			editingRoutePath?.pathId === String(feature.id)
		)
			return;
		if (
			!feature?.geometry ||
			feature.geometry.type !== 'LineString' ||
			feature.geometry.coordinates?.length < 2
		)
			return;
		features.push({
			type: 'Feature',
			geometry: feature.geometry as Geometry,
			properties: {
				feature: 'route-path',
				documentPath,
				pathId: String(feature.id),
				pathIndex,
				assignedRouteIds,
				name: (feature.properties as { name?: string } | undefined)?.name || 'Route path',
				selected:
					selectedObject?.type === 'route-path' &&
					selectedObject.documentPath === documentPath &&
					String(selectedObject.pathId) === String(feature.id) &&
					(selectedObject.pathIndex == null || Number(selectedObject.pathIndex) === pathIndex)
			}
		});
	});
	if (joinPreview) {
		features.push({
			type: 'Feature',
			geometry: { type: 'LineString', coordinates: joinPreview.candidatePoints },
			properties: { feature: 'track-join-candidate' }
		});
		features.push({
			type: 'Feature',
			geometry: { type: 'LineString', coordinates: joinPreview.connection },
			properties: { feature: 'track-join-connection' }
		});
		for (const coordinate of joinPreview.connection)
			features.push({
				type: 'Feature',
				geometry: { type: 'Point', coordinates: coordinate },
				properties: { feature: 'track-join-endpoint' }
			});
	}
	for (const [index, coordinates] of drawingTails.entries()) {
		features.push({
			type: 'Feature',
			geometry: { type: 'LineString', coordinates },
			properties: { feature: 'track-tail', segment: index }
		});
	}
	if (removedDrawingPoints.length > 1)
		features.push({
			type: 'Feature',
			geometry: { type: 'LineString', coordinates: removedDrawingPoints },
			properties: { feature: 'track-trim-preview' }
		});
	if (drawingPoints.length) {
		features.push({
			type: 'Feature',
			geometry: { type: 'Point', coordinates: drawingPoints[0] },
			properties: { feature: 'track-endpoint', label: 'A', end: false }
		});
		if (drawingPoints.length > 1)
			features.push({
				type: 'Feature',
				geometry: {
					type: 'Point',
					coordinates: drawingTails.at(-1)?.at(-1) || drawingPoints[drawingPoints.length - 1]
				},
				properties: { feature: 'track-endpoint', label: 'B', end: true }
			});
	}
	const drawingSegments =
		draggingTrackPointIndex === null
			? [drawingPoints]
			: [
					drawingPoints.slice(0, draggingTrackPointIndex),
					drawingPoints.slice(draggingTrackPointIndex + 1)
				];
	for (const coordinates of drawingSegments) {
		if (coordinates.length < 2) continue;
		features.push({
			type: 'Feature',
			geometry: { type: 'LineString', coordinates },
			properties: { name: 'Drawing', state: 'drawing' }
		});
	}
	for (const pointIndex of visibleDrawingPointIndexes) {
		if (pointIndex === draggingTrackPointIndex || !drawingPoints[pointIndex]) continue;
		features.push({
			type: 'Feature',
			geometry: { type: 'Point', coordinates: drawingPoints[pointIndex] },
			properties: {
				feature: 'track-vertex',
				type: 'Point',
				state: 'drawing',
				pointIndex,
				selected: selectedTrackPointIndexes.includes(pointIndex)
			}
		});
	}
	if (editingDrawingPath && drawingPoints.length > 1) {
		for (let index = 0; index < drawingPoints.length - 1; index += 1) {
			if (draggingTrackPointIndex !== null) continue;
			const first = drawingPoints[index];
			const second = drawingPoints[index + 1];
			features.push({
				type: 'Feature',
				geometry: {
					type: 'Point',
					coordinates: [(first[0] + second[0]) / 2, (first[1] + second[1]) / 2]
				},
				properties: {
					feature: 'track-midpoint',
					type: 'Point',
					state: 'drawing',
					pointIndex: index + 1,
					selected: midpointSelected === index + 1
				}
			});
		}
	}
	return { type: 'FeatureCollection', features };
}
