import type { SharedDraft } from '$lib/state/shared-draft';

// A fresh database intentionally ignores all previous draft formats.
const DB_NAME = 'FelsstudioDraftSessions';
const STORE_NAME = 'drafts';

async function transact<T>(
	mode: IDBTransactionMode,
	action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
	const db = await new Promise<IDBDatabase>((resolve, reject) => {
		if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB is not supported'));
		const request = indexedDB.open(DB_NAME, 1);
		request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
	return new Promise((resolve, reject) => {
		const transaction = db.transaction(STORE_NAME, mode);
		let request: IDBRequest<T>;
		try {
			request = action(transaction.objectStore(STORE_NAME));
		} catch (error) {
			transaction.abort();
			db.close();
			reject(error);
			return;
		}
		transaction.oncomplete = () => {
			db.close();
			resolve(request.result);
		};
		transaction.onabort = () => {
			db.close();
			reject(transaction.error || request.error || new Error('Draft transaction aborted'));
		};
		transaction.onerror = () => {
			/* onabort reports the failed transaction */
		};
	});
}

export const draftStore = {
	async get(id: string): Promise<SharedDraft | null> {
		return (await transact('readonly', (store) => store.get(id))) ?? null;
	},
	async list(): Promise<SharedDraft[]> {
		return transact('readonly', (store) => store.getAll());
	},
	async set(draft: SharedDraft): Promise<void> {
		await transact('readwrite', (store) => store.put(draft));
	},
	async delete(id: string): Promise<void> {
		await transact('readwrite', (store) => store.delete(id));
	}
};
