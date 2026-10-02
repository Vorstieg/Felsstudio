import type {
	AccessCollection,
	CragEditorSession,
	CragHistoryEntry,
	FelsEntryWorkspace,
	HierarchyValidationError,
	MetadataTarget,
	MetadataValue,
	PendingImage,
	WorkspaceEditorSnapshot
} from '$lib/types/crag';
import type {
	EntryKind,
	FelsEntry,
	FelsProperties,
	FelsTopoDocument,
	PointOrAreaGeometry,
	Route
} from '@vorstieg/fels-types/types';
import { getContext, setContext } from 'svelte';
import { workspaceNodeDocumentPaths, workspaceNodePath } from '$lib/assets/js/workspace-paths.ts';

export const CRAG_EDITOR_SESSION = Symbol('crag-editor-session');
export const provideCragEditorSession = (session: CragEditorSession) => (
	setContext(CRAG_EDITOR_SESSION, session),
	session
);
export function getCragEditorSession(): CragEditorSession {
	const session = getContext<CragEditorSession>(CRAG_EDITOR_SESSION);
	if (!session) throw new Error('Crag editor session is not available in this component tree');
	return session;
}
export function createFelsEntry(
	kind: EntryKind,
	properties: Partial<FelsProperties> = {}
): FelsEntry {
	const date = new Date().toISOString().slice(0, 10);
	return {
		type: 'Feature',
		properties: {
			id: '',
			name: '',
			type: [],
			tags: [],
			security: '',
			rock_type: '',
			description_de: '',
			description_en: '',
			equipment: [],
			topo: { site: '', link: '' },
			date,
			updated: date,
			...properties,
			kind
		},
		geometry: { type: 'Point', coordinates: [16.37, 48.21] } as PointOrAreaGeometry
	};
}
export const createInitialAccess = (): AccessCollection => ({
	type: 'FeatureCollection',
	version: 1,
	features: []
});
export const workspaceEntryPath = workspaceNodePath;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
export const snapshotFelsEntryWorkspace = (
	node: FelsEntryWorkspace | null
): FelsEntryWorkspace | null => {
	if (!node) return null;
	const { pendingImages: _pendingImages, childEntries, ...snapshot } = node;
	return {
		...clone(snapshot),
		childEntries: childEntries.map(snapshotFelsEntryWorkspace) as FelsEntryWorkspace[]
	};
};
/** Draft storage cannot retain File objects, so omit descriptors for uploads not on the server. */
export const snapshotDraftWorkspace = (
	node: FelsEntryWorkspace | null
): FelsEntryWorkspace | null => {
	const snapshot = snapshotFelsEntryWorkspace(node);
	if (!snapshot) return null;
	const discardUnsavedImages = (entry: FelsEntryWorkspace) => {
		entry.images = (entry.images || []).filter((image) => !image.clientId || image.sourcePath);
		entry.childEntries.forEach(discardUnsavedImages);
	};
	discardUnsavedImages(snapshot);
	return snapshot;
};
function find(node: FelsEntryWorkspace | null, path?: string | null): FelsEntryWorkspace | null {
	if (!node || !path) return null;
	if (workspaceEntryPath(node) === path.replace(/^\/+|\/+$/g, '')) return node;
	for (const child of node.childEntries) {
		const match = find(child, path);
		if (match) return match;
	}
	return null;
}
const remap = (value: string, from: string, to: string) =>
	from === ''
		? [to, value].filter(Boolean).join('/')
		: value === from
			? to
			: value.startsWith(`${from}/`)
				? `${to}${value.slice(from.length)}`
				: value;
export const createImageToken = () =>
	globalThis.crypto?.randomUUID?.() ||
	`${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const canonical = (node: FelsEntryWorkspace, name: 'entry' | 'topo' | 'access') =>
	workspaceNodeDocumentPaths(node)[name];

const entryId = (node: FelsEntryWorkspace) =>
	String(node.entry ? (node.entry.properties.id ?? '') : (node.id ?? ''));
const validEntryId = (id: string) =>
	id.trim() === id && id !== '' && id !== '.' && id !== '..' && !/[\\/]/.test(id);
const invalidIdError = (key: string, kind: EntryKind, id: string): HierarchyValidationError => ({
	key,
	kind,
	message: `Invalid entry ID “${id}”. Use a nonempty folder name without slashes.`
});
const duplicateIdError = (
	key: string,
	kind: EntryKind,
	parentPath: string,
	id: string
): HierarchyValidationError => ({
	key,
	kind,
	message: `Duplicate child ID “${id}” under ${parentPath}.`
});

export function validateWorkspaceHierarchy(
	root: FelsEntryWorkspace | null
): HierarchyValidationError[] {
	if (!root) return [];
	const errors: HierarchyValidationError[] = [];
	const visit = (node: FelsEntryWorkspace) => {
		const id = entryId(node);
		const key = workspaceEntryPath(node);
		const kind = node.entry?.properties.kind || 'area';
		// A move across top-level folders uses an empty, path-only root to hold both branches.
		if (!(node === root && !node.entry && !id) && !validEntryId(id))
			errors.push(invalidIdError(key, kind, id));
		const seen = new Set<string>();
		for (const child of node.childEntries) {
			const childId = entryId(child);
			if (seen.has(childId))
				errors.push(
					duplicateIdError(
						workspaceEntryPath(child),
						child.entry?.properties.kind || 'area',
						key,
						childId
					)
				);
			seen.add(childId);
			visit(child);
		}
	};
	visit(root);
	return errors;
}

function markRelocatedNode(node: FelsEntryWorkspace, oldPath: string) {
	if (!node.entry) return;
	if (node.modelPath) {
		node.modelSourcePath ||= node.modelPath;
		node.modelPath = workspaceNodeDocumentPaths(node).model;
	}
	node.images = (node.images || []).map((image) => {
		const sourcePath = image.sourcePath || (image.clientId ? undefined : image.path);
		const filename = image.path.split('/').at(-1) || '';
		const oldId = oldPath.split('/').at(-1) || '';
		const renamed = filename.startsWith(`${oldId}-image`)
			? `${node.entry?.properties.id}${filename.slice(oldId.length)}`
			: filename;
		return { ...image, sourcePath, path: `${workspaceEntryPath(node)}/${renamed}` };
	});
	node.auxiliaryFiles = (node.auxiliaryFiles || []).map((file) => {
		return `${workspaceEntryPath(node)}/${file.split('/').at(-1)}`;
	});
	const documents: Array<'entry' | 'topo' | 'access'> = ['entry'];
	if (node.topo) documents.push('topo');
	if (node.access) documents.push('access');
	for (const name of documents)
		if (!node.dirtyPaths.includes(canonical(node, name)))
			node.dirtyPaths.push(canonical(node, name));
}

export function createCragEditorSession(): CragEditorSession {
	const uploads = new Map<string, PendingImage[]>();
	const ensureClientId = (node: FelsEntryWorkspace) => (node.clientId ||= createImageToken());
	const visibleUploads = (node: FelsEntryWorkspace) => {
		const imageIds = new Set((node.images || []).map((image) => image.clientId));
		return (uploads.get(ensureClientId(node)) || []).filter((image) =>
			imageIds.has(image.clientId)
		);
	};
	const reattachUploads = (node: FelsEntryWorkspace | null) => {
		if (!node) return;
		node.pendingImages = visibleUploads(node);
		node.childEntries.forEach(reattachUploads);
	};
	const snapshot = (s: CragEditorSession): WorkspaceEditorSnapshot => ({
		workspace: snapshotFelsEntryWorkspace(s.workspace),
		activeWorkspaceEntryPath: s.activeWorkspaceEntryPath,
		activeMetadataTarget: s.activeMetadataTarget
	});
	const session = $state({
		workspace: null as FelsEntryWorkspace | null,
		activeWorkspaceEntryPath: null as string | null,
		activeMetadataTarget: null as MetadataTarget | null,
		selectedRouteKey: null as string | null,
		identityError: null as HierarchyValidationError | null,
		history: { entries: [] as CragHistoryEntry[], index: -1 },
		commit(label: string, mutator: () => void) {
			const before = snapshot(this);
			mutator();
			const after = snapshot(this);
			if (JSON.stringify(before) === JSON.stringify(after)) return false;
			if (this.history.index < this.history.entries.length - 1)
				this.history.entries = this.history.entries.slice(0, this.history.index + 1);
			this.history.entries.push({ label, before, after });
			if (this.history.entries.length > 50) this.history.entries.shift();
			this.history.index = this.history.entries.length - 1;
			return true;
		},
		clearHistory() {
			this.history = { entries: [], index: -1 };
		},
		restoreSnapshot(v: WorkspaceEditorSnapshot) {
			this.workspace = v.workspace;
			reattachUploads(this.workspace);
			this.activeWorkspaceEntryPath = v.activeWorkspaceEntryPath;
			this.activeMetadataTarget = v.activeMetadataTarget;
			this.identityError = null;
		},
		undo() {
			if (session.history.index < 0) return false;
			session.restoreSnapshot(session.history.entries[session.history.index--].before);
			return true;
		},
		redo() {
			if (session.history.index >= session.history.entries.length - 1) return false;
			session.restoreSnapshot(session.history.entries[++session.history.index].after);
			return true;
		},
		get canUndo() {
			return this.history.index >= 0;
		},
		get canRedo() {
			return this.history.index < this.history.entries.length - 1;
		},
		reset() {
			for (const pending of uploads.values())
				pending.forEach((image) => URL.revokeObjectURL(image.previewUrl));
			uploads.clear();
			this.workspace = null;
			this.activeWorkspaceEntryPath = null;
			this.activeMetadataTarget = null;
			this.selectedRouteKey = null;
			this.identityError = null;
			this.history = { entries: [], index: -1 };
		},
		addPendingImage(node: FelsEntryWorkspace, image: PendingImage) {
			const id = ensureClientId(node);
			const pending = uploads.get(id) || [];
			pending.push(image);
			uploads.set(id, pending);
			node.pendingImages = visibleUploads(node);
		},
		removePendingImage(node: FelsEntryWorkspace, imageId: string) {
			const pending = uploads.get(ensureClientId(node)) || [];
			const index = pending.findIndex((image) => image.clientId === imageId);
			if (index < 0) return false;
			URL.revokeObjectURL(pending[index].previewUrl);
			pending.splice(index, 1);
			node.pendingImages = visibleUploads(node);
			return true;
		},
		getPendingImages(node: FelsEntryWorkspace) {
			return visibleUploads(node);
		},
		getWorkspaceEntry(path = session.activeWorkspaceEntryPath) {
			return find(session.workspace, path);
		},
		getWorkspaceEntryPath(node: FelsEntryWorkspace) {
			return workspaceEntryPath(node);
		},
		getActiveWorkspaceEntry() {
			return this.getWorkspaceEntry();
		},
		getActiveEntry() {
			return this.getWorkspaceEntry()?.entry || null;
		},
		getActiveSectors() {
			return this.getWorkspaceEntry()?.childEntries || [];
		},
		getWorkspaceTopo(path: string) {
			return this.getWorkspaceEntry(path)?.topo || null;
		},
		getWorkspaceAccess(path = session.activeWorkspaceEntryPath) {
			return this.getWorkspaceEntry(path)?.access || null;
		},
		markWorkspaceDirty(path: string, workspacePath = session.activeWorkspaceEntryPath) {
			const node =
				this.getWorkspaceEntry(workspacePath) || find(this.workspace, path.replace(/\/[^/]+$/, ''));
			if (node && !node.dirtyPaths.includes(path)) node.dirtyPaths.push(path);
		},
		updateWorkspaceEntry(
			updater: (entry: FelsEntry) => void,
			path = session.activeWorkspaceEntryPath
		) {
			const node = this.getWorkspaceEntry(path);
			if (!node?.entry) return null;
			this.commit('Update entry metadata', () => {
				updater(node.entry!);
				this.markWorkspaceDirty(canonical(node, 'entry'), workspaceEntryPath(node));
			});
			return node.entry;
		},
		updateWorkspaceTopo(
			path: string,
			updater: (topo: FelsTopoDocument) => void,
			workspacePath = session.activeWorkspaceEntryPath
		) {
			const node =
				this.getWorkspaceEntry(workspacePath) || find(this.workspace, path.replace(/\/[^/]+$/, ''));
			if (!node?.topo) return null;
			this.commit('Update topo document', () => {
				updater(node.topo!);
				this.markWorkspaceDirty(path, workspaceEntryPath(node));
			});
			return node.topo;
		},
		updateWorkspaceAccess(
			path: string,
			updater: (access: AccessCollection) => void,
			workspacePath = session.activeWorkspaceEntryPath
		) {
			const node = this.getWorkspaceEntry(workspacePath);
			if (!node?.access) return null;
			this.commit('Update access document', () => {
				updater(node.access!);
				this.markWorkspaceDirty(path, workspaceEntryPath(node));
			});
			return node.access;
		},
		materializeWorkspaceEntry(path: string, kind: EntryKind = 'area') {
			const node = this.getWorkspaceEntry(path);
			if (!node) return null;
			if (node.entry) return node.entry;
			const id = node.id || path.split('/').filter(Boolean).at(-1) || '';
			this.commit('Create hierarchy entry', () => {
				node.entry = createFelsEntry(kind, {
					id,
					name: id
				});
				const parent = node.path ? this.getWorkspaceEntry(node.path)?.entry : null;
				if (parent?.geometry) node.entry.geometry = clone(parent.geometry);
				node.id = id;
				this.markWorkspaceDirty(canonical(node, 'entry'), workspaceEntryPath(node));
			});
			return node.entry;
		},
		createWorkspaceEntry(entry: FelsEntry, parentPath = session.activeWorkspaceEntryPath) {
			const parent = this.getWorkspaceEntry(parentPath);
			if (!parent) return null;
			const id = String(entry.properties.id || '');
			if (!validEntryId(id) || parent.childEntries.some((child) => entryId(child) === id)) {
				const parentPath = workspaceEntryPath(parent);
				const kind = parent.entry?.properties.kind || 'area';
				this.identityError = !validEntryId(id)
					? invalidIdError(parentPath, kind, id)
					: duplicateIdError(parentPath, kind, parentPath, id);
				return null;
			}
			const node: FelsEntryWorkspace = {
				entry,
				id: entry.properties.id,
				path: workspaceEntryPath(parent),
				childEntries: [],
				topo: null,
				access: null,
				dirtyPaths: [],
				removedPaths: [],
				images: [],
				pendingImages: [],
				documentsLoaded: true,
				detailsLoaded: true
			};
			this.commit('Create entry', () => {
				parent.childEntries.push(node);
				this.markWorkspaceDirty(canonical(node, 'entry'), workspaceEntryPath(node));
			});
			this.identityError = null;
			return node;
		},
		removeWorkspaceEntry(path: string) {
			let removed = false;
			const visit = (node: FelsEntryWorkspace): boolean => {
				const index = node.childEntries.findIndex((child) => workspaceEntryPath(child) === path);
				if (index >= 0) {
					const removedNode = node.childEntries[index];
					const removedDirectories = new Set(removedNode.removedDirectories || []);
					const collectRemovedDirectories = (candidate: FelsEntryWorkspace) => {
						if (candidate.sourcePath) removedDirectories.add(candidate.sourcePath);
						candidate.childEntries.forEach(collectRemovedDirectories);
					};
					collectRemovedDirectories(removedNode);
					node.removedDirectories ||= [];
					node.removedDirectories.push(...removedDirectories);
					node.childEntries.splice(index, 1);
					return true;
				}
				return node.childEntries.some(visit);
			};
			this.commit('Remove entry', () => {
				if (this.workspace && workspaceEntryPath(this.workspace) === path) {
					this.workspace = null;
					removed = true;
				} else if (this.workspace) removed = visit(this.workspace);
				if (removed && this.activeWorkspaceEntryPath === path) this.activeWorkspaceEntryPath = null;
			});
			return removed;
		},
		remapWorkspacePaths(entryPath: string, parentPath: string) {
			const node = this.getWorkspaceEntry(entryPath);
			if (!node) return;
			const sourceParent = this.getWorkspaceEntry(node.path);
			const destination = [parentPath, entryId(node)].filter(Boolean).join('/');
			if (
				entryPath === destination ||
				this.getWorkspaceEntry(destination) ||
				parentPath === entryPath ||
				parentPath.startsWith(`${entryPath}/`)
			)
				return;
			this.commit('Move entry', () => {
				// The picker can select a folder that was not loaded into this workspace.
				// Add path-only ancestors so the moved node stays reachable for edits and saving.
				let destinationParent = this.getWorkspaceEntry(parentPath);
				if (sourceParent && !destinationParent && this.workspace) {
					const placeholder = (path: string, id: string): FelsEntryWorkspace => ({
						entry: null,
						id,
						path,
						childEntries: [],
						topo: null,
						access: null,
						dirtyPaths: [],
						removedPaths: [],
						images: []
					});
					while (
						this.workspace &&
						workspaceEntryPath(this.workspace) !== '' &&
						parentPath !== workspaceEntryPath(this.workspace) &&
						!parentPath.startsWith(`${workspaceEntryPath(this.workspace)}/`)
					) {
						const rootPath = workspaceEntryPath(this.workspace);
						const parent = rootPath.split('/').slice(0, -1).join('/');
						const ancestor = placeholder(
							parent.split('/').slice(0, -1).join('/'),
							parent.split('/').at(-1) || ''
						);
						ancestor.childEntries.push(this.workspace);
						this.workspace = ancestor;
					}
					let branch = this.workspace;
					const rootPath = workspaceEntryPath(branch);
					for (const id of parentPath.slice(rootPath.length).split('/').filter(Boolean)) {
						const childPath = workspaceEntryPath(branch);
						let child = branch.childEntries.find((candidate) => entryId(candidate) === id);
						if (!child) {
							child = placeholder(childPath, id);
							branch.childEntries.push(child);
						}
						branch = child;
					}
					destinationParent = branch;
				}
				if (destinationParent && sourceParent && destinationParent !== sourceParent) {
					const index = sourceParent.childEntries.indexOf(node);
					if (index >= 0) sourceParent.childEntries.splice(index, 1);
					if (!destinationParent.childEntries.includes(node))
						destinationParent.childEntries.push(node);
				}
				const visit = (candidate: FelsEntryWorkspace) => {
					const oldPath = workspaceEntryPath(candidate);
					candidate.path =
						candidate === node ? parentPath : remap(candidate.path, entryPath, destination);
					candidate.dirtyPaths = candidate.dirtyPaths.map((path) =>
						remap(path, entryPath, destination)
					);
					if (oldPath !== workspaceEntryPath(candidate)) markRelocatedNode(candidate, oldPath);
					candidate.childEntries.forEach(visit);
				};
				visit(node);
				if (this.activeWorkspaceEntryPath)
					this.activeWorkspaceEntryPath = remap(
						this.activeWorkspaceEntryPath,
						entryPath,
						destination
					);
				if (this.activeMetadataTarget)
					this.activeMetadataTarget = remap(this.activeMetadataTarget, entryPath, destination);
				if (this.selectedRouteKey)
					this.selectedRouteKey = remap(this.selectedRouteKey, entryPath, destination);
			});
		},
		setActiveMetadataTarget(target: MetadataTarget | null) {
			this.activeMetadataTarget = target;
			this.identityError = null;
		},
		getMetadataTarget(target = session.activeMetadataTarget) {
			const entry = this.getWorkspaceEntry(target)?.entry;
			return entry ? ({ ...entry.properties, geometry: entry.geometry } as MetadataValue) : null;
		},
		setMetadataField(field: string, value: unknown, target = session.activeMetadataTarget) {
			const node = this.getWorkspaceEntry(target);
			if (!node?.entry) return;
			if (field !== 'id') {
				this.updateWorkspaceEntry((entry) => {
					(entry.properties as Record<string, unknown>)[field] = value;
				}, workspaceEntryPath(node));
				return;
			}
			const previousPath = workspaceEntryPath(node);
			const nextId = String(value || '');
			if (nextId === node.entry.properties.id) {
				this.identityError = null;
				return;
			}
			const parent = node.path ? this.getWorkspaceEntry(node.path) : null;
			if (
				!validEntryId(nextId) ||
				parent?.childEntries.some((child) => child !== node && entryId(child) === nextId)
			) {
				this.identityError = !validEntryId(nextId)
					? invalidIdError(previousPath, node.entry.properties.kind, nextId)
					: duplicateIdError(previousPath, node.entry.properties.kind, node.path, nextId);
				return;
			}
			this.commit('Rename entry', () => {
				node.entry!.properties.id = nextId;
				const nextPath = workspaceEntryPath(node);
				const visit = (candidate: FelsEntryWorkspace) => {
					const oldCandidatePath = workspaceEntryPath(candidate);
					candidate.path = remap(candidate.path, previousPath, nextPath);
					candidate.dirtyPaths = candidate.dirtyPaths.map((path) =>
						remap(path, previousPath, nextPath)
					);
					if (oldCandidatePath !== workspaceEntryPath(candidate))
						markRelocatedNode(candidate, oldCandidatePath);
					candidate.childEntries.forEach(visit);
				};
				node.childEntries.forEach(visit);
				if (this.activeWorkspaceEntryPath)
					this.activeWorkspaceEntryPath = remap(
						this.activeWorkspaceEntryPath,
						previousPath,
						nextPath
					);
				if (this.activeMetadataTarget)
					this.activeMetadataTarget = remap(this.activeMetadataTarget, previousPath, nextPath);
				if (this.selectedRouteKey)
					this.selectedRouteKey = remap(this.selectedRouteKey, previousPath, nextPath);
				markRelocatedNode(node, previousPath);
			});
			this.identityError = null;
		},
		setMetadataEquipment(equipment: unknown[], target = session.activeMetadataTarget) {
			this.setMetadataField('equipment', equipment, target);
		},
		updateMetadataEquipmentItem(
			index: number,
			field: string,
			value: unknown,
			target = session.activeMetadataTarget
		) {
			const equipment = [...(this.getMetadataTarget(target)?.equipment || [])] as Record<
				string,
				unknown
			>[];
			if (equipment[index]) equipment[index] = { ...equipment[index], [field]: value };
			this.setMetadataEquipment(equipment, target);
		},
		commitGeometry(target: MetadataTarget | null, geometry: PointOrAreaGeometry, label: string) {
			const node = this.getWorkspaceEntry(target);
			if (!node?.entry) return false;
			return this.commit(label, () => {
				node.entry!.geometry = geometry;
				this.markWorkspaceDirty(canonical(node, 'entry'), workspaceEntryPath(node));
			});
		},
		setCragGeometry(geometry: PointOrAreaGeometry) {
			this.commitGeometry(this.activeWorkspaceEntryPath, geometry, 'Move crag');
		},
		setCragField(field: string, value: unknown) {
			this.setMetadataField(field, value, this.activeWorkspaceEntryPath);
		},
		setEquipment(equipment: unknown[]) {
			this.setMetadataEquipment(equipment, this.activeWorkspaceEntryPath);
		},
		replaceAccessFeatures(features: unknown[]) {
			const node = this.getWorkspaceEntry();
			if (!node) return;
			if (!node.access) node.access = createInitialAccess();
			this.updateWorkspaceAccess(
				canonical(node, 'access'),
				(access) => {
					access.features = features;
				},
				workspaceEntryPath(node)
			);
		},
		updateRoute(path: string, routeId: string | number, updater: (route: Route) => void) {
			const workspacePath = find(this.workspace, path.replace(/\/[^/]+$/, ''));
			return this.updateWorkspaceTopo(
				path,
				(topo) => {
					const route = topo.routes?.find((item) => String(item.id) === String(routeId));
					if (route) updater(route);
				},
				workspacePath ? workspaceEntryPath(workspacePath) : undefined
			);
		},
		get hierarchyErrors() {
			return validateWorkspaceHierarchy(this.workspace);
		}
	}) as CragEditorSession;
	return session;
}
