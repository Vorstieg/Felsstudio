import { storage } from '$lib/assets/js/storage-utils.js';
import { topoStore } from '$lib/assets/js/db.js';
import { restoreDraftSession, serializeDraftExtras } from './draft-serialization.js';

const STORAGE_KEY = 'topo_drafts_v1';

function normalizeSourceEntryPath(path) {
	return path ? String(path).replace(/^\/+|\/+$/g, '') : null;
}

function getSourceEntryPath(topo) {
	return normalizeSourceEntryPath(topo?._entryPath || topo?.entryPath || null);
}

export function isBlankTopoSession(session) {
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
			updated: timestamp,
			sourceEntryPath: getSourceEntryPath(topo),
			sourceTopoFileName: topo._topoFileName || null
		};

		if (draftIndex >= 0) {
			this.drafts[draftIndex] = metadata;
		} else {
			this.drafts.unshift(metadata);
		}

		const extraToSave = await serializeDraftExtras(extra);

		// Save full session to IndexedDB
		const sessionToSave = {
			topo: JSON.parse(JSON.stringify(topo)),
			...extraToSave,
			id: draftId,
			updated: timestamp
		};
		await topoStore.set(sessionToSave);

		// Save metadata only after IndexedDB has the full session, so reload never points at a missing draft.
		storage.set(STORAGE_KEY, this.drafts);

		return draftId;
	},

	async delete(id) {
		this.drafts = this.drafts.filter((d) => d.id !== id);
		storage.set(STORAGE_KEY, this.drafts);
		await topoStore.delete(id);
	},

	getLatestMetadata() {
		return [...this.drafts].sort((a, b) => new Date(b.updated) - new Date(a.updated))[0] || null;
	},

	async getLatest(editorMode = null) {
		const sortedDrafts = [...this.drafts]
			.filter((draft) => !editorMode || !draft.editorMode || draft.editorMode === editorMode)
			.sort((a, b) => new Date(b.updated) - new Date(a.updated));

		for (const draft of sortedDrafts) {
			const session = await this.getById(draft.id);
			const sessionMode = session?.topo?.editorMode || session?.editorMode || draft.editorMode;
			if (session && !isBlankTopoSession(session) && (!editorMode || sessionMode === editorMode)) {
				return { id: draft.id, session, metadata: draft };
			}
		}

		return null;
	},

	async getLatestForSource(editorMode, sourceEntryPath) {
		const normalizedSource = normalizeSourceEntryPath(sourceEntryPath);
		if (!normalizedSource) return null;

		const sortedDrafts = [...this.drafts]
			.filter((draft) => {
				const metadataSource = normalizeSourceEntryPath(draft.sourceEntryPath);
				return (
					(!editorMode || !draft.editorMode || draft.editorMode === editorMode) &&
					(!metadataSource || metadataSource === normalizedSource)
				);
			})
			.sort((a, b) => new Date(b.updated) - new Date(a.updated));

		for (const draft of sortedDrafts) {
			const session = await this.getById(draft.id);
			const sessionMode = session?.topo?.editorMode || session?.editorMode || draft.editorMode;
			const metadataSource = normalizeSourceEntryPath(draft.sourceEntryPath);
			const sessionSource = getSourceEntryPath(session?.topo || session);
			const sourceMatches =
				metadataSource === normalizedSource || sessionSource === normalizedSource;
			if (
				session &&
				!isBlankTopoSession(session) &&
				(!editorMode || sessionMode === editorMode) &&
				sourceMatches
			) {
				return { id: draft.id, session, metadata: draft };
			}
		}

		return null;
	},

	async getById(id) {
		const session = await topoStore.get(id);
		if (!session) return null;

		return restoreDraftSession(session);
	}
});
