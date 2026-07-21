import { generateId, generateSymbolId } from '$lib/assets/js/id-utils.js';

export const routeLineStyles = [
	{ id: 'red', label: 'Red' },
	{ id: 'redDashed', label: 'Red dashed' },
	{ id: 'redDotted', label: 'Red dotted' },
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

export function getPathAssets(item) {
	const paths = item.assets?.paths;
	if (!paths) return [];
	const list = Array.isArray(paths) ? paths : [paths];
	return list.map((asset) => {
		return {
			role: asset.role || 'main',
			label: asset.label || '',
			path: asset.path || null
		};
	});
}

export function setPathAssets(item, value) {
	item.assets = {
		...(item.assets || {}),
		paths: parseAssetList(value).map(() => ({ role: 'main', label: '', path: null }))
	};
}

export function ensurePathAssets(item) {
	item.assets = item.assets || {};
	const paths = item.assets.paths;
	const list = paths ? (Array.isArray(paths) ? paths : [paths]) : [];
	item.assets.paths = list.map((asset) => {
		return {
			...asset,
			role: asset.role || 'main',
			label: asset.label || '',
			path: asset.path || null
		};
	});
	return item.assets.paths;
}

export function addPathAsset(item) {
	const paths = ensurePathAssets(item);
	paths.push({ role: 'main', label: '', path: null });
	item.assets.paths = [...paths];
}

export function removePathAsset(item, index) {
	const paths = ensurePathAssets(item);
	paths.splice(index, 1);
	item.assets.paths = [...paths];
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
