export const ACCESS_COLLECTION_VERSION = 1;

export function createAccessCollection(features = []) {
	return {
		type: 'FeatureCollection',
		version: ACCESS_COLLECTION_VERSION,
		features
	};
}

export function createAccessId(kind) {
	const suffix =
		typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
			? crypto.randomUUID()
			: Math.random().toString(36).slice(2, 11);
	return `${kind}-${suffix}`;
}

export function createAccessFeature({
	id = createAccessId('access'),
	kind,
	geometry,
	properties = {}
}) {
	return {
		type: 'Feature',
		id,
		geometry,
		properties: { ...properties, kind }
	};
}

export function normalizeAccessCollection(data) {
	if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
		return createAccessCollection();
	}
	return createAccessCollection(
		data.features
			.filter((feature) => feature?.type === 'Feature' && feature.geometry)
			.map((feature) => ({
				...feature,
				id: feature.id || createAccessId(feature.properties?.kind || 'access'),
				properties: { ...(feature.properties || {}) }
			}))
	);
}
