import { Vector3 } from 'three';

export const userState = $state({
	topo: {
		name: '',
		crag_id: '',
		sector_id: '',
		description: '',
		rock: 'granite',
		tags: [],
		routes: [],
		fixPoints: [], // Unified markers: [{id, type, position: [x,y,z], position2D: [x,y], rotation2D, scale2D}]
		outlines: [], // Rock outlines: [{id, points2D: [[x,y], ...]}]
		textLabels: [],
		date: '',
		updated: '',
		modelOffset: [0, 0, 0],
		coordinates: [0, 0],
		wallAzimuth: 0,
		altitude: 0,
		scale: 1,
		// 2D TOPO Editor fields
		image2D: null, // Base64 data URL or external URL, null for blank canvas
		imageAspectRatio: 1.5, // Width/Height ratio of the source image
		// The coordinate space for annotations. It must not change when a background is replaced.
		canvasAspectRatio: 1.5,
		backgroundFit: 'contain',
		editorMode: '3d' // '2d' | '3d' - which editor is active
	},
	// UI State for the editor
	ui: {
		workspace: null, // '3d-create' | '3d-edit' | '2d-create' | '2d-edit'
		selectedRouteId: null, // ID of the route currently selected for editing
		selectedPathIndex: null, // Index of the selected path asset within selectedRouteId
		selectedOutlineId: null, // ID of the rock outline currently selected for editing
		selectedFixpointId: null,
		selectedTextLabelId: null,
		selectedSymbol: 'bolt',
		activeDraftId: null,
		lastSaved: null,
		modelUrl: null, // Temporary Blob URL for the 3D model
		glbBlob: null, // Persistable Blob for the 3D model
		modelRevision: 0, // Counter to trigger auto-save on geometry changes
		targetCameraPosition: new Vector3(0, 1, 5),
		targetControlsTarget: new Vector3(0, 0, 0)
	},
	// Data for clustering pipeline
	clustering: {
		radius: 0.2,
		minConfidence: 0.23,
		maxEdgeDist: 1.0,
		minAngleCos: 0.66,
		maxCamDist: 50,
		minViewSpread: 0.4,
		minObservations: 4,
		initializedHits: 0,

		rawHits: [], // All imported hits from detections.json
		clusters: [], // Final grouped bolts/fixpoints
		selectedClusterId: null, // ID of the cluster currently being inspected
		lockedClusterId: null, // ID of the cluster locked by clicking
		cropsMap: {}, // Map of local crop Object URLs

		cameraPositions: {}, // frameIndex -> [x,y,z]
		gpsData: {}, // frameIndex -> {lat, lon, alt, ...}
		registrationCsv: null, // Raw content of registration.csv

		// UI Toggles
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
	},

	reset() {
		this.topo = {
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
		if (this.ui.modelUrl) {
			URL.revokeObjectURL(this.ui.modelUrl);
		}
		this.ui.workspace = null;
		this.ui.activeDraftId = null;
		this.ui.lastSaved = null;
		this.ui.modelUrl = null;
		this.ui.glbBlob = null;
		this.ui.selectedTextLabelId = null;
		this.ui.selectedPathIndex = null;
		this.clustering.rawHits = [];
		this.clustering.clusters = [];
		this.clustering.cameraPositions = {};
		this.clustering.gpsData = {};
		this.clustering.cropsMap = {};
		this.clustering.stats = {
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
		};
	}
});
