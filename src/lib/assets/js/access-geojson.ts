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