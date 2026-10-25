export const FLIGHT_LIMITS = {
	polygonVertices: 1000,
	waypoints: 10000,
	wallSamples: 100000,
	pathSamples: 100000,
	terrainQueries: 2000000,
	meshVertices: 250000,
	tiles: 32
} as const;

export function checkFlightWork(count: number, limit: number, label: string): void {
	if (!Number.isFinite(count) || count < 0 || count > limit) {
		throw new RangeError(
			`${label} exceed the flight-plan limit (${limit.toLocaleString('en-US')}). Reduce the capture area or increase spacing.`
		);
	}
}
