import { downloadResultFile } from '$lib/api/processing';
import type { SharedDraft } from '$lib/state/shared-draft';

export const processingCropSource = (id: string, path: string) =>
	`processing-crop:${encodeURIComponent(id)}:${encodeURIComponent(path)}`;

/** Two background requests leave room for visible crops. A task is shared by all its consumers. */
export function createProcessingAssetLoader(
	draft: Pick<SharedDraft, 'processingImports'>,
	onCached?: (nodeId: string, files: Record<string, Blob>) => void
) {
	type Task = {
		id: string;
		path: string;
		nodes: string[];
		blob?: Blob;
		promise?: Promise<Blob>;
		resolve?: (blob: Blob) => void;
		reject?: (error: unknown) => void;
		priority: boolean;
	};
	const tasks = new Map<string, Task>();
	const queue: Task[] = [];
	let active = 0;
	let background = 0;
	let stopped = false;
	for (const [nodeId, result] of Object.entries(draft.processingImports || {})) {
		for (const path of new Set([...Object.keys(result.files), ...(result.pendingFiles || [])])) {
			const source = processingCropSource(result.processingId, path);
			const task = tasks.get(source) || {
				id: result.processingId,
				path,
				nodes: [],
				priority: false
			};
			task.nodes.push(nodeId);
			task.blob ||= result.files[path];
			tasks.set(source, task);
		}
	}
	function pump() {
		while (!stopped && active < 4) {
			let index = queue.findIndex((task) => task.priority);
			if (index < 0) {
				if (background >= 2) return;
				index = 0;
			}
			const task = queue.splice(index, 1)[0];
			if (!task) return;
			const lowPriority = !task.priority;
			active++;
			if (lowPriority) background++;
			void downloadResultFile(task.id, task.path)
				.then(
					(blob) => {
						task.blob = blob;
						for (const nodeId of task.nodes) onCached?.(nodeId, { [task.path]: blob });
						task.resolve!(blob);
					},
					(error) => {
						task.reject!(error);
						task.promise = undefined; // A visible crop can retry a failed background request.
					}
				)
				.finally(() => {
					active--;
					if (lowPriority) background--;
					pump();
				});
		}
	}
	function load(source: string, priority = true): Promise<Blob> {
		const task = tasks.get(source);
		if (!task) return Promise.reject(new Error('Unknown processing asset'));
		if (task.blob) return Promise.resolve(task.blob);
		if (stopped) return Promise.reject(new Error('Image loading stopped'));
		if (priority) task.priority = true;
		if (!task.promise) {
			task.promise = new Promise((resolve, reject) => {
				task.resolve = resolve;
				task.reject = reject;
			});
			queue.push(task);
		}
		pump();
		return task.promise;
	}
	return {
		load,
		start() {
			for (const source of tasks.keys()) void load(source, false).catch(() => {});
		},
		async complete() {
			await Promise.all([...tasks.keys()].map((source) => load(source, false)));
			for (const task of tasks.values())
				for (const nodeId of task.nodes) {
					const result = draft.processingImports![nodeId];
					result.files[task.path] = task.blob!;
					result.pendingFiles = result.pendingFiles?.filter((path) => path !== task.path);
				}
		},
		stop() {
			stopped = true;
			for (const task of queue.splice(0)) task.reject!(new Error('Image loading stopped'));
		}
	};
}

/** Preserve imported drafts before their backend result is removed. Merge only assets, never editor data. */
export async function preserveProcessingImports(processingId: string) {
	const { draftsState } = await import('$lib/state/drafts.svelte');
	await draftsState.load();
	for (const metadata of draftsState.drafts) {
		const saved = await draftsState.get(metadata.id);
		for (const [nodeId, result] of Object.entries(saved?.processingImports || {})) {
			if (result.processingId !== processingId || !result.pendingFiles?.length) continue;
			const loader = createProcessingAssetLoader({ processingImports: { [nodeId]: result } });
			await loader.complete();
			await draftsState.cacheProcessingFiles(metadata.id, nodeId, processingId, result.files);
		}
	}
}
