import type {
	CragProperties,
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

export type SourceCragRef = {
	path: string;
	id: CragId;
};

export type CragEditorSnapshot = {
	crag: EditableCrag;
	access: AccessCollection;
	routeDocuments: RouteDocument[];
	sourceCrag: SourceCragRef | null;
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
	setCragGeometry(geometry: GeoJSONGeometry): void;
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
