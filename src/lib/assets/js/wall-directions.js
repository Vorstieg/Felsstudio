export const wallDirections = [
	{ id: 'N', azimuth: 0 },
	{ id: 'NE', azimuth: 45 },
	{ id: 'E', azimuth: 90 },
	{ id: 'SE', azimuth: 135 },
	{ id: 'S', azimuth: 180 },
	{ id: 'SW', azimuth: 225 },
	{ id: 'W', azimuth: 270 },
	{ id: 'NW', azimuth: 315 }
];

export function wallDirectionForAzimuth(azimuth) {
	const value = Number(azimuth);
	const normalized = Number.isFinite(value) ? ((value % 360) + 360) % 360 : 0;
	return wallDirections[Math.round(normalized / 45) % wallDirections.length];
}

export function wallAzimuthForDirection(directionId) {
	return wallDirections.find((direction) => direction.id === directionId)?.azimuth;
}
