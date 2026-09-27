import { Vector3 } from 'three';
import type { FixPoint, FelsTopoDocument, Route, TextLabel } from '@vorstieg/fels-types/types';
import type { OutlineRecord } from '$lib/assets/js/outline-geometry.ts';
import type { ClusteringHit, TopoCluster } from './clustering-types.ts';
import type { TopoDrawingTarget } from './topo-drawing-target.ts';

export type Topo2DEditorDocument = Omit<
	FelsTopoDocument,
	'coordinates' | 'routes' | 'fixPoints' | 'textLabels'
> & {
	name?: string;
	crag_id?: string;
	sector_id?: string;
	coordinates?: [number, number];
	modelOffset?: [number, number, number];
	modelRotation?: [number, number, number];
	modelScale?: [number, number, number];
	wallAzimuth?: number;
	altitude?: number;
	scale?: number;
	canvasAspectRatio?: number;
	backgroundFit?: 'contain' | 'cover';
	editorMode?: '2d' | '3d';
	routes: Route[];
	fixPoints: FixPoint[];
	outlines: OutlineRecord[];
	textLabels: TextLabel[];
};

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
		name: '',
		crag_id: '',
		sector_id: '',
		description: '',
		rock: 'granite',
		tags: [],
		routes: [],
		fixPoints: [],
		outlines: [],
		textLabels: [],
		date: '',
		updated: '',
		modelOffset: [0, 0, 0],
		coordinates: [0, 0],
		wallAzimuth: 0,
		altitude: 0,
		scale: 1,
		image2D: null,
		imageAspectRatio: 1.5,
		canvasAspectRatio: 1.5,
		backgroundFit: 'contain',
		editorMode: '3d'
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
