import type {
	CragProperties,
	EntryKind,
	GeoJSONGeometry,
	SectorProperties,
	TopoDocument
} from '@vorstieg/fels-data/types';

export type CragId = string;
export type SectorId = string;

export type CragSector = SectorProperties & {
	geometry?: GeoJSONGeometry;
	hash?: unknown;
};

export type EditableCrag = Omit<CragProperties, 'sectors'> & {
	/** Runtime storage parent; derived from the opened entry path and never persisted in feature metadata. */
	path: string;
	geometry: GeoJSONGeometry;
	sectors: CragSector[];
};

export type AccessCollection = {
	type: 'FeatureCollection';
	version?: number;
	features: unknown[];
	[key: string]: unknown;
};

export type RouteDocument = {
	path: string;
	sectorId: SectorId | null;
	data: TopoDocument;
	dirty: boolean;
};

/** A sector folder whose on-disk name must be migrated when the editable ID changes. */
export type SectorStorageMove = { from: SectorId; to: SectorId };

export type SourceCragRef = {
	path: string;
	id: CragId;
};

export type HierarchyEntry = {
	key: string;
	feature: EditableCrag;
	source: SourceCragRef;
	parentKey: string | null;
	childKeys: string[];
	dirty: boolean;
	isCurrent: boolean;
	/** Unknown top-level GeoJSON members retained when the entry is written. */
	featureExtras?: Record<string, unknown>;
};

export type MetadataTarget = { type: 'entry'; key: string } | { type: 'sector'; id: SectorId };

export type MetadataValue = EditableCrag | CragSector;

export type HierarchyValidationError = {
	key: string;
	message: string;
	kind: EntryKind;
};

export type CragEditorSnapshot = {
	crag: EditableCrag;
	access: AccessCollection;
	routeDocuments: RouteDocument[];
	sectorStorageMoves: SectorStorageMove[];
	sourceCrag: SourceCragRef | null;
	hierarchyEntries: HierarchyEntry[];
	activeMetadataTarget: MetadataTarget | null;
};

export type CragHistoryEntry = {
	label: string;
	before: CragEditorSnapshot;
	after: CragEditorSnapshot;
};

export type CragEditorSession = CragEditorSnapshot & {
	selectedRouteKey: string | null;
	history: {
		entries: CragHistoryEntry[];
		index: number;
	};
	commit(label: string, mutator: () => void): boolean;
	restoreSnapshot(value: CragEditorSnapshot): void;
	undo(): boolean;
	redo(): boolean;
	readonly canUndo: boolean;
	readonly canRedo: boolean;
	reset(): void;
	markDocumentDirty(path: string): RouteDocument | undefined;
	sectorStorageMoves: SectorStorageMove[];
	setCragGeometry(geometry: GeoJSONGeometry): void;
	commitGeometry(target: MetadataTarget | null, geometry: GeoJSONGeometry, label: string): boolean;
	getMetadataTarget(target?: MetadataTarget | null): MetadataValue | null;
	setActiveMetadataTarget(target: MetadataTarget | null): void;
	setMetadataField(field: string, value: unknown, target?: MetadataTarget | null): void;
	setMetadataEquipment(equipment: unknown[], target?: MetadataTarget | null): void;
	setMetadataImages(images: unknown[], target?: MetadataTarget | null): void;
	updateMetadataEquipmentItem(
		index: number,
		field: string,
		value: unknown,
		target?: MetadataTarget | null
	): void;
	markHierarchyEntryClean(key: string): void;
	readonly hierarchyErrors: HierarchyValidationError[];
	setCragField(field: keyof EditableCrag | string, value: unknown): void;
	setEquipment(equipment: unknown[]): void;
	setCragImages(images: unknown[]): void;
	setSectors(sectors: CragSector[]): void;
	updateSector(id: SectorId, field: keyof CragSector | string, value: unknown): void;
	updateEquipmentItem(index: number, field: string, value: unknown): void;
	replaceAccessFeatures(features: unknown[]): void;
	addRouteDocument(document: RouteDocument): RouteDocument;
	updateRouteDocument(
		path: string,
		updater: (data: TopoDocument, document: RouteDocument) => void
	): RouteDocument | null;
	updateRoute(
		path: string,
		routeId: string | number,
		updater: (route: TopoDocument['routes'][number]) => void
	): RouteDocument | null;
	setDocumentClean(path: string): RouteDocument | undefined;
	getSaveSession(): Pick<CragEditorSnapshot, 'crag' | 'access'>;
};

export type LoadedCragEditorEntry = CragEditorSnapshot;
