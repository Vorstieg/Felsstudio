import { draftStore } from '$lib/assets/js/db';
import { encodeDraft, type SharedDraft } from './shared-draft';

export type DraftMetadata = Pick<SharedDraft, 'id' | 'name' | 'updated' | 'lastEditor'>;
const metadata = ({ id, name, updated, lastEditor }: SharedDraft): DraftMetadata => ({
	id,
	name,
	updated,
	lastEditor
});
let pending: Promise<unknown> = Promise.resolve();
function serial<T>(operation: () => Promise<T>) {
	const result = pending.then(operation);
	pending = result.catch(() => {});
	return result;
}
export const draftsState = $state({
	drafts: [] as DraftMetadata[],
	async load() {
		await pending;
		this.drafts = (await draftStore.list())
			.map(metadata)
			.sort((a, b) => b.updated.localeCompare(a.updated));
	},
	async get(id: string) {
		await pending;
		return draftStore.get(id);
	},
	save(draft: SharedDraft): Promise<void> {
		const snapshot = structuredClone($state.snapshot(draft));
		return serial(async () => {
			snapshot.updated = new Date().toISOString();
			await draftStore.set(await encodeDraft(snapshot));
			this.drafts = [metadata(snapshot), ...this.drafts.filter((item) => item.id !== snapshot.id)];
		});
	},
	delete(id: string): Promise<void> {
		return serial(async () => {
			await draftStore.delete(id);
			this.drafts = this.drafts.filter((item) => item.id !== id);
		});
	}
});
