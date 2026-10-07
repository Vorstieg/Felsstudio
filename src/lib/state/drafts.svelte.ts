import { storage } from '$lib/assets/js/storage-utils.ts';
import { topoStore } from '$lib/assets/js/db.ts';
import {
	restoreDraftSession,
	serializeDraftExtras,
	type DraftEditorExtras,
	type DraftTopoData,
	type DraftSession
} from './draft-serialization.ts';
import type { StoredTopoDraft } from '$lib/assets/js/db.ts';

const STORAGE_KEY = 'topo_drafts_v1';

export type { DraftTopoData } from './draft-serialization.ts';

export type DraftMetadata = {
	id: string;
	name: string;
	editorMode: string;
	updated: string;
	sourceEntryPath: string | null;
	sourceTopoFileName: string | null;
};

type DraftResult = { id: string; session: DraftSession; metadata: DraftMetadata };
type DraftsStore = {
	drafts: DraftMetadata[];
	load(): void;
	save(topo: DraftTopoData, id?: string | null, extra?: DraftEditorExtras): Promise<string>;
	delete(id: string): Promise<void>;
	getLatestMetadata(): DraftMetadata | null;
	getLatest(editorMode?: string | null): Promise<DraftResult | null>;
	getLatestForSource(
		editorMode: string | null | undefined,
		sourceEntryPath: string
	): Promise<DraftResult | null>;
	getById(id: string): Promise<DraftSession | null | undefined>;
};

export function isBlankTopoSession(session: DraftSession | null | undefined): boolean {
	if (!session) return true;
	const topo = session.topo;
	return (
		!session.name &&
		!topo?.description &&
		!topo?.image2D &&
		(topo?.routes || []).length === 0 &&
		(topo?.fixPoints || []).length === 0 &&
		(topo?.outlines || []).length === 0 &&
		(topo?.textLabels || []).length === 0 &&
		!session?.glbBlob &&
		!session?.glbArrayBuffer &&
		(session.clustering?.rawHits || []).length === 0
	);
}

export const draftsState = $state<DraftsStore>({
	drafts: [],

	load() {
		this.drafts = storage.get<DraftMetadata[]>(STORAGE_KEY, []) || [];
	},

	async save(topo, id = null, extra = {}) {
		const timestamp = new Date().toISOString();
		const editorMode = extra.editorMode || 'topo';
		const draftId =
			id || (topo.id ? `${editorMode}-${topo.id}` : `draft-${editorMode}-${Date.now()}`);

		const draftIndex = this.drafts.findIndex((d) => d.id === draftId);

		// Metadata only for localStorage
		const metadata = {
			id: draftId,
			name: extra.name || 'Unnamed Topo',
			editorMode,
			updated: timestamp,
			sourceEntryPath: extra.entryPath ?? null,
			sourceTopoFileName: extra.topoFileName || null
		};

		if (draftIndex >= 0) {
			this.drafts[draftIndex] = metadata;
		} else {
			this.drafts.unshift(metadata);
		}

		const extraToSave = await serializeDraftExtras(extra);

		// Save full session to IndexedDB
		const sessionToSave: StoredTopoDraft = {
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
		return (
			[...this.drafts].sort(
				(a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime()
			)[0] || null
		);
	},

	async getLatest(editorMode = null) {
		const sortedDrafts = [...this.drafts]
			.filter((draft) => !editorMode || !draft.editorMode || draft.editorMode === editorMode)
			.sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());

		for (const draft of sortedDrafts) {
			const session = await this.getById(draft.id);
			const sessionMode = session?.editorMode || draft.editorMode;
			if (session && !isBlankTopoSession(session) && (!editorMode || sessionMode === editorMode)) {
				return { id: draft.id, session, metadata: draft };
			}
		}

		return null;
	},

	async getLatestForSource(editorMode, sourceEntryPath) {
		if (!sourceEntryPath) return null;

		const sortedDrafts = [...this.drafts]
			.filter((draft) => {
				const metadataSource = draft.sourceEntryPath;
				return (
					(!editorMode || !draft.editorMode || draft.editorMode === editorMode) &&
					(!metadataSource || metadataSource === sourceEntryPath)
				);
			})
			.sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());

		for (const draft of sortedDrafts) {
			const session = await this.getById(draft.id);
			const sessionMode = session?.editorMode || draft.editorMode;
			const metadataSource = draft.sourceEntryPath;
			const sessionSource = session?.entryPath;
			const sourceMatches = metadataSource === sourceEntryPath || sessionSource === sourceEntryPath;
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
