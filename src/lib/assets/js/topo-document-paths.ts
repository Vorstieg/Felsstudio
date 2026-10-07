import { generateId } from './id-utils.ts';
import type { FelsTopoDocument, PathFeature, Route } from '@vorstieg/fels-types/types';

type PathCoordinates = readonly (readonly number[])[];
type TopoPathOptions = { role?: string; label?: string };
type SplitOptions = { mode?: 'shared' | 'route-specific'; routeId?: string | number };

function clone<T>(value: T): T {
	return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isLineStringPath(feature: PathFeature): boolean {
	return (
		feature?.type === 'Feature' &&
		feature.geometry?.type === 'LineString' &&
		Array.isArray(feature.geometry.coordinates) &&
		feature.geometry.coordinates.length >= 2 &&
		feature.geometry.coordinates.every(
			(point) => Array.isArray(point) && point.length >= 2 && point.every(Number.isFinite)
		)
	);
}

export function createPathFeature(
	coordinates: PathCoordinates,
	metadata: Record<string, unknown> = {},
	id: string | number = generateId('path')
): PathFeature {
	return {
		type: 'Feature',
		id: String(id),
		properties: { ...(metadata || {}) },
		geometry: {
			type: 'LineString',
			// Topo map paths use 2D coordinates; the published schema currently types these as 3D.
			coordinates: coordinates.map((point) => [
				Number(point[0]),
				Number(point[1])
			]) as unknown as PathFeature['geometry']['coordinates']
		}
	};
}

export function findTopoPath(data: FelsTopoDocument, pathId: string | number): PathFeature | null {
	return data.paths?.features.find((feature) => String(feature.id) === String(pathId)) || null;
}

export function assignTopoPath(
	data: FelsTopoDocument,
	routeId: string | number,
	pathId: string | number,
	{ role = 'main', label = '' }: TopoPathOptions = {}
): boolean {
	const path = findTopoPath(data, pathId);
	const route = (data.routes || []).find((item) => String(item.id) === String(routeId));
	if (!path || !route) throw new Error('Path and route must belong to the same topo document.');
	route.pathRefs ||= [];
	if (route.pathRefs.some((ref) => String(ref.pathId) === String(pathId))) return false;
	route.pathRefs.push({ pathId: String(path.id), role, ...(label ? { label } : {}) });
	return true;
}

export function unassignTopoPath(
	data: FelsTopoDocument,
	routeId: string | number,
	pathId: string | number
): boolean {
	const route = (data.routes || []).find((item) => String(item.id) === String(routeId));
	if (!route) return false;
	const refs = route.pathRefs || [];
	const next = refs.filter((ref) => String(ref.pathId) !== String(pathId));
	route.pathRefs = next;
	return next.length !== refs.length;
}

export function routesUsingTopoPath(data: FelsTopoDocument, pathId: string | number): Route[] {
	return (data.routes || []).filter((route) =>
		(route.pathRefs || []).some((ref) => String(ref.pathId) === String(pathId))
	);
}

export function deleteTopoPath(data: FelsTopoDocument, pathId: string | number): boolean {
	const paths = data.paths;
	if (!paths) return false;
	const before = paths.features.length;
	paths.features = paths.features.filter((feature) => String(feature.id) !== String(pathId));
	for (const route of data.routes || [])
		route.pathRefs = (route.pathRefs || []).filter((ref) => String(ref.pathId) !== String(pathId));
	return paths.features.length !== before;
}

export function splitTopoPath(
	data: FelsTopoDocument,
	pathId: string | number,
	startCoordinates: PathCoordinates,
	endCoordinates: PathCoordinates,
	{ mode = 'shared', routeId }: SplitOptions = {}
): string[] {
	const path = findTopoPath(data, pathId);
	if (!path || startCoordinates?.length < 2 || endCoordinates?.length < 2) return [];
	const paths = data.paths;
	if (!paths) return [];
	if (mode === 'route-specific') {
		const route = (data.routes || []).find((item) => String(item.id) === String(routeId));
		if (!route || !(route.pathRefs || []).some((ref) => String(ref.pathId) === String(pathId)))
			return [];
		const firstId = `${pathId}-1`;
		const secondId = `${pathId}-2`;
		paths.features.push(
			{
				...clone(path),
				id: firstId,
				geometry: {
					type: 'LineString',
					coordinates: clone(startCoordinates) as unknown as PathFeature['geometry']['coordinates']
				}
			},
			{
				...clone(path),
				id: secondId,
				geometry: {
					type: 'LineString',
					coordinates: clone(endCoordinates) as unknown as PathFeature['geometry']['coordinates']
				}
			}
		);
		route.pathRefs = (route.pathRefs || []).flatMap((ref) =>
			String(ref.pathId) === String(pathId)
				? [
						{ ...ref, pathId: firstId },
						{ ...ref, pathId: secondId }
					]
				: [ref]
		);
		return [firstId, secondId];
	}
	path.geometry = {
		type: 'LineString',
		coordinates: clone(startCoordinates) as unknown as PathFeature['geometry']['coordinates']
	};
	const secondId = `${pathId}-2`;
	paths.features.push({
		...clone(path),
		id: secondId,
		geometry: {
			type: 'LineString',
			coordinates: clone(endCoordinates) as unknown as PathFeature['geometry']['coordinates']
		}
	});
	for (const route of data.routes || []) {
		const refs = route.pathRefs || [];
		if (refs.some((ref) => String(ref.pathId) === String(pathId)))
			refs.push(
				...refs
					.filter((ref) => String(ref.pathId) === String(pathId))
					.map((ref) => ({ ...ref, pathId: secondId }))
			);
		route.pathRefs = refs;
	}
	return [String(pathId), secondId];
}

export function validateTopoPaths(data: FelsTopoDocument): string[] {
	const paths = data.paths;
	const ids = new Set<string>();
	const errors: string[] = [];
	for (const feature of paths?.features || []) {
		if (!feature.id || ids.has(String(feature.id)))
			errors.push(`Invalid or duplicate path id: ${feature.id}`);
		ids.add(String(feature.id));
		if (!isLineStringPath(feature))
			errors.push(`Path ${feature.id} must be a valid LineString feature.`);
	}
	for (const route of data.routes || [])
		for (const ref of route.pathRefs || []) {
			if (!ids.has(String(ref.pathId)))
				errors.push(`Route ${route.id} references missing path ${ref.pathId}.`);
		}
	return errors;
}
