import type { AccessCollection } from '$lib/types/crag.ts';

type AccessGeometry = { type: string; coordinates: unknown };
export type AccessFeature<G = unknown, P = Record<string, unknown>> = {
	type: 'Feature';
	id: string;
	geometry: G;
	properties: P;
	[key: string]: unknown;
};
type AccessFeatureInput<G, K extends string, P> = {
	id?: string;
	kind: K;
	geometry: G;
	properties: P;
};

export const ACCESS_COLLECTION_VERSION = 1;

export function createAccessCollection(features: AccessFeature[] = []): AccessCollection {
	return {
		type: 'FeatureCollection',
		version: ACCESS_COLLECTION_VERSION,
		features
	};
}

export function createAccessId(kind: string): string {
	const suffix =
		typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
			? crypto.randomUUID()
			: Math.random().toString(36).slice(2, 11);
	return `${kind}-${suffix}`;
}

export function createAccessFeature<
	const G extends AccessGeometry,
	const K extends string,
	P extends Record<string, unknown> = Record<string, never>
>({
	id = createAccessId('access'),
	kind,
	geometry,
	properties
}: AccessFeatureInput<G, K, P>): AccessFeature<G, P & { kind: K }> {
	return {
		type: 'Feature',
		id,
		geometry,
		properties: { ...properties, kind } as P & { kind: K }
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object';
}

export function normalizeAccessCollection(data: unknown): AccessCollection {
	if (!isRecord(data) || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
		return createAccessCollection();
	}
	return createAccessCollection(
		data.features
			.filter(
				(feature): feature is Record<string, unknown> =>
					isRecord(feature) && feature.type === 'Feature' && Boolean(feature.geometry)
			)
			.map((feature) => ({
				...feature,
				type: 'Feature' as const,
				geometry: feature.geometry,
				id: String(
					feature.id ||
						createAccessId(
							isRecord(feature.properties) && typeof feature.properties.kind === 'string'
								? feature.properties.kind
								: 'access'
						)
				),
				properties: isRecord(feature.properties) ? { ...feature.properties } : {}
			}))
	);
}
