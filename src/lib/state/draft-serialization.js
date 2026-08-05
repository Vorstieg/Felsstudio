/**
 * Convert editor-only resources into data that can survive IndexedDB storage.
 * Blob URLs are intentionally resolved here because they are not durable across
 * sessions.
 */
export async function serializeDraftExtras(extras = {}, { fetchImpl = globalThis.fetch } = {}) {
	const serialized = { ...extras };

	if (typeof Blob !== 'undefined' && serialized.glbBlob instanceof Blob) {
		serialized.glbArrayBuffer = await serialized.glbBlob.arrayBuffer();
		delete serialized.glbBlob;
	}

	const cropsMap = serialized.clustering?.cropsMap;
	if (!cropsMap || Object.keys(cropsMap).length === 0) return serialized;

	const buffersByUrl = new Map();
	for (const url of new Set(Object.values(cropsMap))) {
		if (typeof url !== 'string' || !url.startsWith('blob:')) continue;

		try {
			const response = await fetchImpl(url);
			buffersByUrl.set(url, {
				buffer: await response.arrayBuffer(),
				type: response.headers.get('content-type') || 'image/jpeg'
			});
		} catch {
			// A blob URL may have expired before autosave completes.
		}
	}

	const cropsBuffers = Object.fromEntries(
		Object.entries(cropsMap)
			.map(([key, url]) => [key, buffersByUrl.get(url)])
			.filter(([, entry]) => entry)
	);

	serialized.clustering = { ...serialized.clustering, cropsBuffers };
	delete serialized.clustering.cropsMap;
	return serialized;
}

/**
 * Restore resources that were serialized for IndexedDB.
 */
export function restoreDraftSession(session, { createObjectURL = URL.createObjectURL } = {}) {
	if (!session) return session;

	if (session.glbArrayBuffer instanceof ArrayBuffer) {
		session.glbBlob = new Blob([session.glbArrayBuffer], { type: 'model/gltf-binary' });
		delete session.glbArrayBuffer;
	}

	const cropsBuffers = session.clustering?.cropsBuffers;
	if (cropsBuffers && Object.keys(cropsBuffers).length > 0) {
		const cropsMap = {};
		for (const [key, { buffer, type }] of Object.entries(cropsBuffers)) {
			if (buffer instanceof ArrayBuffer) {
				cropsMap[key] = createObjectURL(new Blob([buffer], { type: type || 'image/jpeg' }));
			}
		}
		session.clustering = { ...session.clustering, cropsMap };
		delete session.clustering.cropsBuffers;
	}

	return session;
}
