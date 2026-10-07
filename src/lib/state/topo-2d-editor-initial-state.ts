import { Vector3 } from 'three';
import type { FixPoint, FelsTopoDocument, Route, TextLabel } from '@vorstieg/fels-types/types';
import type { OutlineRecord } from '$lib/assets/js/outline-geometry.ts';
import type { ClusteringHit, TopoCluster } from './clustering-types.ts';
import type { TopoDrawingTarget } from './topo-drawing-target.ts';

export type Topo2DEditorDocument = Pick<
	FelsTopoDocument,
	| 'id'
	| 'description'
	| 'tags'
	| 'image2D'
	| 'backgroundFit'
	| 'wallAzimuth'
	| 'imageAspectRatio'
	| 'date'
	| 'updated'
	| 'author'
	| 'coordinates'
	| 'paths'
> & {
	backgroundFit?: 'contain' | 'cover';
	routes: Route[];
	fixPoints: FixPoint[];
	outlines: OutlineRecord[];
	textLabels: TextLabel[];
};

/** Keep only fields in the shared topo contract when loading external topo JSON. */
export function selectTopoDocumentFields(value: unknown): Partial<Topo2DEditorDocument> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
	const data = value as Record<string, unknown>;
	const coordinates = data.coordinates;
	return {
		...(typeof data.id === 'string' ? { id: data.id } : {}),
		...(typeof data.description === 'string' ? { description: data.description } : {}),
		...(Array.isArray(data.tags) ? { tags: data.tags as string[] } : {}),
		...(typeof data.image2D === 'string' || data.image2D === null ? { image2D: data.image2D } : {}),
		...(data.backgroundFit === 'contain' || data.backgroundFit === 'cover'
			? { backgroundFit: data.backgroundFit }
			: {}),
		...(typeof data.wallAzimuth === 'number' ? { wallAzimuth: data.wallAzimuth } : {}),
		...(typeof data.imageAspectRatio === 'number'
			? { imageAspectRatio: data.imageAspectRatio }
			: {}),
		...(typeof data.date === 'string' ? { date: data.date } : {}),
		...(typeof data.updated === 'string' ? { updated: data.updated } : {}),
		...(typeof data.author === 'string' ? { author: data.author } : {}),
		...(Array.isArray(coordinates) &&
		coordinates.length === 3 &&
		coordinates.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))
			? { coordinates: coordinates as [number, number, number] }
			: {}),
		...(data.paths && typeof data.paths === 'object'
			? { paths: data.paths as FelsTopoDocument['paths'] }
			: {}),
		routes: Array.isArray(data.routes) ? (data.routes as Route[]) : [],
		fixPoints: Array.isArray(data.fixPoints) ? (data.fixPoints as FixPoint[]) : [],
		outlines: Array.isArray(data.outlines) ? (data.outlines as OutlineRecord[]) : [],
		textLabels: Array.isArray(data.textLabels) ? (data.textLabels as TextLabel[]) : []
	};
}

export interface Topo2DEditorDrafts {
	route: { points: number[][]; fixPointIds: Array<string | number>; mode: string };
	multipitch: {
		points: number[][];
		fixPointIds: Array<string | number>;
		target: { routeId: string | number; pitchId?: string | number } | null;
	};
	outline: {
		points: number[][];
		temporaryPoints: number[][];
		preview: OutlineRecord['shape'] | null;
		brushPoints: number[][];
		brushOutlinePoints: number[][];
		mode: string | null;
	};
	text: { id: string | number | null; value: string; originalValue: string; isNew: boolean };
	pathEdit: {
		target: unknown | null;
		points: number[][];
		selectedPointIndex: number | null;
	};
}

export interface Topo2DEditorUi {
	workspace: string | null;
	editorMode: '2d' | '3d';
	has3DTopoAvailable: boolean;
	entryPath: string | null;
	topoFileName: string | null;
	name: string;
	modelOffset: [number, number, number];
	modelRotation: [number, number, number];
	modelScale: [number, number, number];
	scale: number;
	canvasAspectRatio: number;
	activeTool: string;
	selectedSymbol: string;
	selectedOutlineStyle: string;
	snapRoutesToAnchors: boolean;
	drawingTarget: TopoDrawingTarget | null;
	mobileSelectionMode: boolean;
	isShiftPressed: boolean;
	selectedRouteId: string | number | null;
	selectedPathId: string | number | null;
	selectedPitchId: string | number | null;
	selectedVariantId: string | number | null;
	selectedOutlineId: string | number | null;
	selectedFixpointId: string | number | null;
	selectedTextLabelId: string | number | null;
	activeDraftId: string | null;
	lastSaved: string | null;
}

export interface Topo2DEditorClustering {
	radius: number;
	minConfidence: number;
	maxEdgeDist: number;
	minAngleCos: number;
	maxCamDist: number;
	minViewSpread: number;
	minObservations: number;
	initializedHits: number;
	rawHits: ClusteringHit[];
	clusters: TopoCluster[];
	selectedClusterId: string | number | null;
	lockedClusterId: string | number | null;
	cropsMap: Record<string, string>;
	cameraPositions: Record<string, [number, number, number]>;
	gpsData: Record<string, TopoGpsPosition>;
	registrationCsv: string | null;
	showRawHits: boolean;
	showAnnotations: boolean;
	showCameraTrail: boolean;
	stats: {
		totalHits: number;
		confCut: number;
		edgeCut: number;
		angleCut: number;
		distCut: number;
		finalHits: number;
		initialClusters: number;
		spreadCut: number;
		obsCut: number;
		finalClusters: number;
	};
}

export interface TopoGpsPosition {
	latitude: number;
	longitude: number;
	abs_alt?: number;
	rel_alt?: number;
}

export interface Topo2DEditorTransientState {
	modelUrl: string | null;
	glbBlob: Blob | File | null;
	modelRevision: number;
	targetCameraPosition: Vector3;
	targetControlsTarget: Vector3;
}

export function createInitialTopo(): Topo2DEditorDocument {
	return {
		description: '',
		tags: [],
		routes: [],
		fixPoints: [],
		outlines: [],
		textLabels: [],
		date: '',
		updated: '',
		coordinates: [0, 0, 0],
		image2D: null,
		imageAspectRatio: 1.5,
		backgroundFit: 'contain'
	};
}

export function createInitialClustering(): Topo2DEditorClustering {
	return {
		radius: 0.2,
		minConfidence: 0.23,
		maxEdgeDist: 1,
		minAngleCos: 0.66,
		maxCamDist: 50,
		minViewSpread: 0.4,
		minObservations: 4,
		initializedHits: 0,
		rawHits: [],
		clusters: [],
		selectedClusterId: null,
		lockedClusterId: null,
		cropsMap: {},
		cameraPositions: {},
		gpsData: {},
		registrationCsv: null,
		showRawHits: false,
		showAnnotations: false,
		showCameraTrail: false,
		stats: {
			totalHits: 0,
			confCut: 0,
			edgeCut: 0,
			angleCut: 0,
			distCut: 0,
			finalHits: 0,
			initialClusters: 0,
			spreadCut: 0,
			obsCut: 0,
			finalClusters: 0
		}
	};
}

export function createInitialTopo2DEditorDrafts(): Topo2DEditorDrafts {
	return {
		route: { points: [], fixPointIds: [], mode: 'route' },
		multipitch: { points: [], fixPointIds: [], target: null },
		outline: {
			points: [],
			temporaryPoints: [],
			preview: null,
			brushPoints: [],
			brushOutlinePoints: [],
			mode: null
		},
		text: { id: null, value: '', originalValue: '', isNew: false },
		pathEdit: { target: null, points: [], selectedPointIndex: null }
	};
}

export function createInitialTopo2DEditorUi(): Topo2DEditorUi {
	return {
		workspace: null,
		editorMode: '3d',
		has3DTopoAvailable: false,
		entryPath: null,
		topoFileName: null,
		name: '',
		modelOffset: [0, 0, 0],
		modelRotation: [0, 0, 0],
		modelScale: [1, 1, 1],
		scale: 1,
		canvasAspectRatio: 1.5,
		activeTool: 'select',
		selectedSymbol: 'bolt',
		selectedOutlineStyle: 'rock',
		snapRoutesToAnchors: false,
		drawingTarget: null,
		mobileSelectionMode: false,
		isShiftPressed: false,
		selectedRouteId: null,
		selectedPathId: null,
		selectedPitchId: null,
		selectedVariantId: null,
		selectedOutlineId: null,
		selectedFixpointId: null,
		selectedTextLabelId: null,
		activeDraftId: null,
		lastSaved: null
	};
}

export function createInitialTopo2DEditorTransientState(): Topo2DEditorTransientState {
	return {
		modelUrl: null,
		glbBlob: null,
		modelRevision: 0,
		targetCameraPosition: new Vector3(0, 1, 5),
		targetControlsTarget: new Vector3(0, 0, 0)
	};
}
