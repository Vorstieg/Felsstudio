import { Vector3 } from 'three';
import { getContext, setContext } from 'svelte';
import { generateOutlineId, generateSymbolId, generateTextId } from '$lib/assets/js/id-utils.js';
import { translateOutline } from '$lib/assets/js/outline-geometry.js';

const HISTORY_LIMIT = 50;
const PASTE_OFFSET_PX = 16;
const COLLECTION_BY_TYPE = Object.freeze({
	route: 'routes',
	outline: 'outlines',
	symbol: 'fixPoints',
	text: 'textLabels'
});

const collectionForType = (type) => COLLECTION_BY_TYPE[type] || `${type}s`;
const sameId = (left, right) => String(left) === String(right);
const routePointKey = ({ routeId, pitchId = null, variantId = null, index }) =>
	JSON.stringify([
		String(routeId),
		pitchId == null ? null : String(pitchId),
		variantId == null ? null : String(variantId),
		index
	]);
const nextTextId = (topo) => {
	let id;
	do id = generateTextId();
	while ((topo.textLabels || []).some((label) => sameId(label.id, id)));
	return id;
};

export const TOPO_2D_EDITOR_STATE = Symbol('topo-2d-editor-state');

export function provideTopo2DEditorState(state) {
	setContext(TOPO_2D_EDITOR_STATE, state);
	return state;
}

/**
 * Returns the single topo editor store provided by an ancestor component.
 *
 * @returns {ReturnType<typeof createTopo2DEditorState>}
 * @throws {Error} When called outside a component tree with an editor store.
 */
export function getTopo2DEditorState() {
	/** @type {ReturnType<typeof createTopo2DEditorState> | undefined} */
	const state = getContext(TOPO_2D_EDITOR_STATE);
	if (!state) throw new Error('Topo editor state is not available in this component tree');
	return state;
}

const clone = (value) => JSON.parse(JSON.stringify(value));

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

function createTransientState() {
	return {
		modelUrl: null,
		glbBlob: null,
		modelRevision: 0,
		targetCameraPosition: new Vector3(0, 1, 5),
		targetControlsTarget: new Vector3(0, 0, 0)
	};
}

function createDrafts() {
	return {
		route: { points: [], fixPointIds: [], mode: 'route' },
		multipitch: { points: [], fixPointIds: [], target: null },
		outline: { points: [], preview: null, brushPoints: [], brushOutlinePoints: [], mode: null },
		text: { id: null, value: '', originalValue: '', isNew: false },
		pathEdit: { target: null, points: [], selectedPointIndex: null }
	};
}

function createUi() {
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

function createInteraction() {
	return null;
}

function itemsForType(topo, type) {
	if (COLLECTION_BY_TYPE[type]) return topo[collectionForType(type)] || [];
	if (type === 'pitch' || type === 'variant') {
		return (topo.routes || []).flatMap((route) => route[`${type}s`] || []);
	}
	if (type === 'path') {
		return (topo.routes || []).flatMap((route) =>
			(route.paths || route.pathRefs || []).map((path) => ({ ...path, id: path.id ?? path.pathId }))
		);
	}
	return topo[`${type}s`] || [];
}

function drawingTargetExists(topo, target) {
	if (!target) return true;
	const route = (topo.routes || []).find((item) => item.id === (target.routeId || target.id));
	if (target.type === 'route' || target.type === 'newPitch') return Boolean(route);
	if (target.type === 'pitch')
		return Boolean(route?.pitches?.some((item) => item.id === target.pitchId));
	if (target.type === 'variant')
		return Boolean(route?.variants?.some((item) => item.id === target.variantId));
	return true;
}

/**
 * Creates the single store for one topo editing surface.
 */
export function createTopo2DEditorState({ topo, getTopo, setTopo, ui, viewport = {} } = {}) {
	const state = $state({
		topo: topo ? clone(topo) : getTopo ? getTopo() : createInitialTopo(),
		ui: ui ? Object.assign(ui, { ...createUi(), ...ui }) : createUi(),
		interaction: createInteraction(),
		drafts: createDrafts(),
		clipboard: [],
		viewport: { baseWidth: 1, baseHeight: 1, transform: null, ...viewport },
		history: { entries: [], index: -1, savedSnapshot: null },
		selection: new Set(),
		selectedRoutePoints: new Set(),
		selectedItems: new Set(),
		selectedSymbolInstance: null,
		interactionState: null,
		hasPendingChanges: false,
		transient: createTransientState(),
		clustering: createInitialClustering()
	});

	const readTopo = () => (getTopo ? getTopo() : state.topo);
	const writeTopo = (next) => {
		state.topo = next;
		if (setTopo) setTopo(next);
	};
	const snapshot = () => {
		const document = clone(readTopo());
		// The display name belongs to the sector/crag entry, not its topo file.
		delete document.name;
		return document;
	};
	function setModelFile(file) {
		if (state.transient.modelUrl) URL.revokeObjectURL(state.transient.modelUrl);
		state.transient.glbBlob = file || null;
		state.transient.modelUrl = file ? URL.createObjectURL(file) : null;
		state.transient.modelRevision++;
	}
	function loadSession(session, id = null) {
		const document = session?.topo || session || createInitialTopo();
		if (state.transient.modelUrl) URL.revokeObjectURL(state.transient.modelUrl);
		state.transient = createTransientState();
		state.ui = createUi();
		writeTopo({ ...createInitialTopo(), ...clone(document) });
		state.topo.routes = [...(document.routes || [])];
		state.topo.fixPoints = [...(document.fixPoints || [])];
		state.topo.outlines = [...(document.outlines || [])];
		state.topo.textLabels = [...(document.textLabels || [])];
		state.clustering = session?.clustering
			? { ...createInitialClustering(), ...session.clustering }
			: createInitialClustering();
		if (session?.glbBlob) setModelFile(session.glbBlob);
		state.ui.activeDraftId = id;
		state.selection = new Set();
		state.selectedItems = new Set();
		projectSelection();
		state.history = { entries: [], index: -1, savedSnapshot: null };
		saveHistory();
	}
	function getSaveSession() {
		return { topo: state.topo, clustering: state.clustering, glbBlob: state.transient.glbBlob };
	}

	function clearSelection() {
		state.selection = new Set();
		state.selectedRoutePoints = new Set();
		projectSelection();
	}

	function projectSelection() {
		state.selectedItems = new Set(state.selection || []);
		const ui = state.ui;
		ui.selectedRouteId = ui.selectedPathId = ui.selectedPitchId = ui.selectedVariantId = null;
		ui.selectedOutlineId = ui.selectedFixpointId = ui.selectedTextLabelId = null;
		state.selectedSymbolInstance = null;
		for (const key of state.selection || []) {
			const [type, id] = key.split(':');
			if (type === 'route') ui.selectedRouteId = id;
			if (type === 'path') ui.selectedPathId = id;
			if (type === 'pitch') ui.selectedPitchId = id;
			if (type === 'variant') ui.selectedVariantId = id;
			if (type === 'outline') ui.selectedOutlineId = id;
			if (type === 'text') ui.selectedTextLabelId = id;
			if (type === 'symbol') {
				ui.selectedFixpointId = id;
				state.selectedSymbolInstance =
					(readTopo().fixPoints || []).find((item) => sameId(item.id, id)) || null;
			}
		}
		if (!drawingTargetExists(readTopo(), ui.drawingTarget)) ui.drawingTarget = null;
		if (ui.selectedRouteId == null) state.selectedRoutePoints = new Set();
	}

	function selectObject(type, id, multi = false) {
		if (!multi || type !== 'route') state.selectedRoutePoints = new Set();
		if (!multi) state.selection = new Set();
		const key = `${type}:${id}`;
		if (multi && state.selection.has(key)) state.selection.delete(key);
		else state.selection.add(key);
		projectSelection();
	}

	function selectRoutePoints(points, mode = 'replace') {
		const next = mode === 'replace' ? new Set() : new Set(state.selectedRoutePoints);
		for (const point of points || []) {
			const key = routePointKey(point);
			if (mode === 'subtract') next.delete(key);
			else next.add(key);
		}
		state.selectedRoutePoints = next;
	}

	function selectItems(items, mode = 'replace') {
		if (mode === 'replace') state.selection = new Set();
		for (const { type, id } of items) {
			const key = `${type}:${id}`;
			if (mode === 'subtract') state.selection.delete(key);
			else state.selection.add(key);
		}
		projectSelection();
	}

	function selectPath(kind, routeId, pathId) {
		state.selection = new Set([`route:${routeId}`, `${kind}:${pathId}`]);
		projectSelection();
	}

	function removeItems(items) {
		for (const { type, id } of items) state.selection.delete(`${type}:${id}`);
		projectSelection();
	}

	function reconcileSelection() {
		for (const key of [...(state.selection || [])]) {
			const [type, id] = key.split(':');
			if (!itemsForType(readTopo(), type).some((item) => sameId(item.id, id)))
				state.selection.delete(key);
		}
		projectSelection();
	}

	function restore(next) {
		writeTopo(clone(next));
		reconcileSelection();
		state.interaction = null;
		state.drafts = createDrafts();
		state.interactionState = null;
		state.hasPendingChanges = false;
	}

	function updatePendingChanges() {
		// This flag drives the draft approve/cancel controls. Ordinary document
		// edits remain tracked by history and autosave, but must not make those
		// controls appear temporarily until the next autosave.
		state.hasPendingChanges = Boolean(hasActiveDraft());
	}

	function saveHistory() {
		const current = snapshot();
		const entries = state.history.entries;
		if (!entries.length) {
			const baseline = state.history.savedSnapshot;
			state.history.entries =
				baseline && JSON.stringify(baseline) !== JSON.stringify(current)
					? [clone(baseline), current]
					: [current];
			state.history.index = state.history.entries.length - 1;
			state.history.savedSnapshot = state.history.savedSnapshot || clone(current);
			updatePendingChanges();
			return state.history.entries.length > 1;
		}
		if (JSON.stringify(entries[state.history.index]) === JSON.stringify(current)) return false;
		state.history.entries = entries.slice(0, state.history.index + 1);
		state.history.entries.push(current);
		if (state.history.entries.length > HISTORY_LIMIT) state.history.entries.shift();
		state.history.index = state.history.entries.length - 1;
		updatePendingChanges();
		return true;
	}

	function commit(label, mutator = () => {}) {
		const before = snapshot();
		const result = mutator(readTopo());
		const after = snapshot();
		if (result === false) {
			if (JSON.stringify(before) !== JSON.stringify(after)) writeTopo(before);
			return false;
		}
		if (JSON.stringify(before) === JSON.stringify(after)) return result;
		if (!state.history.entries.length) {
			state.history.entries = [before];
			state.history.index = 0;
		}
		saveHistory();
		reconcileSelection();
		updatePendingChanges();
		return result;
	}

	function undoDocumentTransaction() {
		if (state.history.index <= 0) return false;
		state.history.index--;
		restore(state.history.entries[state.history.index]);
		updatePendingChanges();
		return true;
	}

	function redo() {
		if (state.history.index >= state.history.entries.length - 1) return false;
		state.history.index++;
		restore(state.history.entries[state.history.index]);
		updatePendingChanges();
		return true;
	}

	function hasActiveDraft() {
		return (
			state.drafts.route.points.length ||
			state.drafts.multipitch.points.length ||
			state.drafts.outline.points.length ||
			state.drafts.outline.brushPoints.length ||
			state.drafts.text.id ||
			state.drafts.pathEdit.points.length
		);
	}

	function undo() {
		if (hasActiveDraft()) return undoDraftPoint();
		return undoDocumentTransaction();
	}

	function undoDraftPoint() {
		const draft = state.drafts.route.points.length
			? state.drafts.route
			: state.drafts.multipitch.points.length
				? state.drafts.multipitch
				: state.drafts.outline;
		if (!draft?.points?.length) return false;
		draft.points.pop();
		if (draft.fixPointIds) draft.fixPointIds.pop();
		updatePendingChanges();
		return true;
	}

	function updateNestedPath(path, value) {
		return commit('Update nested path', () => {
			const parts = Array.isArray(path) ? path : path.split('.');
			let target = readTopo();
			for (const part of parts.slice(0, -1)) target = target[part];
			target[parts.at(-1)] = clone(value);
			return true;
		});
	}

	function collectionMethod(collection, item, label, { recordHistory = true } = {}) {
		if (!recordHistory) {
			const topo = readTopo();
			topo[collection] = [...(topo[collection] || []), clone(item)];
			return item;
		}
		return commit(label, () => {
			const topo = readTopo();
			topo[collection] = [...(topo[collection] || []), clone(item)];
			return item;
		});
	}

	function updateItem(collection, id, changes, label, { recordHistory = true } = {}) {
		const mutate = () => {
			const item = (readTopo()[collection] || []).find((entry) => sameId(entry.id, id));
			if (!item) return false;
			Object.assign(item, clone(changes));
			return item;
		};
		return recordHistory ? commit(label, mutate) : mutate();
	}

	function removeItem(collection, id, label, { recordHistory = true } = {}) {
		const mutate = () => {
			const topo = readTopo();
			const before = topo[collection] || [];
			if (!before.some((item) => sameId(item.id, id))) return false;
			topo[collection] = before.filter((item) => !sameId(item.id, id));
			const type =
				Object.keys(COLLECTION_BY_TYPE).find(
					(candidate) => COLLECTION_BY_TYPE[candidate] === collection
				) || collection.slice(0, -1);
			removeItems([{ type, id }]);
			if (collection === 'fixPoints') {
				for (const route of topo.routes || []) {
					route.fixPoints = (route.fixPoints || []).filter((ref) => ref !== id);
					for (const pitch of route.pitches || []) {
						if (pitch.startNodeId === id) pitch.startNodeId = null;
						if (pitch.endNodeId === id) pitch.endNodeId = null;
					}
				}
			}
			return true;
		};
		return recordHistory ? commit(label, mutate) : mutate();
	}

	function deleteSelection() {
		const selected = [...(state.selection || [])];
		return commit('Delete selection', () => {
			for (const [type, id] of selected.map((key) => key.split(':'))) {
				const collection = collectionForType(type);
				const topo = readTopo();
				const before = topo[collection] || [];
				if (!before.some((item) => sameId(item.id, id))) continue;
				topo[collection] = before.filter((item) => !sameId(item.id, id));
				if (type === 'symbol') {
					for (const route of topo.routes || []) {
						route.fixPoints = (route.fixPoints || []).filter((ref) => ref !== id);
						for (const pitch of route.pitches || []) {
							if (pitch.startNodeId === id) pitch.startNodeId = null;
							if (pitch.endNodeId === id) pitch.endNodeId = null;
						}
					}
				}
			}
			clearSelection();
			return true;
		});
	}

	function deleteItems(collection, ids, type, { recordHistory = true } = {}) {
		let changed = false;
		for (const id of ids)
			changed = Boolean(removeItem(collection, id, `Remove ${type}`, { recordHistory })) || changed;
		return changed;
	}

	function copySelection() {
		state.clipboard = [...(state.selection || [])]
			.filter((key) => ['outline', 'symbol', 'text'].includes(key.split(':')[0]))
			.map((key) => {
				const [type, id] = key.split(':');
				const collection = collectionForType(type);
				const item = (readTopo()[collection] || []).find((entry) => sameId(entry.id, id));
				return item ? { type, item: clone(item) } : null;
			})
			.filter(Boolean);
		return state.clipboard.length;
	}

	function pasteSelection(canvasSize = state.viewport) {
		let count = 0;
		return commit('Paste selection', () => {
			const topo = readTopo();
			const dx = (PASTE_OFFSET_PX * (count = 1)) / (canvasSize.baseWidth || 1);
			const dy = PASTE_OFFSET_PX / (canvasSize.baseHeight || 1);
			const pasted = [];
			for (const { type, item } of state.clipboard) {
				const copy = clone(item);
				copy.id =
					type === 'symbol'
						? generateSymbolId()
						: type === 'outline'
							? generateOutlineId()
							: nextTextId(topo);
				if (type === 'outline') {
					translateOutline(copy, dx, dy, canvasSize);
					topo.outlines.push(copy);
				} else if (type === 'symbol') {
					copy.position2D = [copy.position2D[0] + dx, copy.position2D[1] + dy];
					topo.fixPoints.push(copy);
				} else if (type === 'text') {
					copy.position2D = [copy.position2D[0] + dx, copy.position2D[1] + dy];
					topo.textLabels.push(copy);
				}
				pasted.push({ type, id: copy.id });
			}
			selectItems(pasted);
			return pasted;
		});
	}

	function load(nextTopo) {
		const document = nextTopo?.topo || nextTopo || {};
		writeTopo({ ...createInitialTopo(), ...clone(document) });
		Object.assign(state.ui, createUi());
		state.selection = new Set();
		state.selectedItems = new Set();
		state.selectedSymbolInstance = null;
		state.interaction = null;
		state.drafts = createDrafts();
		state.history = { entries: [], index: -1, savedSnapshot: null };
		saveHistory();
		state.hasPendingChanges = false;
	}

	function reset() {
		load(createInitialTopo());
	}

	function clearHistory() {
		state.history = { entries: [], index: -1, savedSnapshot: null };
	}

	function markSaved() {
		state.history.savedSnapshot = snapshot();
		state.hasPendingChanges = Boolean(hasActiveDraft());
	}

	function createSymbol(point, type, values = {}) {
		const item = {
			id: generateSymbolId(),
			type,
			position2D: [point.x, point.y],
			rotation2D: 0,
			scale2D: 1,
			scaleX2D: 1,
			scaleY2D: 1,
			...values
		};
		collectionMethod('fixPoints', item, 'Add fixpoint');
		return item.id;
	}

	function createTextLabel(point, values = {}) {
		const item = {
			id: nextTextId(readTopo()),
			text: '',
			position2D: [point.x, point.y],
			fontSize2D: 24,
			color: '#111827',
			fontWeight: 600,
			textAlign2D: 'center',
			...values
		};
		collectionMethod('textLabels', item, 'Add text label');
		selectObject('text', item.id);
		return item.id;
	}

	function appendRoutePoint(routeId, target, point, { recordHistory = true } = {}) {
		const mutate = () => {
			const route = readTopo().routes.find((entry) => entry.id === routeId);
			const path =
				target?.type === 'pitch'
					? route?.pitches?.find((entry) => entry.id === target.pitchId)
					: target?.type === 'variant'
						? route?.variants?.find((entry) => entry.id === target.variantId)
						: route;
			if (!path) return false;
			path.points2D = [...(path.points2D || []), [point.x, point.y]];
			return path;
		};
		return recordHistory ? commit('Append route point', mutate) : mutate();
	}

	function appendOutlinePoint(outlineId, point, { recordHistory = true } = {}) {
		const mutate = () => {
			const outline = readTopo().outlines.find((entry) => entry.id === outlineId);
			if (!outline) return false;
			outline.points2D = [...(outline.points2D || []), [point.x, point.y]];
			outline.shape = { type: 'polyline', points2D: outline.points2D };
			return true;
		};
		return recordHistory ? commit('Append outline point', mutate) : mutate();
	}

	function moveRouteLabel(routeId, { pitchId = null, variantId = null } = {}, mouse) {
		return commit('Move route label', () => {
			const route = readTopo().routes.find((entry) => entry.id === routeId);
			const target = pitchId
				? route?.pitches?.find((entry) => entry.id === pitchId)
				: variantId
					? route?.variants?.find((entry) => entry.id === variantId)
					: route;
			if (!target?.points2D?.length) return false;
			target.labelOffset2D = [mouse.x - target.points2D[0][0], mouse.y - target.points2D[0][1]];
			return true;
		});
	}

	Object.assign(state, {
		selection: state.selection,
		selectedSymbolInstance: state.selectedSymbolInstance,
		selectObject,
		selectPath,
		selectItems,
		selectRoutePoints,
		isRoutePointSelected: (target) => state.selectedRoutePoints.has(routePointKey(target)),
		getSelectedRoutePoints: () =>
			[...state.selectedRoutePoints].map((key) => {
				const [routeId, pitchId, variantId, index] = JSON.parse(key);
				return { routeId, pitchId, variantId, index };
			}),
		removeItems,
		clearSelection,
		loadSession,
		getSaveSession,
		setModelFile,
		markModelChanged: () => state.transient.modelRevision++,
		reconcileSelection,
		selectedId: (type) =>
			[...state.selection].find((key) => key.startsWith(`${type}:`))?.split(':')[1] || null,
		isSelected: (type, id) => state.selection.has(`${type}:${id}`),
		startInteraction: (kind, details = {}) => (state.interaction = { kind, ...details }),
		updateInteraction: (patch) => state.interaction && Object.assign(state.interaction, patch),
		endInteraction: () => {
			const done = state.interaction;
			state.interaction = null;
			return done;
		},
		cancelInteraction: () => (state.interaction = null),
		setActiveTool: (tool) => (state.ui.activeTool = tool || 'select'),
		setSelectedSymbol: (symbol) => (state.ui.selectedSymbol = symbol),
		setSelectedOutlineStyle: (style) => (state.ui.selectedOutlineStyle = style),
		setSnapRoutesToAnchors: (enabled) => (state.ui.snapRoutesToAnchors = Boolean(enabled)),
		setDrawingTarget: (target) => {
			state.ui.drawingTarget = target;
			updatePendingChanges();
		},
		setMobileSelectionMode: (enabled) => (state.ui.mobileSelectionMode = Boolean(enabled)),
		setShiftPressed: (pressed) => (state.ui.isShiftPressed = Boolean(pressed)),
		setDraftPending: (pending) => (state.hasPendingChanges = Boolean(pending)),
		commit,
		mutateDocument: (mutator = () => {}) => mutator(readTopo()),
		refreshPendingChanges: updatePendingChanges,
		undo,
		redo,
		saveHistory,
		undoDraftPoint,
		clearHistory,
		markSaved,
		addRoute: (item, options) => collectionMethod('routes', item, 'Add route', options),
		updateRoute: (id, changes, options) =>
			updateItem('routes', id, changes, 'Update route', options),
		removeRoute: (id) => removeItem('routes', id, 'Remove route'),
		addPitch: (routeId, item, { recordHistory = true } = {}) => {
			const mutate = () => {
				const route = readTopo().routes.find((entry) => entry.id === routeId);
				if (!route) return false;
				route.pitches = [...(route.pitches || []), clone(item)];
				return true;
			};
			return recordHistory ? commit('Add pitch', mutate) : mutate();
		},
		updatePitch: (routeId, id, changes) =>
			commit('Update pitch', () => {
				const item = readTopo()
					.routes.find((r) => r.id === routeId)
					?.pitches?.find((p) => p.id === id);
				if (!item) return false;
				Object.assign(item, clone(changes));
				return true;
			}),
		removePitch: (routeId, id) =>
			commit('Remove pitch', () => {
				const route = readTopo().routes.find((r) => r.id === routeId);
				if (!route?.pitches?.some((p) => p.id === id)) return false;
				route.pitches = route.pitches.filter((p) => p.id !== id);
				reconcileSelection();
				return true;
			}),
		removeVariant: (routeId, id) =>
			commit('Remove route variant', () => {
				const route = readTopo().routes.find((r) => r.id === routeId);
				if (!route?.variants?.some((variant) => variant.id === id)) return false;
				route.variants = route.variants.filter((variant) => variant.id !== id);
				reconcileSelection();
				return true;
			}),
		updateVariant: (routeId, id, changes) =>
			commit('Update variant', () => {
				const item = readTopo()
					.routes.find((r) => r.id === routeId)
					?.variants?.find((p) => p.id === id);
				if (!item) return false;
				Object.assign(item, clone(changes));
				return true;
			}),
		addFixpoint: (item) => collectionMethod('fixPoints', item, 'Add fixpoint'),
		updateFixpoint: (id, changes, options) =>
			updateItem('fixPoints', id, changes, 'Update fixpoint', options),
		removeFixpoint: (id) => removeItem('fixPoints', id, 'Remove fixpoint'),
		addOutline: (item) => collectionMethod('outlines', item, 'Add outline'),
		updateOutline: (id, changes, options) =>
			updateItem('outlines', id, changes, 'Update outline', options),
		removeOutline: (id) => removeItem('outlines', id, 'Remove outline'),
		addTextLabel: (item, options) =>
			collectionMethod('textLabels', item, 'Add text label', options),
		updateTextLabel: (id, changes, options) =>
			updateItem('textLabels', id, changes, 'Update text label', options),
		removeTextLabel: (id, options) => removeItem('textLabels', id, 'Remove text label', options),
		createTextLabel,
		createSymbol,
		appendRoutePoint,
		appendOutlinePoint,
		moveRouteLabel,
		deleteOutlines: (ids, options) => deleteItems('outlines', ids, 'outline', options),
		deleteSymbols: (ids, options) => deleteItems('fixPoints', ids, 'fixpoint', options),
		deleteRoutes: (ids, options) => deleteItems('routes', ids, 'route', options),
		deleteTextLabels: (ids, options) => deleteItems('textLabels', ids, 'text label', options),
		deleteSymbolAt: (point, tolerance = 0.02) => {
			const item = readTopo().fixPoints.find(
				(entry) =>
					entry.position2D &&
					Math.abs(entry.position2D[0] - point.x) < tolerance &&
					Math.abs(entry.position2D[1] - point.y) < tolerance
			);
			return item ? state.removeFixpoint(item.id) : false;
		},
		updateNestedPath,
		moveSelectedItems: (move) =>
			commit('Move selection', () => {
				for (const key of state.selection) {
					const [type, id] = key.split(':');
					const item = readTopo()[collectionForType(type)]?.find((entry) => sameId(entry.id, id));
					if (item?.position2D)
						item.position2D = [item.position2D[0] + move.x, item.position2D[1] + move.y];
				}
				return true;
			}),
		deleteSelection,
		copySelection,
		pasteSelection,
		clearClipboard: () => (state.clipboard = []),
		beginRouteDraft: (mode = 'route') =>
			(state.drafts[mode === 'multipitch' ? 'multipitch' : 'route'] = {
				points: [],
				fixPointIds: [],
				mode
			}),
		appendRouteDraftPoint: (point, fixPointId = null, mode = 'route') => {
			const draft = state.drafts[mode === 'multipitch' ? 'multipitch' : 'route'];
			draft.points.push(clone(point));
			if (fixPointId) draft.fixPointIds.push(fixPointId);
			updatePendingChanges();
			return draft;
		},
		commitRouteDraft: (item = null, mode = 'route') => {
			const draft = state.drafts[mode === 'multipitch' ? 'multipitch' : 'route'];
			if (draft.points.length < 2) return false;
			const result = item ? state.addRoute(item) : clone(draft);
			state.drafts.route = createDrafts().route;
			state.drafts.multipitch = createDrafts().multipitch;
			updatePendingChanges();
			return result;
		},
		cancelRouteDraft: () => {
			state.drafts.route = createDrafts().route;
			state.drafts.multipitch = createDrafts().multipitch;
			updatePendingChanges();
		},
		beginOutlineDraft: (mode = null) =>
			(state.drafts.outline = { points: [], preview: null, mode }),
		updateOutlineDraft: (points) => {
			state.drafts.outline.points = clone(points);
			updatePendingChanges();
		},
		commitOutlineDraft: (item = null) => {
			if (!state.drafts.outline.points.length) return false;
			const result = item ? state.addOutline(item) : clone(state.drafts.outline);
			state.drafts.outline = createDrafts().outline;
			updatePendingChanges();
			return result;
		},
		cancelOutlineDraft: () => {
			state.drafts.outline = createDrafts().outline;
			updatePendingChanges();
		},
		beginPathEditDraft: (target, points = []) => {
			state.drafts.pathEdit = {
				target: clone(target),
				points: clone(points),
				selectedPointIndex: null
			};
			updatePendingChanges();
		},
		updatePathEditDraft: (points) => {
			state.drafts.pathEdit.points = clone(points);
			updatePendingChanges();
		},
		selectPathEditPoint: (index) => (state.drafts.pathEdit.selectedPointIndex = index),
		commitPathEditDraft: () => {
			const result = clone(state.drafts.pathEdit);
			state.drafts.pathEdit = createDrafts().pathEdit;
			updatePendingChanges();
			return result;
		},
		cancelPathEditDraft: () => {
			state.drafts.pathEdit = createDrafts().pathEdit;
			updatePendingChanges();
		},
		beginTextEdit: (id, { isNew = false } = {}) => {
			const item = (readTopo().textLabels || []).find((label) => sameId(label.id, id));
			if (!item) return false;
			state.drafts.text = {
				id,
				value: item.text || '',
				originalValue: item.text || '',
				isNew
			};
			updatePendingChanges();
			return true;
		},
		setTextEditValue: (value) => {
			state.drafts.text.value = value;
			updatePendingChanges();
		},
		finishTextEdit: () => {
			state.drafts.text = createDrafts().text;
			updatePendingChanges();
		},
		load,
		reset,
		getSaveSnapshot: snapshot
	});
	state.history.savedSnapshot = snapshot();
	state.startInteraction = (kind, details = {}) => {
		state.interaction = { kind, ...details };
		state.interactionState = state.interaction;
	};
	state.updateInteraction = (patch) => {
		if (!state.interaction) return;
		Object.assign(state.interaction, patch);
		state.interactionState = state.interaction;
	};
	state.endInteraction = () => {
		const done = state.interaction;
		state.interaction = null;
		state.interactionState = null;
		return done;
	};
	state.cancelInteraction = state.endInteraction;
	return state;
}
