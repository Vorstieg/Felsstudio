/** DJI Mavic 4 Pro optics; FOV is diagonal and coverage uses the lower-resolution still mode. */
const CAMERAS = {
	wide: { focalLength: 28, diagonalFov: 72, minimumFocus: 2, imageWidth: 6144, aspect: 1.5 },
	'tele-3x': { focalLength: 70, diagonalFov: 35, minimumFocus: 3, imageWidth: 4032, aspect: 4 / 3 },
	'tele-6x': { focalLength: 168, diagonalFov: 15, minimumFocus: 3, imageWidth: 4096, aspect: 4 / 3 }
} as const;
export type FlightCamera = keyof typeof CAMERAS;

export function flightCamera(camera: string) {
	const key =
		camera === '6x'
			? 'tele-6x'
			: camera === 'medium-tele'
				? 'tele-3x'
				: camera === 'main'
					? 'wide'
					: camera;
	if (!Object.hasOwn(CAMERAS, key)) throw new TypeError(`Unsupported capture camera: ${camera}.`);
	return CAMERAS[key as FlightCamera];
}

export function cameraFootprint(camera: string, distance: number) {
	const diagonal = 2 * distance * Math.tan((flightCamera(camera).diagonalFov * Math.PI) / 360);
	const aspect = flightCamera(camera).aspect;
	const height = diagonal / Math.hypot(aspect, 1);
	return { width: height * aspect, height };
}

/** Nominal normal-view distance for the requested ground sampling distance. */
export function cameraDistanceAtGsd(camera: string, targetGsdCm: number): number {
	return ((targetGsdCm / 100) * flightCamera(camera).imageWidth) / cameraFootprint(camera, 1).width;
}

/** Prefer a wider lens for coverage; use a longer lens only when resolution requires it. */
export function selectCoverageCamera(distance: number, targetGsdCm: number): FlightCamera {
	for (const camera of ['wide', 'tele-3x', 'tele-6x'] as const) {
		if (
			(cameraFootprint(camera, distance).width / flightCamera(camera).imageWidth) * 100 <=
			targetGsdCm
		)
			return camera;
	}
	return 'tele-6x';
}

/** Test a 3D point against the actual camera frustum (heading clockwise from north). */
export function cameraContainsTarget(
	camera: string,
	position: readonly number[],
	heading: number,
	pitch: number,
	target: readonly number[]
): boolean {
	const yaw = (heading * Math.PI) / 180,
		tilt = (pitch * Math.PI) / 180;
	const dx = target[0] - position[0],
		dy = target[1] - position[1],
		dz = target[2] - position[2];
	const forward = (dx * Math.sin(yaw) + dy * Math.cos(yaw)) * Math.cos(tilt) + dz * Math.sin(tilt);
	if (forward <= 0) return false;
	const right = dx * Math.cos(yaw) - dy * Math.sin(yaw);
	const up = -(dx * Math.sin(yaw) + dy * Math.cos(yaw)) * Math.sin(tilt) + dz * Math.cos(tilt);
	const footprint = cameraFootprint(camera, forward);
	return (
		Math.abs(right) <= footprint.width / 2 + 1e-6 && Math.abs(up) <= footprint.height / 2 + 1e-6
	);
}
