import { generateId, generateSymbolId } from '$lib/assets/js/id-utils.js';

export const routeLineStyles = [
	{ id: 'red', label: 'Red' },
	{ id: 'redDashed', label: 'Red dashed' },
	{ id: 'redDotted', label: 'Red dotted' },
	{ id: 'variant', label: 'Variant' }
];

export function addPathAsset(item, document = null) {
	if (!document) throw new Error('A topo document is required to create a route path.');
	document.paths = document.paths || { type: 'FeatureCollection', features: [] };
	let pathId;
	do { pathId = generateId('path'); } while (document.paths.features.some((feature) => String(feature.id) === pathId));
	document.paths.features = [...document.paths.features, { type: 'Feature', id: pathId, properties: { name: 'Route path' }, geometry: { type: 'LineString', coordinates: [] } }];
	item.pathRefs = [...(item.pathRefs || []), { pathId, role: 'main', label: '' }];
	return pathId;
}


export function removePathAsset(item, pathId, document = null) {
	if (!document || !Array.isArray(item.pathRefs)) throw new Error('A topo document is required to remove a route path.');
	item.pathRefs = item.pathRefs.filter((ref) => String(ref.pathId) !== String(pathId));
	return pathId;
}

export function createVariant(route) {
	return {
		id: generateId('variant'),
		name: `Variant ${route.variants.length + 1}`,
		points2D: [],
		points: [],
		grade: '',
		length: 0,
		lineStyle: 'variant',
		type: 'variant'
	};
}

export function createAiFixpoint(cluster) {
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
