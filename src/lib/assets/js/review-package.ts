import JSZip from 'jszip';
import type { SharedDraft } from '$lib/state/shared-draft';
import { workspaceNodes } from '$lib/state/shared-draft';
import { saveCragWorkspace } from './save-crag-workspace';
import { workspaceNodeDocumentPaths } from './workspace-paths';
import { validateWorkspaceHierarchy } from '$lib/state/crag-session.svelte';

export type ReviewAction = {
	action: 'write' | 'move' | 'delete';
	path: string;
	destination?: string;
};
type Asset = { keys: string[]; path: string; type: string; name?: string };
type ReviewPackage = { version: 1; draft: SharedDraft; assets: Asset[]; actions: ReviewAction[] };
export function validReviewPath(path: unknown): path is string {
	return (
		typeof path === 'string' &&
		path.length > 0 &&
		!path.startsWith('/') &&
		!/[\\%]/.test(path) &&
		!Array.from(path).some((character) => character.charCodeAt(0) < 32) &&
		path.split('/').every((part) => !!part && part !== '.' && part !== '..')
	);
}

/** Run the existing save algorithm against an isolated workspace to describe its operations. */
export async function reviewActions(draft: SharedDraft): Promise<ReviewAction[]> {
	const actions: ReviewAction[] = [];
	const record = (action: ReviewAction) => {
		actions.push(action);
		return Promise.resolve();
	};
	await saveCragWorkspace(structuredClone(draft.workspace), {
		rename: (path, destination) => record({ action: 'move', path, destination }),
		write: (path) => record({ action: 'write', path }),
		writeBinary: (path) => record({ action: 'write', path }),
		remove: (path) => record({ action: 'delete', path }),
		finishUpload: () => {}
	});
	for (const node of workspaceNodes(draft.workspace)) {
		const paths = workspaceNodeDocumentPaths(node);
		if (draft.contexts[node.clientId!]?.glbBlob)
			actions.push({ action: 'write', path: node.modelPath || paths.model });
		if (draft.media[node.clientId!]?.background && node.dirtyPaths.includes(paths.topo)) {
			const type = draft.media[node.clientId!].background!.type;
			const extension =
				({ 'image/jpeg': 'jpg', 'image/webp': 'webp' } as Record<string, string>)[type] || 'png';
			actions.push({
				action: 'write',
				path: paths.topo.replace(/-topo\.json$/, `-background.${extension}`)
			});
		}
	}
	for (const action of actions) {
		action.path = action.path.replace(/^\/+/, '');
		if (action.destination) action.destination = action.destination.replace(/^\/+/, '');
		if (
			!validReviewPath(action.path) ||
			(action.destination !== undefined && !validReviewPath(action.destination))
		)
			throw new Error('Invalid production path');
	}
	return actions.filter(
		(item, index) =>
			actions.findIndex((other) => JSON.stringify(other) === JSON.stringify(item)) === index
	);
}

export async function createReviewPackage(draft: SharedDraft): Promise<Blob> {
	if (!draft.placed)
		throw new Error('Choose a production location in the crag editor before submitting.');
	const errors = validateWorkspaceHierarchy(draft.workspace);
	if (errors.length) throw new Error(errors[0].message);
	const zip = new JSZip();
	const assets: Asset[] = [];
	async function encode(value: unknown, keys: string[]): Promise<unknown> {
		if (value instanceof Blob) {
			const path = `assets/${assets.length}`;
			assets.push({
				keys,
				path,
				type: value.type,
				...(value instanceof File ? { name: value.name } : {})
			});
			zip.file(path, await value.arrayBuffer());
			return null;
		}
		if (Array.isArray(value))
			return Promise.all(value.map((child, index) => encode(child, [...keys, String(index)])));
		if (value && typeof value === 'object') {
			const result: Record<string, unknown> = {};
			for (const [key, child] of Object.entries(value)) {
				if (['__proto__', 'constructor', 'prototype'].includes(key))
					throw new Error('Unsupported draft key');
				result[key] = await encode(child, [...keys, key]);
			}
			return result;
		}
		return value;
	}
	const snapshot = { ...draft };
	delete snapshot.reviewId;
	delete snapshot.reviewProductionSaved;
	const document = {
		version: 1,
		draft: await encode(snapshot, []),
		assets,
		actions: await reviewActions(draft)
	};
	zip.file('review.json', JSON.stringify(document));
	return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}

export async function openReviewPackage(
	body: Blob | ArrayBuffer,
	reviewId: string
): Promise<SharedDraft> {
	const zip = await JSZip.loadAsync(body instanceof Blob ? await body.arrayBuffer() : body);
	const document = JSON.parse(await zip.file('review.json')!.async('string')) as ReviewPackage;
	if (document.version !== 1 || !document.draft?.workspace || !Array.isArray(document.assets))
		throw new Error('Unsupported review package');
	for (const asset of document.assets) {
		if (
			!/^assets\/\d+$/.test(asset.path) ||
			!asset.keys.length ||
			asset.keys.some((key) => ['__proto__', 'constructor', 'prototype'].includes(key))
		)
			throw new Error('Invalid review asset');
		let parent: any = document.draft;
		for (const key of asset.keys.slice(0, -1)) {
			if (!Object.hasOwn(parent, key)) throw new Error('Invalid review asset reference');
			parent = parent[key];
		}
		const key = asset.keys.at(-1)!;
		if (!parent || !Object.hasOwn(parent, key) || parent[key] !== null)
			throw new Error('Invalid review asset reference');
		const bytes = await zip.file(asset.path)!.async('arraybuffer');
		parent[key] =
			asset.name === undefined
				? new Blob([bytes], { type: asset.type })
				: new File([bytes], asset.name, { type: asset.type });
	}
	document.draft.id = crypto.randomUUID();
	document.draft.reviewId = reviewId;
	delete document.draft.reviewProductionSaved;
	return document.draft;
}
