export type TrackCoordinate = [longitude: number, latitude: number];

interface RoutingResponse {
	routes?: Array<{
		geometry?: {
			coordinates?: unknown;
		};
	}>;
}

export async function getRoutedSegment(
	from: TrackCoordinate,
	to: TrackCoordinate,
	signal?: AbortSignal
): Promise<TrackCoordinate[]> {
	const coords = `${from[0]},${from[1]};${to[0]},${to[1]}`;
	const url = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coords}?overview=full&geometries=geojson&steps=false`;
	const response = await fetch(url, { signal });
	if (!response.ok) throw new Error('Routing unavailable');
	const data = (await response.json()) as RoutingResponse;
	const route = data.routes?.[0]?.geometry?.coordinates;
	if (
		!Array.isArray(route) ||
		route.length < 2 ||
		route.some(
			(point) => !Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1])
		)
	)
		throw new Error('Routing unavailable');
	return route as TrackCoordinate[];
}
