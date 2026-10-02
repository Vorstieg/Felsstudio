export type TrackCoordinate = [longitude: number, latitude: number];
export type TrackDraftMode = 'routing' | 'editing' | 'select' | 'delete';

interface RoutingResponse {
	routes?: Array<{
		geometry?: {
			coordinates?: unknown;
		};
	}>;
}

export interface TrackDraftInput {
	trackDraftMode: TrackDraftMode;
	waypoints?: TrackCoordinate[];
	points?: TrackCoordinate[];
	lngLat: TrackCoordinate;
}

export interface TrackDraft {
	waypoints: TrackCoordinate[];
	points: TrackCoordinate[];
}

export async function getRoutedSegment(
	from: TrackCoordinate,
	to: TrackCoordinate
): Promise<TrackCoordinate[]> {
	const coords = `${from[0]},${from[1]};${to[0]},${to[1]}`;
	const url = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coords}?overview=full&geometries=geojson&steps=false`;
	try {
		const response = await fetch(url);
		if (!response.ok) return [from, to];
		const data = (await response.json()) as RoutingResponse;
		const route = data.routes?.[0]?.geometry?.coordinates;
		return Array.isArray(route) && route.length > 1 ? (route as TrackCoordinate[]) : [from, to];
	} catch {
		return [from, to];
	}
}

export async function appendTrackPointToDraft({
	trackDraftMode,
	waypoints = [],
	points = [],
	lngLat
}: TrackDraftInput): Promise<TrackDraft> {
	if (trackDraftMode === 'editing') {
		return { waypoints, points: [...points, lngLat] };
	}

	if (waypoints.length === 0) {
		return { waypoints: [lngLat], points: [lngLat] };
	}

	const route = await getRoutedSegment(waypoints[waypoints.length - 1], lngLat);
	return {
		waypoints: [...waypoints, lngLat],
		points: [...points, ...(route.length > 1 ? route.slice(1) : [lngLat])]
	};
}

export async function buildRoutedDraft(
	waypoints: TrackCoordinate[] = []
): Promise<TrackCoordinate[]> {
	if (waypoints.length < 2) return waypoints;

	let routedPoints = [waypoints[0]];
	for (let i = 1; i < waypoints.length; i += 1) {
		const route = await getRoutedSegment(waypoints[i - 1], waypoints[i]);
		routedPoints = [...routedPoints, ...(route.length > 1 ? route.slice(1) : [waypoints[i]])];
	}
	return routedPoints;
}
