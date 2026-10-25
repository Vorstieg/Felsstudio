import type { Polygon } from 'geojson';
import { flightPlanTerrainBounds, type FlightPlanOptions } from './flight-plan-generator.ts';
import { checkFlightWork, FLIGHT_LIMITS } from './flight-plan-limits.ts';

export const TERRAIN_SOURCE = 'https://tiles.mapterhorn.com/tilejson.json';
const EARTH_RADIUS = 6378137;
export const WORLD_METERS = 2 * Math.PI * EARTH_RADIUS;
export const TILE_SIZE = 512;

export type TerrainSnapshot = {
	zoom: number;
	firstPixelX: number;
	firstPixelY: number;
	width: number;
	height: number;
	origin: number[];
	elevations: Float64Array;
};

export function mercatorPixel(longitude: number, latitude: number, zoom: number): number[] {
	const size = TILE_SIZE * 2 ** zoom;
	const radians = (latitude * Math.PI) / 180;
	return [
		((longitude + 180) / 360) * size,
		((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2) * size
	];
}

export function pixelCoordinate(x: number, y: number, zoom: number): number[] {
	const size = TILE_SIZE * 2 ** zoom;
	return [
		(x / size) * 360 - 180,
		(Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / size))) * 180) / Math.PI
	];
}

export function localCoordinate(
	snapshot: TerrainSnapshot,
	longitude: number,
	latitude: number
): number[] {
	const scale = WORLD_METERS / 360;
	return [
		(longitude - snapshot.origin[0]) * scale * Math.cos((snapshot.origin[1] * Math.PI) / 180),
		(latitude - snapshot.origin[1]) * scale
	];
}

export function geographicCoordinate(snapshot: TerrainSnapshot, local: number[]): number[] {
	const scale = WORLD_METERS / 360;
	return [
		snapshot.origin[0] + local[0] / (scale * Math.cos((snapshot.origin[1] * Math.PI) / 180)),
		snapshot.origin[1] + local[1] / scale
	];
}

export function validateTerrainSnapshot(snapshot: TerrainSnapshot): void {
	checkFlightWork(
		snapshot.width * snapshot.height,
		FLIGHT_LIMITS.meshVertices,
		'Terrain mesh vertices'
	);
	if (
		!Number.isInteger(snapshot.zoom) ||
		snapshot.zoom < 0 ||
		snapshot.zoom > 22 ||
		!Number.isInteger(snapshot.width) ||
		!Number.isInteger(snapshot.height) ||
		snapshot.width < 2 ||
		snapshot.height < 2 ||
		!Number.isInteger(snapshot.firstPixelX) ||
		!Number.isInteger(snapshot.firstPixelY) ||
		snapshot.origin.length !== 2 ||
		!snapshot.origin.every(Number.isFinite) ||
		!(snapshot.elevations instanceof Float64Array) ||
		snapshot.elevations.length !== snapshot.width * snapshot.height ||
		!snapshot.elevations.every(Number.isFinite)
	) {
		throw new TypeError('Terrain snapshot is incomplete or contains unavailable elevations.');
	}
}

export function snapshotElevationAt(
	snapshot: TerrainSnapshot,
	longitude: number,
	latitude: number
): number {
	const pixel = mercatorPixel(longitude, latitude, snapshot.zoom);
	let x = pixel[0] - snapshot.firstPixelX;
	let y = pixel[1] - snapshot.firstPixelY;
	if (
		!Number.isFinite(x + y) ||
		x < -1e-7 ||
		y < -1e-7 ||
		x > snapshot.width - 1 + 1e-7 ||
		y > snapshot.height - 1 + 1e-7
	) {
		throw new RangeError(
			'The flight path extends beyond the terrain snapshot. Reduce the capture area or stand-off.'
		);
	}
	x = Math.max(0, Math.min(snapshot.width - 1, x));
	y = Math.max(0, Math.min(snapshot.height - 1, y));
	const column = Math.min(snapshot.width - 2, Math.floor(x));
	const row = Math.min(snapshot.height - 2, Math.floor(y));
	const tx = x - column,
		ty = y - row;
	const i = row * snapshot.width + column;
	const z = snapshot.elevations;
	const elevation =
		z[i] * (1 - tx) * (1 - ty) +
		z[i + 1] * tx * (1 - ty) +
		z[i + snapshot.width] * (1 - tx) * ty +
		z[i + snapshot.width + 1] * tx * ty;
	if (!Number.isFinite(elevation))
		throw new Error('Terrain elevation is unavailable in the capture area.');
	return elevation;
}

export function decodeTerrarium(rgba: Uint8ClampedArray): Float64Array {
	const elevations = new Float64Array(rgba.length / 4);
	for (let index = 0; index < elevations.length; index++) {
		const i = index * 4;
		elevations[index] =
			rgba[i + 3] === 255 ? rgba[i] * 256 + rgba[i + 1] + rgba[i + 2] / 256 - 32768 : NaN;
	}
	return elevations;
}

/** Fetch native pixels at a fixed zoom, independent of the map camera and exaggeration. */
export async function loadTerrainSnapshot(
	geometry: Polygon,
	options: FlightPlanOptions,
	progress: (message: string) => void = () => {}
): Promise<TerrainSnapshot> {
	if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap !== 'function') {
		throw new Error('This browser cannot decode terrain images in the background.');
	}
	const bounds = flightPlanTerrainBounds(geometry, options);
	if (bounds.west < -180 || bounds.east > 180 || bounds.south < -80 || bounds.north > 80) {
		throw new RangeError('This capture area is outside the supported terrain bounds.');
	}
	const zoom = Math.max(
		0,
		Math.min(
			18,
			Math.ceil(
				Math.log2((WORLD_METERS * Math.cos((bounds.origin[1] * Math.PI) / 180)) / TILE_SIZE)
			)
		)
	);
	const northwest = mercatorPixel(bounds.west, bounds.north, zoom);
	const southeast = mercatorPixel(bounds.east, bounds.south, zoom);
	const firstPixelX = Math.floor(northwest[0]) - 1;
	const firstPixelY = Math.floor(northwest[1]) - 1;
	const width = Math.ceil(southeast[0]) - firstPixelX + 2;
	const height = Math.ceil(southeast[1]) - firstPixelY + 2;
	checkFlightWork(width * height, FLIGHT_LIMITS.meshVertices, 'Terrain mesh vertices');
	const snapshot: TerrainSnapshot = {
		zoom,
		firstPixelX,
		firstPixelY,
		width,
		height,
		origin: bounds.origin,
		elevations: new Float64Array(width * height).fill(NaN)
	};
	const tiles: number[][] = [];
	for (
		let y = Math.floor(firstPixelY / TILE_SIZE);
		y <= Math.floor((firstPixelY + height - 1) / TILE_SIZE);
		y++
	) {
		for (
			let x = Math.floor(firstPixelX / TILE_SIZE);
			x <= Math.floor((firstPixelX + width - 1) / TILE_SIZE);
			x++
		)
			tiles.push([x, y]);
	}
	checkFlightWork(tiles.length, FLIGHT_LIMITS.tiles, 'Terrain tiles');
	let loaded = 0;
	for (let batch = 0; batch < tiles.length; batch += 4) {
		await Promise.all(
			tiles.slice(batch, batch + 4).map(async ([x, y]) => {
				const response = await fetch(`https://tiles.mapterhorn.com/${zoom}/${x}/${y}.webp`, {
					signal: AbortSignal.timeout(20000)
				});
				if (!response.ok)
					throw new Error(
						`Terrain could not be loaded (${response.status}). Try again when the terrain service is available.`
					);
				const bitmap = await createImageBitmap(await response.blob(), {
					colorSpaceConversion: 'none',
					premultiplyAlpha: 'none'
				});
				try {
					if (bitmap.width !== TILE_SIZE || bitmap.height !== TILE_SIZE)
						throw new Error('Terrain tile has an unexpected resolution.');
					const canvas = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
					const context = canvas.getContext('2d', { willReadFrequently: true });
					if (!context)
						throw new Error('This browser cannot decode terrain images in the background.');
					context.drawImage(bitmap, 0, 0);
					const data = decodeTerrarium(context.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data);
					const xStart = Math.max(firstPixelX, x * TILE_SIZE),
						xEnd = Math.min(firstPixelX + width, (x + 1) * TILE_SIZE);
					const yStart = Math.max(firstPixelY, y * TILE_SIZE),
						yEnd = Math.min(firstPixelY + height, (y + 1) * TILE_SIZE);
					for (let row = yStart; row < yEnd; row++) {
						snapshot.elevations.set(
							data.subarray(
								(row - y * TILE_SIZE) * TILE_SIZE + xStart - x * TILE_SIZE,
								(row - y * TILE_SIZE) * TILE_SIZE + xEnd - x * TILE_SIZE
							),
							(row - firstPixelY) * width + xStart - firstPixelX
						);
					}
				} finally {
					bitmap.close();
				}
				progress(`Loading terrain (${++loaded}/${tiles.length})…`);
			})
		);
	}
	validateTerrainSnapshot(snapshot);
	return snapshot;
}
