import type { TopoGpsPosition } from '$lib/state/topo-2d-editor-initial-state.ts';
import type { ClusteringHit, Point3 } from '$lib/state/clustering-types.ts';

export type UploadProject = {
	hits: ClusteringHit[];
	cameras?: Record<string, Point3>;
	coordinateSystem?: 'Z_UP' | 'Y_UP';
	name?: string;
	gps: Array<TopoGpsPosition & { frame_index?: number | string; img?: string }>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const isPoint3 = (value: unknown): value is Point3 =>
	Array.isArray(value) &&
	value.length === 3 &&
	value.every((number) => typeof number === 'number' && Number.isFinite(number));

const isFiniteNumber = (value: unknown): value is number =>
	typeof value === 'number' && Number.isFinite(value);

function optionalNumber(value: unknown, fallback: number, label: string): number {
	if (value === undefined || value === null) return fallback;
	if (!isFiniteNumber(value)) throw new Error(`${label} must be a finite number`);
	return value;
}

function parseHit(value: unknown, index: number): ClusteringHit {
	const label = `Hit ${index + 1}`;
	if (
		!isRecord(value) ||
		!isPoint3(value.pos) ||
		!isPoint3(value.cam_pos) ||
		!isFiniteNumber(value.conf) ||
		typeof value.class !== 'string' ||
		typeof value.img !== 'string'
	) {
		throw new Error(`${label} needs pos, cam_pos, conf, class, and img`);
	}
	const crop = value.crop ?? value.hit_crop ?? value.img;
	if (typeof crop !== 'string') throw new Error(`${label} crop must be a string`);
	if (value.gps !== undefined && !isPoint3(value.gps))
		throw new Error(`${label} gps must be a three-number position`);
	return {
		...value,
		pos: value.pos,
		cam_pos: value.cam_pos,
		conf: value.conf,
		class: value.class,
		img: value.img,
		crop,
		edge_dist: optionalNumber(value.edge_dist, 0, `${label} edge_dist`),
		normal_dot: optionalNumber(value.normal_dot, 1, `${label} normal_dot`),
		cam_dist: optionalNumber(value.cam_dist, 1, `${label} cam_dist`)
	};
}

function parseGps(value: unknown, index: number): UploadProject['gps'][number] {
	const label = `GPS entry ${index + 1}`;
	if (!isRecord(value) || !isFiniteNumber(value.latitude) || !isFiniteNumber(value.longitude)) {
		throw new Error(`${label} needs numeric latitude and longitude`);
	}
	if (
		value.frame_index !== undefined &&
		typeof value.frame_index !== 'number' &&
		typeof value.frame_index !== 'string'
	) {
		throw new Error(`${label} frame_index must be a number or string`);
	}
	if (value.img !== undefined && typeof value.img !== 'string')
		throw new Error(`${label} img must be a string`);
	return {
		latitude: value.latitude,
		longitude: value.longitude,
		abs_alt: optionalNumber(value.abs_alt, 0, `${label} abs_alt`),
		rel_alt: optionalNumber(value.rel_alt, 0, `${label} rel_alt`),
		...(value.frame_index !== undefined ? { frame_index: value.frame_index } : {}),
		...(value.img !== undefined ? { img: value.img } : {})
	};
}

export function parse3DUploadProject(value: unknown): UploadProject {
	if (!isRecord(value)) throw new Error('Project JSON must be an object');
	if (value.hits !== undefined && !Array.isArray(value.hits))
		throw new Error('Project hits must be an array');
	if (value.gps !== undefined && !Array.isArray(value.gps))
		throw new Error('Project gps must be an array');
	if (value.name !== undefined && typeof value.name !== 'string')
		throw new Error('Project name must be a string');
	if (
		value.coordinateSystem !== undefined &&
		value.coordinateSystem !== 'Z_UP' &&
		value.coordinateSystem !== 'Y_UP'
	)
		throw new Error('Project coordinateSystem must be Z_UP or Y_UP');
	if (
		value.cameras !== undefined &&
		(!isRecord(value.cameras) || !Object.values(value.cameras).every(isPoint3))
	)
		throw new Error('Project cameras must map image names to three-number positions');
	return {
		...(value.coordinateSystem !== undefined ? { coordinateSystem: value.coordinateSystem } : {}),
		...(value.cameras !== undefined ? { cameras: value.cameras as Record<string, Point3> } : {}),
		hits: (value.hits ?? []).map(parseHit),
		gps: (value.gps ?? []).map(parseGps),
		...(value.name !== undefined ? { name: value.name } : {})
	};
}

export function getUploadCameraPositions(project: UploadProject): Record<string, Point3> {
	const cameras: Record<string, Point3> = {};
	const key = (name: string) => {
		const match = name.match(/[fF](\d+)/);
		return match ? String(parseInt(match[1])) : name;
	};
	for (const [image, position] of Object.entries(project.cameras ?? {}))
		cameras[key(image)] = position;
	for (const hit of project.hits)
		if (!(key(hit.img) in cameras)) cameras[key(hit.img)] = hit.cam_pos;
	return cameras;
}
export function getUploadModelTransform(project: UploadProject, offset: Point3) {
	return project.coordinateSystem === 'Z_UP'
		? {
				modelRotation: [-Math.PI / 2, 0, 0] as Point3,
				modelOffset: [offset[0], offset[2], -offset[1]] as Point3
			}
		: { modelRotation: [0, 0, 0] as Point3, modelOffset: offset };
}
