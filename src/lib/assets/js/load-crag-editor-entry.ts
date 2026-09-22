import type { EntryKind, FelsEntry, FelsTopoDocument } from '@vorstieg/fels-types/types';
import type { AccessCollection, FelsEntryWorkspace, LoadedCragEditorEntry } from '$lib/types/crag';
import { listDir, readJson } from '$lib/api/felslager.ts';
import { getCragEditorPath, splitEntryPath } from '$lib/assets/js/editor-entry-paths.js';
import { normalizeTopoPaths } from '$lib/assets/js/topo-document-paths.js';
import { normalizeAccessCollection } from '$lib/assets/js/access-geojson.js';
import { workspaceEntryPath, workspaceNodePath, workspaceDocumentPaths } from '$lib/assets/js/workspace-paths.ts';

export { getCragEditorPath };

function directoryItemPath(folder: string, item: { name: string; path?: string }): string {
	const path = String(item.path || '').replace(/^\/+/, '');
	// Some Felslager deployments return only `name` for a non-recursive directory
	// listing. It is relative to the requested directory, not the API root.
	return path.includes('/') ? path : `${folder}/${path || item.name}`;
}

export function getHierarchySourceRefs(entryPath: string) {
	const parts = entryPath
		.replace(/^\/+|\/+$/g, '')
		.split('/')
		.filter(Boolean);
	return parts.map((id, index) => ({ path: parts.slice(0, index).join('/'), id }));
}

function withoutLegacySectors(entry: FelsEntry): FelsEntry {
	const {
		sectors: _sectors,
		path: _path,
		...properties
	} = entry.properties as Record<string, unknown>;
	return { ...entry, properties: properties as FelsEntry['properties'] };
}

function emptyEntry(id: string, kind: EntryKind): FelsEntry {
	const date = new Date().toISOString().slice(0, 10);
	return {
		type: 'Feature',
		properties: {
			id,
			name: id,
			kind,
			type: [],
			tags: [],
			security: '',
			rock_type: '',
			description_de: '',
			description_en: '',
			equipment: [],
			topo: { site: '', link: '' },
			date,
			updated: date
		},
		geometry: { type: 'Point', coordinates: [16.37, 48.21] }
	};
}

function isMissingFileError(error: unknown): boolean {
	return error instanceof Error && /Failed to read .*: 404(?:\s|$)/.test(error.message);
}

function isRepairableEntryError(error: unknown): boolean {
	return error instanceof SyntaxError || isMissingFileError(error);
}

async function loadOptionalFiles(path: string, id: string, reader: typeof readJson) {
	const topoPaths = workspaceDocumentPaths(path, id);
	const readOptional = async <T>(file: string): Promise<T | null> => {
		try {
			return await reader<T>(file);
		} catch (error) {
			if (isMissingFileError(error)) return null;
			throw error;
		}
	};
	const [topoDocument, accessDocument] = await Promise.all([
		readOptional<FelsTopoDocument>(topoPaths.topo),
		readOptional<AccessCollection>(topoPaths.access)
	]);
	const normalized = topoDocument ? normalizeTopoPaths(topoDocument) : null;
	return {
		topo: normalized?.data || null,
		access: accessDocument ? (normalizeAccessCollection(accessDocument) as AccessCollection) : null,
		topoMigrated: normalized?.migrated || false
	};
}

async function loadWorkspaceNode(
	path: string,
	id: string,
	reader: typeof readJson,
	{
		allowMissing = false,
		loadFeature = true,
		fallbackKind
	}: { allowMissing?: boolean; loadFeature?: boolean; fallbackKind?: EntryKind } = {}
): Promise<FelsEntryWorkspace> {
	let raw: FelsEntry | null;
	let invalid = false;
	if (!loadFeature) raw = null;
	else
		try {
			raw = await reader<FelsEntry>(workspaceDocumentPaths(path, id).entry);
			invalid = !raw || !raw.properties;
		} catch (error) {
			if (!allowMissing || !isRepairableEntryError(error)) throw error;
			// A listed child folder can have no entry JSON or an empty/malformed JSON file.
			invalid = Boolean(fallbackKind);
			raw = null;
		}
	const { type: _type, properties: _properties, geometry: _geometry, ...entryExtras } = raw || {};
	const entry =
		raw && !invalid
			? withoutLegacySectors(raw)
			: invalid && fallbackKind
				? emptyEntry(id, fallbackKind)
				: null;
	return {
		entry,
		id,
		path,
		childEntries: [],
		topo: null,
		access: null,
		dirtyPaths: invalid && fallbackKind ? [workspaceDocumentPaths(path, id).entry] : [],
		sourcePath: raw || invalid ? workspaceEntryPath(path, id) : undefined,
		removedPaths: [],
		images: [],
		entryExtras,
		pendingImages: [],
		detailsLoaded: false
	};
}

function findWorkspaceNode(
	node: FelsEntryWorkspace | null,
	entryPath: string
): FelsEntryWorkspace | null {
	if (!node) return null;
	if (
		workspaceNodePath(node) === entryPath
	)
		return node;
	for (const child of node.childEntries) {
		const found = findWorkspaceNode(child, entryPath);
		if (found) return found;
	}
	return null;
}

/** Loads optional documents and one direct child layer for a selected entry. */
export async function loadFelsEntryWorkspaceDetails(
	workspace: FelsEntryWorkspace,
	entryPath: string,
	reader: typeof readJson = readJson,
	directoryReader: typeof listDir = listDir
): Promise<FelsEntryWorkspace | null> {
	const node = findWorkspaceNode(workspace, entryPath.replace(/^\/+|\/+$/g, ''));
	if (!node) return null;
	// This loader is also used when navigating within an existing editor session.
	// A second activation must retain the in-memory documents, descendants, and uploads.
	if (node.detailsLoaded) return node;
	const id = String(node.entry?.properties.id || node.id || '');
	if (!id) return node;
	if (!node.entry) {
		const loaded = await loadWorkspaceNode(node.path, id, reader, { allowMissing: true });
		node.entry = loaded.entry;
		node.entryExtras = loaded.entryExtras;
		node.sourcePath = loaded.sourcePath;
	}
	if (!node.documentsLoaded) {
		const optional = await loadOptionalFiles(node.path, id, reader);
		if (!node.topo) node.topo = optional.topo;
		if (!node.access) node.access = optional.access;
		if (optional.topoMigrated && !node.dirtyPaths.includes(workspaceDocumentPaths(node.path, id).topo))
			node.dirtyPaths.push(workspaceDocumentPaths(node.path, id).topo);
		node.documentsLoaded = true;
	}
	const folder = workspaceEntryPath(node.path, id);
	const items = await directoryReader(folder);
	const imagePrefix = `${id}-image`;
	const topoPaths = workspaceDocumentPaths(node.path, id);
	const loadedImages = items
		.filter((item) => item.type === 'file' && item.name.startsWith(imagePrefix))
		.map((item) => ({ name: item.name, path: directoryItemPath(folder, item) }));
	const model = items.find((item) => item.type === 'file' && item.name === `${id}.glb`);
	node.modelPath = model ? directoryItemPath(folder, model) : undefined;
	const managedFiles = new Set([
		topoPaths.entry.split('/').at(-1),
		topoPaths.topo.split('/').at(-1),
		topoPaths.access.split('/').at(-1),
		`${id}.glb`
	]);
	const auxiliaryFiles = items
		.filter(
			(item) =>
				item.type === 'file' && !managedFiles.has(item.name) && !item.name.startsWith(imagePrefix)
		)
		.map((item) => directoryItemPath(folder, item));
	const directories = items.filter((item) => item.type === 'dir');
	const existingChildren = new Map(
		node.childEntries.map((child) => [
			child.sourcePath || workspaceNodePath(child),
			child
		])
	);
	const children = await Promise.all(
		directories.map(async (item) => {
			const existing = existingChildren.get(workspaceEntryPath(folder, item.name));
			if (existing?.entry) return existing;
			const child = await loadWorkspaceNode(folder, item.name, reader, {
				allowMissing: true,
				fallbackKind: 'area'
			});
			const childOptional = await loadOptionalFiles(folder, item.name, reader);
			child.topo = childOptional.topo;
			child.access = childOptional.access;
			child.documentsLoaded = true;
			if (childOptional.topoMigrated)
				child.dirtyPaths.push(workspaceDocumentPaths(folder, item.name).topo);
			return child;
		})
	);
	node.images = [...loadedImages, ...(node.images || []).filter((image) => image.clientId)];
	node.auxiliaryFiles = auxiliaryFiles;
	node.childEntries = children;
	node.detailsLoaded = true;
	return node;
}

/** Initial navigation loads only the selected feature file. */
export async function loadFelsEntryWorkspace(
	entryPath: string,
	reader: typeof readJson = readJson,
): Promise<FelsEntryWorkspace | null> {
	const { path, id } = splitEntryPath(entryPath);
	if (!id) return null;
	const refs = getHierarchySourceRefs(workspaceEntryPath(path, id));
	let root: FelsEntryWorkspace | null = null;
	let parent: FelsEntryWorkspace | null = null;
	for (const [index, ref] of refs.entries()) {
		const node = await loadWorkspaceNode(ref.path, ref.id, reader, {
			allowMissing: index < refs.length - 1,
			loadFeature: index === refs.length - 1
		});
		if (parent) parent.childEntries = [node];
		else root = node;
		parent = node;
	}
	return root;
}

export async function loadCragEditorEntry(
	entryPath: string,
	reader: typeof readJson = readJson,
	directoryReader: typeof listDir = listDir
): Promise<LoadedCragEditorEntry | null> {
	const workspace = await loadFelsEntryWorkspace(entryPath, reader);
	if (workspace) await loadFelsEntryWorkspaceDetails(workspace, entryPath, reader, directoryReader);
	return workspace
		? {
				workspace,
				activeWorkspaceEntryPath: entryPath.replace(/^\/+|\/+$/g, ''),
				activeMetadataTarget: entryPath.replace(/^\/+|\/+$/g, '')
			}
		: null;
}
