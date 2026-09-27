/** Simple IndexedDB wrapper for storing topo drafts. */
import type { StoredTopoDraft } from '$lib/state/draft-serialization.ts';
export type { StoredTopoDraft } from '$lib/state/draft-serialization.ts';

const DB_NAME = 'TopoCreatorDB';
const DB_VERSION = 1;
const STORE_NAME = 'topos';

function openDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		if (typeof indexedDB === 'undefined') {
			reject(new Error('IndexedDB is not supported'));
			return;
		}

		const request = indexedDB.open(DB_NAME, DB_VERSION);

		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME, { keyPath: 'id' });
			}
		};

		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

function wrap<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

export const topoStore = {
	async get(id: string): Promise<StoredTopoDraft | null> {
		try {
			const db = await openDB();
			const tx = db.transaction(STORE_NAME, 'readonly');
			const store = tx.objectStore(STORE_NAME);
			return ((await wrap(store.get(id))) as StoredTopoDraft | undefined) ?? null;
		} catch (e) {
			console.error('IndexedDB Error (get):', e);
			return null;
		}
	},

	async set(topo: StoredTopoDraft): Promise<void> {
		try {
			const db = await openDB();
			const tx = db.transaction(STORE_NAME, 'readwrite');
			const store = tx.objectStore(STORE_NAME);
			await wrap(store.put(topo));
		} catch (e) {
			console.error('IndexedDB Error (set):', e);
			throw e;
		}
	},

	async delete(id: string): Promise<void> {
		try {
			const db = await openDB();
			const tx = db.transaction(STORE_NAME, 'readwrite');
			const store = tx.objectStore(STORE_NAME);
			await wrap(store.delete(id));
		} catch (e) {
			console.error('IndexedDB Error (delete):', e);
		}
	}
};
