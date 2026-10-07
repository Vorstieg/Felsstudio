import type { FixPoint, Route, Variant } from '@vorstieg/fels-types/types';
import { generateId, generateSymbolId } from '$lib/assets/js/id-utils.ts';

export const routeLineStyles = [
	{ id: 'red', label: 'Red' },
	{ id: 'redDashed', label: 'Red dashed' },
	{ id: 'redDotted', label: 'Red dotted' },
	{ id: 'variant', label: 'Variant' }
] as const;

type PathAssetItem = Pick<Route, 'pathRefs'>;
type PathAssetDocument = {
	paths?: {
		type: 'FeatureCollection';
		features: Array<{ id?: string | number; [key: string]: unknown }>;
	};
};

export function addPathAsset(
	item: PathAssetItem,
	document: PathAssetDocument | null = null
): string {
	if (!document) throw new Error('A topo document is required to create a route path.');
	document.paths = document.paths || { type: 'FeatureCollection', features: [] };
	let pathId: string;
	do {
		pathId = generateId('path');
	} while (document.paths.features.some((feature) => String(feature.id) === pathId));
	document.paths.features = [
		...document.paths.features,
		{
			type: 'Feature',
			id: pathId,
			properties: { name: 'Route path' },
			geometry: { type: 'LineString', coordinates: [] }
		}
	];
	item.pathRefs = [...(item.pathRefs || []), { pathId, role: 'main', label: '' }];
	return pathId;
}

export function removePathAsset(
	item: PathAssetItem,
	pathId: string | number,
	document: PathAssetDocument | null = null
): string | number {
	if (!document || !Array.isArray(item.pathRefs))
		throw new Error('A topo document is required to remove a route path.');
	item.pathRefs = item.pathRefs.filter((ref) => String(ref.pathId) !== String(pathId));
	return pathId;
}

export function createVariant(
	route: Pick<Route, 'variants'>
): Variant & { name: string; grade: null; length: number; points: never[]; type: 'variant' } {
	return {
		id: generateId('variant'),
		name: `Variant ${(route.variants?.length ?? 0) + 1}`,
		points: [],
		grade: null,
		length: 0,
		lineStyle: 'variant',
		type: 'variant'
	};
}

type AiCluster = {
	class: string;
	anchor: number[];
	conf: number;
	members: readonly unknown[];
};

export function createAiFixpoint(cluster: AiCluster): FixPoint & {
	position: number[];
	meta: {
		ai_source: true;
		confidence: number;
		observations: number;
		original_class: string;
	};
} {
	const type = cluster.class === 'anchor' || cluster.class === 'belay' ? 'belay' : 'bolt';

	return {
		id: generateSymbolId(),
		type,
		position: [...cluster.anchor],
		meta: {
			ai_source: true,
			confidence: cluster.conf,
			observations: cluster.members.length,
			original_class: cluster.class
		}
	};
}
