// Shared Fels entry and topo contracts belong in @vorstieg/fels-types.
// Do not copy or recreate them in this repository; update the package dependency instead.
import type {
	EntryKind,
	FelsEntry,
	FelsProperties,
	FelsTopoDocument,
	PointOrAreaGeometry,
	Route
} from '@vorstieg/fels-types/types';
export type { EntryKind };
export type CragId = string;
export type AccessCollection = {
	type: 'FeatureCollection';
	version?: number;
	features: unknown[];
	[key: string]: unknown;
};
export type FelsEntryWorkspace = {
	entry: FelsEntry | null;
	/** Folder ID retained when the corresponding entry file does not yet exist. */
	id?: string;
	path: string;
	childEntries: FelsEntryWorkspace[];
	clientId?: string;
	topo: FelsTopoDocument | null;
	access: AccessCollection | null;
	dirtyPaths: string[];
	/** Original persisted entry location; absent for entries created in this session. */
	sourcePath?: string;
	/** Persisted files to remove after their replacement has been written. */
	removedPaths: string[];
	/** Empty entry directories to remove after their contents are deleted. */
	removedDirectories?: string[];
	entryExtras?: Record<string, unknown>;
	/** Image files discovered in this entry's folder. */
	images: Array<{ name: string; path: string; sourcePath?: string; clientId?: string }>;
	/** Persisted 3D model discovered in this entry's folder. */
	modelPath?: string;
	/** Current server path of a model awaiting relocation. */
	modelSourcePath?: string;
	/** Other persisted files in this entry's folder (for example topo backgrounds). */
	auxiliaryFiles?: string[];
	/** Browser-only uploads and previews; never serialized or included in history snapshots. */
	pendingImages?: Array<PendingImage | null>;
	/** Optional documents and direct children have been loaded for this node. */
	detailsLoaded?: boolean;
	/** Topo and access documents have been loaded, even if the optional files were absent. */
	documentsLoaded?: boolean;
};
export type FelsEntryWorkspaceSnapshot = {
	workspace: FelsEntryWorkspace | null;
	activeWorkspaceEntryPath: string | null;
	activeMetadataTarget: string | null;
};
export type WorkspaceEditorSnapshot = FelsEntryWorkspaceSnapshot;
export type CragHistoryEntry = {
	label: string;
	before: WorkspaceEditorSnapshot;
	after: WorkspaceEditorSnapshot;
};
export type MetadataTarget = string;
export type MetadataValue = FelsProperties;
export type HierarchyValidationError = { key: string; message: string; kind: EntryKind };
export type PendingImage = { file: File; previewUrl: string; path: string; clientId: string };
export type CragEditorSession = WorkspaceEditorSnapshot & {
	selectedRouteKey: string | null;
	identityError: HierarchyValidationError | null;
	history: { entries: CragHistoryEntry[]; index: number };
	commit(label: string, mutator: () => void): boolean;
	clearHistory(): void;
	restoreSnapshot(value: WorkspaceEditorSnapshot): void;
	undo(): boolean;
	redo(): boolean;
	readonly canUndo: boolean;
	readonly canRedo: boolean;
	reset(): void;
	addPendingImage(node: FelsEntryWorkspace, image: PendingImage): void;
	removePendingImage(node: FelsEntryWorkspace, imageId: string): boolean;
	getPendingImages(node: FelsEntryWorkspace): PendingImage[];
	getWorkspaceEntry(path?: string | null): FelsEntryWorkspace | null;
	getWorkspaceEntryPath(node: FelsEntryWorkspace): string;
	getActiveWorkspaceEntry(): FelsEntryWorkspace | null;
	getActiveEntry(): FelsEntry | null;
	getActiveSectors(): FelsEntryWorkspace[];
	getWorkspaceTopo(path: string): FelsTopoDocument | null;
	getWorkspaceAccess(path?: string | null): AccessCollection | null;
	markWorkspaceDirty(path: string, workspaceEntryPath?: string | null): void;
	updateWorkspaceEntry(updater: (entry: FelsEntry) => void, path?: string | null): FelsEntry | null;
	updateWorkspaceTopo(
		path: string,
		updater: (topo: FelsTopoDocument) => void,
		workspaceEntryPath?: string | null
	): FelsTopoDocument | null;
	updateWorkspaceAccess(
		path: string,
		updater: (access: AccessCollection) => void,
		workspaceEntryPath?: string | null
	): AccessCollection | null;
	materializeWorkspaceEntry(path: string, kind?: EntryKind): FelsEntry | null;
	createWorkspaceEntry(entry: FelsEntry, parentPath?: string | null): FelsEntryWorkspace | null;
	removeWorkspaceEntry(path: string): boolean;
	remapWorkspacePaths(entryPath: string, parentPath: string): void;
	setActiveMetadataTarget(target: MetadataTarget | null): void;
	getMetadataTarget(target?: MetadataTarget | null): MetadataValue | null;
	setMetadataField(field: string, value: unknown, target?: MetadataTarget | null): void;
	setMetadataEquipment(equipment: unknown[], target?: MetadataTarget | null): void;
	updateMetadataEquipmentItem(
		index: number,
		field: string,
		value: unknown,
		target?: MetadataTarget | null
	): void;
	commitGeometry(
		target: MetadataTarget | null,
		geometry: PointOrAreaGeometry,
		label: string
	): boolean;
	setCragGeometry(geometry: PointOrAreaGeometry): void;
	setCragField(field: keyof FelsProperties | string, value: unknown): void;
	setEquipment(equipment: unknown[]): void;
	replaceAccessFeatures(features: unknown[]): void;
	updateRoute(
		path: string,
		routeId: string | number,
		updater: (route: Route) => void
	): FelsTopoDocument | null;
	readonly hierarchyErrors: HierarchyValidationError[];
};
export type LoadedCragEditorEntry = FelsEntryWorkspaceSnapshot;
