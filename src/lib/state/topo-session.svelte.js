import { Vector3 } from 'three';
import { getContext, setContext } from 'svelte';

export const TOPO_EDITOR_SESSION = Symbol('topo-editor-session');

export function provideTopoEditorSession(session) {
	setContext(TOPO_EDITOR_SESSION, session);
	return session;
}

export function getTopoEditorSession() {
	const session = getContext(TOPO_EDITOR_SESSION);
	if (!session) throw new Error('Topo editor session is not available in this component tree');
	return session;
}

export function createInitialTopo() {
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

export function createInitialClustering() {
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

function createUiState() {
	return {
		workspace: null,
		selectedRouteId: null,
		selectedPathId: null,
		selectedOutlineId: null,
		selectedFixpointId: null,
		selectedTextLabelId: null,
		selectedSymbol: 'bolt',
		activeDraftId: null,
		lastSaved: null
	};
}

function createTransientState() {
	return {
		modelUrl: null,
		glbBlob: null,
		modelRevision: 0,
		targetCameraPosition: new Vector3(0, 1, 5),
		targetControlsTarget: new Vector3(0, 0, 0)
	};
}

function attachTransientAliases(ui, transient) {
	for (const key of ['modelUrl', 'glbBlob', 'modelRevision', 'targetCameraPosition', 'targetControlsTarget']) {
		Object.defineProperty(ui, key, {
			configurable: true,
			enumerable: false,
			get: () => transient[key],
			set: (value) => (transient[key] = value)
		});
	}
}

/**
 * Creates an editor session. A session owns one editing surface and must not
 * be shared between routes or browser tabs.
 */
export function createTopoEditorSession() {
	const session = $state({
		topo: createInitialTopo(),
		ui: createUiState(),
		transient: createTransientState(),
		clustering: createInitialClustering(),

		select(selection = {}) {
			this.ui.selectedRouteId = selection.routeId ?? null;
			this.ui.selectedPathId = selection.pathId ?? null;
			this.ui.selectedOutlineId = selection.outlineId ?? null;
			this.ui.selectedFixpointId = selection.fixpointId ?? null;
			this.ui.selectedTextLabelId = selection.textLabelId ?? null;
		},

		clearSelection() {
			this.select();
		},

		setModelFile(file) {
			if (this.transient.modelUrl) URL.revokeObjectURL(this.transient.modelUrl);
			this.transient.glbBlob = file || null;
			this.transient.modelUrl = file ? URL.createObjectURL(file) : null;
			this.transient.modelRevision++;
		},

		loadSession(session, id = null) {
			this.reset();
			const topo = session?.topo || session || createInitialTopo();
			this.topo = { ...createInitialTopo(), ...topo };
			this.topo.routes = [...(topo.routes || [])];
			this.topo.fixPoints = [...(topo.fixPoints || [])];
			this.topo.outlines = [...(topo.outlines || [])];
			this.topo.textLabels = [...(topo.textLabels || [])];
			if (session?.clustering) this.clustering = { ...createInitialClustering(), ...session.clustering };
			if (session?.glbBlob) this.setModelFile(session.glbBlob);
			this.ui.activeDraftId = id;
		},

		reset() {
			if (this.transient.modelUrl) URL.revokeObjectURL(this.transient.modelUrl);
			this.topo = createInitialTopo();
			this.ui = createUiState();
			this.transient = createTransientState();
			this.clustering = createInitialClustering();
		},

		markModelChanged() {
			this.transient.modelRevision++;
		},

		getSaveSession() {
			return {
				topo: this.topo,
				clustering: this.clustering,
				glbBlob: this.transient.glbBlob
			};
		}
	});
	attachTransientAliases(session.ui, session.transient);

	const reset = session.reset;
	session.reset = function resetSession() {
		reset.call(this);
		attachTransientAliases(this.ui, this.transient);
	};

	return session;
}
