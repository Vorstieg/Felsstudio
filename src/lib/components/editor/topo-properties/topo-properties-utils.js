import { generateId, generateSymbolId } from '$lib/assets/js/id-utils.js';

export const routeLineStyles = [
	{ id: 'red', label: 'Red' },
	{ id: 'redDashed', label: 'Red dashed' },
	{ id: 'variant', label: 'Variant' }
];

export const outlineLineStyles = [
	{ id: 'rock', label: 'Rock outline' },
	{ id: 'approach', label: 'Approach' },
	{ id: 'descent', label: 'Descent' },
	{ id: 'variant', label: 'Variant' },
	{ id: 'fixedRope', label: 'Fixed rope' }
];

export function parseAssetList(value) {
	return value
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);
}

export function getGpxAssets(item) {
	const gpx = item.assets?.gpx;
	if (!gpx) return [];
	return Array.isArray(gpx) ? gpx : [gpx];
}

export function setGpxAssets(item, value) {
	item.assets = {
		...(item.assets || {}),
		gpx: parseAssetList(value)
	};
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
