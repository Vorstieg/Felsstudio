import type {
	Topo2DEditorClustering,
	Topo2DEditorDocument
} from './topo-2d-editor-initial-state.ts';

export type DraftTopoData = Topo2DEditorDocument;

export type DraftClustering = Topo2DEditorClustering;

type StoredClustering = Omit<Topo2DEditorClustering, 'cropsMap'> & {
	cropsMap?: Topo2DEditorClustering['cropsMap'];
	cropsBuffers?: Record<string, SerializedCrop>;
};

/** Data supplied by the editor alongside its topo document. */
export type DraftEditorExtras = {
	editorMode?: '2d' | '3d';
	name?: string;
	modelOffset?: [number, number, number];
	modelRotation?: [number, number, number];
	modelScale?: [number, number, number];
	scale?: number;
	canvasAspectRatio?: number;
	has3DTopoAvailable?: boolean;
	entryPath?: string;
	topoFileName?: string;
	clustering?: DraftClustering;
	glbBlob?: Blob | null;
	glbArrayBuffer?: ArrayBuffer;
	selectedRouteId?: string | null;
};

/** A complete in-memory editor session. */
export type DraftSession = DraftEditorExtras & {
	topo: DraftTopoData;
	id?: string;
	updated?: string;
};

type StoredDraftExtras = Omit<DraftEditorExtras, 'clustering'> & {
	clustering?: StoredClustering;
};

export type StoredTopoDraft = StoredDraftExtras & {
	topo: DraftTopoData;
	id: string;
	updated: string;
};

type SerializedCrop = { buffer: ArrayBuffer; type: string };

/**
 * Convert editor-only resources into data that can survive IndexedDB storage.
 * Blob URLs are intentionally resolved here because they are not durable across
 * sessions.
 */
export async function serializeDraftExtras(
	extras: DraftEditorExtras = {},
	{ fetchImpl = globalThis.fetch }: { fetchImpl?: typeof fetch } = {}
): Promise<StoredDraftExtras> {
	const serialized: StoredDraftExtras = { ...extras };

	if (typeof Blob !== 'undefined' && serialized.glbBlob instanceof Blob) {
		serialized.glbArrayBuffer = await serialized.glbBlob.arrayBuffer();
		delete serialized.glbBlob;
	}

	const clustering = serialized.clustering;
	const cropsMap = serialized.clustering?.cropsMap;
	if (!clustering || !cropsMap || Object.keys(cropsMap).length === 0) return serialized;

	const buffersByUrl = new Map<string, SerializedCrop>();
	for (const url of new Set(Object.values(cropsMap))) {
		if (typeof url !== 'string') continue;
		if (!url.startsWith('blob:')) continue;

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
			.map(([key, url]) => [key, typeof url === 'string' ? buffersByUrl.get(url) : undefined])
			.filter((entry): entry is [string, SerializedCrop] => entry[1] !== undefined)
	);

	serialized.clustering = { ...clustering, cropsBuffers };
	delete serialized.clustering.cropsMap;
	return serialized;
}

/** Restore resources that were serialized for IndexedDB. */
export function restoreDraftSession(
	session: StoredTopoDraft | null | undefined,
	{ createObjectURL = URL.createObjectURL }: { createObjectURL?: typeof URL.createObjectURL } = {}
): DraftSession | null | undefined {
	if (!session) return session;

	if (session.glbArrayBuffer instanceof ArrayBuffer) {
		session.glbBlob = new Blob([session.glbArrayBuffer], { type: 'model/gltf-binary' });
		delete session.glbArrayBuffer;
	}

	const clustering = session.clustering;
	const cropsBuffers = clustering?.cropsBuffers;
	if (clustering && cropsBuffers && Object.keys(cropsBuffers).length > 0) {
		const cropsMap: Record<string, string> = {};
		for (const [key, { buffer, type }] of Object.entries(cropsBuffers)) {
			if (buffer instanceof ArrayBuffer) {
				cropsMap[key] = createObjectURL(new Blob([buffer], { type: type || 'image/jpeg' }));
			}
		}
		session.clustering = { ...clustering, cropsMap };
		delete session.clustering.cropsBuffers;
	}

	// Resource decoding above restores the in-memory clustering representation.
	return session as DraftSession;
}
