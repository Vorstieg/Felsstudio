import { storage } from '$lib/assets/js/storage-utils.js';
import { topoStore } from '$lib/assets/js/db.js';

const STORAGE_KEY = 'topo_drafts_v1';
const LATEST_STORAGE_PREFIX = 'topo_latest_draft_';
const LATEST_INDEXEDDB_PREFIX = 'latest-';

function isBlankTopoSession(session) {
	const topo = session?.topo || session;
	return (
		!topo?.name &&
		!topo?.crag_id &&
		!topo?.sector_id &&
		!topo?.description &&
		!topo?.image2D &&
		(topo?.routes || []).length === 0 &&
		(topo?.fixPoints || []).length === 0 &&
		(topo?.outlines || []).length === 0 &&
		(topo?.textLabels || []).length === 0 &&
		!session?.glbBlob &&
		!session?.glbArrayBuffer &&
		(session?.clustering?.rawHits || []).length === 0
	);
}

export const draftsState = $state({
	drafts: [],

	init() {
		this.load();
	},

	load() {
		this.drafts = storage.get(STORAGE_KEY, []);
	},

	async save(topo, id = null, extra = {}) {
		const timestamp = new Date().toISOString();
		const editorMode = topo.editorMode || 'topo';
		const draftId =
			id || (topo.id ? `${editorMode}-${topo.id}` : `draft-${editorMode}-${Date.now()}`);

		const draftIndex = this.drafts.findIndex((d) => d.id === draftId);

		// Metadata only for localStorage
		const metadata = {
			id: draftId,
			name: topo.name || 'Unnamed Topo',
			editorMode,
			updated: timestamp
		};

		if (draftIndex >= 0) {
			this.drafts[draftIndex] = metadata;
		} else {
			this.drafts.unshift(metadata);
		}

		const extraToSave = { ...extra };
		if (extraToSave.glbBlob instanceof Blob) {
			extraToSave.glbArrayBuffer = await extraToSave.glbBlob.arrayBuffer();
			delete extraToSave.glbBlob;
		}

		if (
			extraToSave.clustering?.cropsMap &&
			Object.keys(extraToSave.clustering.cropsMap).length > 0
		) {
			const cropsMap = extraToSave.clustering.cropsMap;

			const urlToBuffer = new Map();
			for (const url of Object.values(cropsMap)) {
				if (typeof url === 'string' && url.startsWith('blob:') && !urlToBuffer.has(url)) {
					try {
						const resp = await fetch(url);
						urlToBuffer.set(url, {
							buffer: await resp.arrayBuffer(),
							type: resp.headers.get('content-type') || 'image/jpeg'
						});
					} catch {
						// Blob URL already dead (shouldn't happen at save time, but guard anyway)
					}
				}
			}

			const cropsBuffers = {};
			for (const [key, url] of Object.entries(cropsMap)) {
				const entry = urlToBuffer.get(url);
				if (entry) cropsBuffers[key] = entry;
			}

			extraToSave.clustering = { ...extraToSave.clustering, cropsBuffers };
			delete extraToSave.clustering.cropsMap; // don't store dead blob URLs
		}

		// Save full session to IndexedDB
		const sessionToSave = {
			topo: JSON.parse(JSON.stringify(topo)),
			...extraToSave,
			id: draftId,
			updated: timestamp
		};
		await topoStore.set(sessionToSave);
		await topoStore.set({
			...sessionToSave,
			id: `${LATEST_INDEXEDDB_PREFIX}${editorMode}`,
			sourceDraftId: draftId
		});

		// Save metadata only after IndexedDB has the full session, so reload never points at a missing draft.
		storage.set(STORAGE_KEY, this.drafts);
		storage.set(`${LATEST_STORAGE_PREFIX}${editorMode}`, draftId);

		return draftId;
	},

	async delete(id) {
		this.drafts = this.drafts.filter((d) => d.id !== id);
		storage.set(STORAGE_KEY, this.drafts);
		for (const mode of ['2d', '3d', 'path']) {
			if (storage.get(`${LATEST_STORAGE_PREFIX}${mode}`, null) === id) {
				storage.remove(`${LATEST_STORAGE_PREFIX}${mode}`);
			}
		}
		await topoStore.delete(id);
		for (const mode of ['2d', '3d', 'path']) {
			const latest = await topoStore.get(`${LATEST_INDEXEDDB_PREFIX}${mode}`);
			if (latest?.sourceDraftId === id) await topoStore.delete(`${LATEST_INDEXEDDB_PREFIX}${mode}`);
		}
	},

	getLatestMetadata() {
		return [...this.drafts].sort((a, b) => new Date(b.updated) - new Date(a.updated))[0] || null;
	},

	async getLatest(editorMode = null) {
		const latestId = editorMode ? storage.get(`${LATEST_STORAGE_PREFIX}${editorMode}`, null) : null;
		if (latestId) {
			const session = await this.getById(latestId);
			const sessionMode = session?.topo?.editorMode || session?.editorMode;
			if (session && !isBlankTopoSession(session) && (!editorMode || sessionMode === editorMode)) {
				return { id: latestId, session };
			}
		}

		if (editorMode) {
			const session = await this.getById(`${LATEST_INDEXEDDB_PREFIX}${editorMode}`);
			const sessionMode = session?.topo?.editorMode || session?.editorMode;
			if (session && !isBlankTopoSession(session) && sessionMode === editorMode) {
				return { id: session.sourceDraftId || `${LATEST_INDEXEDDB_PREFIX}${editorMode}`, session };
			}
		}

		const sortedDrafts = [...this.drafts].sort((a, b) => new Date(b.updated) - new Date(a.updated));

		for (const draft of sortedDrafts) {
			if (editorMode && draft.editorMode && draft.editorMode !== editorMode) continue;

			const session = await this.getById(draft.id);
			const sessionMode = session?.topo?.editorMode || session?.editorMode || draft.editorMode;
			if (session && !isBlankTopoSession(session) && (!editorMode || sessionMode === editorMode)) {
				return { id: draft.id, session };
			}
		}

		return null;
	},

	async getById(id) {
		const session = await topoStore.get(id);
		if (!session) return null;

		if (session.glbArrayBuffer instanceof ArrayBuffer) {
			session.glbBlob = new Blob([session.glbArrayBuffer], { type: 'model/gltf-binary' });
			delete session.glbArrayBuffer;
		}

		if (
			session.clustering?.cropsBuffers &&
			Object.keys(session.clustering.cropsBuffers).length > 0
		) {
			const cropsMap = {};
			for (const [key, { buffer, type }] of Object.entries(session.clustering.cropsBuffers)) {
				if (buffer instanceof ArrayBuffer) {
					cropsMap[key] = URL.createObjectURL(new Blob([buffer], { type: type || 'image/jpeg' }));
				}
			}
			session.clustering = { ...session.clustering, cropsMap };
			delete session.clustering.cropsBuffers;
		}

		return session;
	}
});
