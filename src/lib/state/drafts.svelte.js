import { storage } from '$lib/assets/js/storage-utils.js';
import { topoStore } from '$lib/assets/js/db.js';

const STORAGE_KEY = 'topo_drafts_v1';

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
		const draftId = id || topo.id || `draft-${Date.now()}`;

		const draftIndex = this.drafts.findIndex((d) => d.id === draftId);

		// Metadata only for localStorage
		const metadata = {
			id: draftId,
			name: topo.name || 'Unnamed Topo',
			updated: timestamp
		};

		if (draftIndex >= 0) {
			this.drafts[draftIndex] = metadata;
		} else {
			this.drafts.unshift(metadata);
		}

		// Save metadata to localStorage
		storage.set(STORAGE_KEY, this.drafts);

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

		return draftId;
	},

	async delete(id) {
		this.drafts = this.drafts.filter((d) => d.id !== id);
		storage.set(STORAGE_KEY, this.drafts);
		await topoStore.delete(id);
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
