import type { OutlineDraft } from '$lib/assets/js/outline-geometry.ts';
import { getContext, setContext } from 'svelte';
import type {
	FelsTopoDocument,
	FixPoint,
	Pitch,
	Route,
	TextLabel,
	Variant
} from '@vorstieg/fels-types/types';
import type { TopoDrawingTarget } from './topo-drawing-target.ts';
import type { Topo2DInteraction } from './topo-2d-editor-interactions.ts';
import {
	generateId,
	generateOutlineId,
	generateSymbolId,
	generateTextId
} from '$lib/assets/js/id-utils.ts';
import { translateOutline } from '$lib/assets/js/outline-geometry.ts';
import {
	createInitialClustering,
	createInitialTopo,
	createInitialTopo2DEditorDrafts,
	createInitialTopo2DEditorTransientState,
	createInitialTopo2DEditorUi
} from './topo-2d-editor-initial-state.ts';
import type {
	Topo2DEditorClustering,
	Topo2DEditorDocument,
	Topo2DEditorDrafts,
	Topo2DEditorTransientState,
	Topo2DEditorUi
} from './topo-2d-editor-initial-state.ts';
export { createInitialClustering, createInitialTopo };
type Id = string | number;
type Collection = 'routes' | 'outlines' | 'fixPoints' | 'textLabels';
type SelectionType = 'route' | 'outline' | 'symbol' | 'text' | 'pitch' | 'variant' | 'path';
type TopLevelSelectionType = 'route' | 'outline' | 'symbol' | 'text';
type SelectionItem = { type: SelectionType; id: Id };
type Point = { x: number; y: number };
type RoutePoint = { routeId: Id; pitchId?: Id | null; variantId?: Id | null; index: number };
type Viewport = { baseWidth: number; baseHeight: number; transform: unknown | null };
type CanvasSize = Pick<Viewport, 'baseWidth' | 'baseHeight'>;
type History = {
	entries: Topo2DEditorDocument[];
	index: number;
	savedSnapshot: Topo2DEditorDocument | null;
};
type ClipboardItem =
	| { type: 'outline'; item: OutlineDraft }
	| { type: 'symbol'; item: FixPoint }
	| { type: 'text'; item: TextLabel };
type HistoryOptions = { recordHistory?: boolean };
type RouteTarget = { type: 'pitch'; pitchId: Id } | { type: 'variant'; variantId: Id } | null;
type WrappedSessionInput = {
	topo: FelsTopoDocument | Topo2DEditorDocument;
	editorMode?: '2d' | '3d';
	has3DTopoAvailable?: boolean;
	entryPath?: string;
	topoFileName?: string;
	name?: string;
	modelOffset?: [number, number, number];
	modelRotation?: [number, number, number];
	modelScale?: [number, number, number];
	scale?: number;
	canvasAspectRatio?: number;
	clustering?: Topo2DEditorClustering;
	glbBlob?: Blob | File | null;
};
type EditableTopoFields = {
	author: string;
	description: string;
	tags: string[];
	image2D: string | null;
	backgroundFit: 'contain' | 'cover';
	wallAzimuth: number;
};
type EditorData = {
	topo: Topo2DEditorDocument;
	ui: Topo2DEditorUi;
	interaction: Topo2DInteraction | null;
	drafts: Topo2DEditorDrafts;
	clipboard: ClipboardItem[];
	viewport: Viewport;
	history: History;
	selection: Set<string>;
	selectedRoutePoints: Set<string>;
	selectedItems: Set<string>;
	selectedSymbolInstance: FixPoint | null;
	hasPendingChanges: boolean;
	transient: Topo2DEditorTransientState;
	clustering: Topo2DEditorClustering;
};
const HISTORY_LIMIT = 50;
const PASTE_OFFSET_PX = 16;
const COLLECTION_BY_TYPE: Record<TopLevelSelectionType, Collection> = {
	route: 'routes',
	outline: 'outlines',
	symbol: 'fixPoints',
	text: 'textLabels'
};
const TYPE_BY_COLLECTION: Record<Collection, TopLevelSelectionType> = {
	routes: 'route',
	outlines: 'outline',
	fixPoints: 'symbol',
	textLabels: 'text'
};
const isTopLevelSelectionType = (type: string): type is TopLevelSelectionType =>
	type in COLLECTION_BY_TYPE;
const collectionForType = (type: TopLevelSelectionType): Collection => COLLECTION_BY_TYPE[type];
const collection = <K extends Collection>(topo: Topo2DEditorDocument, key: K) => topo[key];
const setCollection = <K extends Collection>(
	topo: Topo2DEditorDocument,
	key: K,
	items: Topo2DEditorDocument[K]
) => {
	topo[key] = items;
};
const sameId = (left: Id, right: Id) => String(left) === String(right);
const routePointKey = ({ routeId, pitchId = null, variantId = null, index }: RoutePoint) =>
	JSON.stringify([
		String(routeId),
		pitchId == null ? null : String(pitchId),
		variantId == null ? null : String(variantId),
		index
	]);
const nextTextId = (topo: Topo2DEditorDocument) => {
	let id: string;
	do id = generateTextId();
	while ((topo.textLabels || []).some((label) => sameId(label.id, id)));
	return id;
};
export const TOPO_2D_EDITOR_STATE = Symbol('topo-2d-editor-state');
export function provideTopo2DEditorState(state: ReturnType<typeof createTopo2DEditorState>) {
	setContext(TOPO_2D_EDITOR_STATE, state);
	return state;
}
export function getTopo2DEditorState() {
	const state = getContext<ReturnType<typeof createTopo2DEditorState> | undefined>(
		TOPO_2D_EDITOR_STATE
	);
	if (!state) throw new Error('Topo editor state is not available in this component tree');
	return state;
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const nextPitchId = (topo: Topo2DEditorDocument) => {
	let id: string;
	do id = generateId('pitch');
	while (
		(topo.routes || []).some((route) => (route.pitches || []).some((pitch) => sameId(pitch.id, id)))
	);
	return id;
};
const renumberPitches = (route: Route) => {
	(route?.pitches || []).forEach((pitch, index) => {
		pitch.pitchNumber = index + 1;
	});
};
function createTransientState() {
	return createInitialTopo2DEditorTransientState();
}
function createDrafts() {
	return createInitialTopo2DEditorDrafts();
}
function createUi() {
	return createInitialTopo2DEditorUi();
}
function itemsForType(topo: Topo2DEditorDocument, type: string): Array<{ id: Id }> {
	if (type === 'route') return topo.routes;
	if (type === 'outline') return topo.outlines;
	if (type === 'symbol') return topo.fixPoints;
	if (type === 'text') return topo.textLabels;
	if (type === 'pitch') return topo.routes.flatMap((route) => route.pitches || []);
	if (type === 'variant') return topo.routes.flatMap((route) => route.variants || []);
	if (type === 'path')
		return topo.routes.flatMap((route) =>
			(route.pathRefs || []).map((path) => ({ id: path.pathId }))
		);
	return [];
}
function drawingTargetExists(topo: Topo2DEditorDocument, drawingTarget: TopoDrawingTarget | null) {
	if (!drawingTarget) return true;
	const route = (topo.routes || []).find((item) => item.id === drawingTarget.routeId);
	if (drawingTarget.type === 'route' || drawingTarget.type === 'newPitch') return Boolean(route);
	if (drawingTarget.type === 'pitch')
		return Boolean(route?.pitches?.some((item) => item.id === drawingTarget.pitchId));
	if (drawingTarget.type === 'variant')
		return Boolean(route?.variants?.some((item) => item.id === drawingTarget.variantId));
	return true;
}
/**
 * Creates the single store for one topo editing surface.
 */
export function createTopo2DEditorState({
	topo
}: {
	topo?: Partial<Topo2DEditorDocument>;
} = {}) {
	const initialUi = createInitialTopo2DEditorUi();
	const state = $state({
		topo: createInitialTopo(topo ? clone(topo) : undefined),
		ui: initialUi,
		interaction: null,
		drafts: createDrafts(),
		clipboard: [],
		viewport: { baseWidth: 1, baseHeight: 1, transform: null },
		history: { entries: [], index: -1, savedSnapshot: null },
		selection: new Set(),
		selectedRoutePoints: new Set(),
		selectedItems: new Set(),
		selectedSymbolInstance: null,
		hasPendingChanges: false,
		transient: createTransientState(),
		clustering: createInitialClustering(),
		...createActions()
	}) as EditorData & ReturnType<typeof createActions>;
	const readTopo = () => state.topo;
	const writeTopo = (next: Topo2DEditorDocument) => {
		state.topo = next;
	};
	const snapshot = () => {
		return clone(readTopo());
	};
	function setModelFile(file: Blob | File | null) {
		if (state.transient.modelUrl) URL.revokeObjectURL(state.transient.modelUrl);
		state.transient.glbBlob = file || null;
		state.transient.modelUrl = file ? URL.createObjectURL(file) : null;
		state.transient.modelRevision++;
	}
	function loadSession(session: WrappedSessionInput | null, id: string | null = null) {
		const document = session?.topo || createInitialTopo();
		if (state.transient.modelUrl) URL.revokeObjectURL(state.transient.modelUrl);
		state.transient = createTransientState();
		state.ui = createUi();
		state.ui.editorMode = session?.editorMode || '3d';
		state.ui.has3DTopoAvailable = Boolean(session?.has3DTopoAvailable);
		state.ui.entryPath = session?.entryPath || null;
		state.ui.topoFileName = session?.topoFileName || null;
		state.ui.name = session?.name || '';
		state.ui.modelOffset = session?.modelOffset || [0, 0, 0];
		state.ui.modelRotation = session?.modelRotation || [0, 0, 0];
		state.ui.modelScale = session?.modelScale || [1, 1, 1];
		state.ui.scale = session?.scale || 1;
		state.ui.canvasAspectRatio = session?.canvasAspectRatio || document.imageAspectRatio || 1.5;
		writeTopo(createInitialTopo(clone(document)));
		state.clustering = session?.clustering ? clone(session.clustering) : createInitialClustering();
		if (session?.glbBlob) setModelFile(session.glbBlob);
		state.ui.activeDraftId = id;
		state.selection = new Set();
		state.selectedItems = new Set<string>();
		projectSelection();
		state.history = { entries: [], index: -1, savedSnapshot: null };
		saveHistory();
	}
	function getSaveSession() {
		return {
			topo: state.topo,
			clustering: state.clustering,
			glbBlob: state.transient.glbBlob,
			editorMode: state.ui.editorMode,
			has3DTopoAvailable: state.ui.has3DTopoAvailable,
			entryPath: state.ui.entryPath || undefined,
			topoFileName: state.ui.topoFileName || undefined,
			name: state.ui.name,
			modelOffset: state.ui.modelOffset,
			modelRotation: state.ui.modelRotation,
			modelScale: state.ui.modelScale,
			scale: state.ui.scale,
			canvasAspectRatio: state.ui.canvasAspectRatio
		};
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
	function selectObject(type: SelectionType, id: Id, multi = false) {
		if (!multi || type !== 'route') state.selectedRoutePoints = new Set();
		if (!multi) state.selection = new Set();
		const key = `${type}:${id}`;
		if (multi && state.selection.has(key)) state.selection.delete(key);
		else state.selection.add(key);
		projectSelection();
	}
	function selectRoutePoints(
		points: RoutePoint[],
		mode: 'replace' | 'add' | 'subtract' = 'replace'
	) {
		const next = mode === 'replace' ? new Set<string>() : new Set(state.selectedRoutePoints);
		for (const point of points || []) {
			const key = routePointKey(point);
			if (mode === 'subtract') next.delete(key);
			else next.add(key);
		}
		state.selectedRoutePoints = next;
	}
	function selectItems(items: SelectionItem[], mode: 'replace' | 'add' | 'subtract' = 'replace') {
		if (mode === 'replace') state.selection = new Set();
		for (const { type, id } of items) {
			const key = `${type}:${id}`;
			if (mode === 'subtract') state.selection.delete(key);
			else state.selection.add(key);
		}
		projectSelection();
	}
	function selectPath(kind: 'pitch' | 'variant' | 'path', routeId: Id, pathId: Id) {
		state.selection = new Set([`route:${routeId}`, `${kind}:${pathId}`]);
		projectSelection();
	}
	function removeItems(items: SelectionItem[]) {
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
	function restore(next: Topo2DEditorDocument) {
		writeTopo(clone(next));
		reconcileSelection();
		state.interaction = null;
		state.drafts = createDrafts();
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
	function commit<T>(label: string, mutator: (topo: Topo2DEditorDocument) => T): T | false {
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
		if ('fixPointIds' in draft) draft.fixPointIds.pop();
		updatePendingChanges();
		return true;
	}
	function updateTopoField<K extends keyof EditableTopoFields>(
		field: K,
		value: EditableTopoFields[K]
	) {
		return commit('Update topo field', () => {
			const topo = readTopo() as unknown as EditableTopoFields;
			topo[field] = clone(value);
			return true;
		});
	}
	function collectionMethod<K extends Collection>(
		key: K,
		item: Topo2DEditorDocument[K][number],
		label: string,
		{ recordHistory = true }: { recordHistory?: boolean } = {}
	) {
		const mutate = () => {
			const topo = readTopo();
			setCollection(topo, key, [...collection(topo, key), clone(item)] as Topo2DEditorDocument[K]);
			return item;
		};
		if (!recordHistory) {
			return mutate();
		}
		return commit(label, mutate);
	}
	function updateItem<K extends Collection>(
		key: K,
		id: Id,
		changes: Partial<Topo2DEditorDocument[K][number]>,
		label: string,
		{ recordHistory = true }: { recordHistory?: boolean } = {}
	) {
		const mutate = () => {
			const item = collection(readTopo(), key).find((entry) => sameId(entry.id, id));
			if (!item) return false;
			Object.assign(item, clone(changes));
			return item;
		};
		return recordHistory ? commit(label, mutate) : mutate();
	}
	function removeItem<K extends Collection>(
		key: K,
		id: Id,
		label: string,
		{ recordHistory = true }: { recordHistory?: boolean } = {}
	) {
		const mutate = () => {
			const topo = readTopo();
			const before = collection(topo, key);
			if (!before.some((item) => sameId(item.id, id))) return false;
			setCollection(
				topo,
				key,
				before.filter((item) => !sameId(item.id, id)) as Topo2DEditorDocument[K]
			);
			removeItems([{ type: TYPE_BY_COLLECTION[key], id }]);
			if (key === 'fixPoints') {
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
				if (!isTopLevelSelectionType(type)) continue;
				const collection = collectionForType(type);
				const topo = readTopo();
				const before = topo[collection];
				if (!before.some((item) => sameId(item.id, id))) continue;
				setCollection(
					topo,
					collection,
					before.filter((item) => !sameId(item.id, id)) as typeof before
				);
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
	function deleteItems(
		collection: Collection,
		ids: Id[],
		type: string,
		{ recordHistory = true }: HistoryOptions = {}
	) {
		let changed = false;
		for (const id of ids)
			changed = Boolean(removeItem(collection, id, `Remove ${type}`, { recordHistory })) || changed;
		return changed;
	}
	function copySelection() {
		const clipboard: ClipboardItem[] = [];
		for (const key of state.selection) {
			const [type, id] = key.split(':');
			if (type === 'outline') {
				const item = readTopo().outlines.find((entry) => sameId(entry.id, id));
				if (item) clipboard.push({ type, item: clone(item) });
			} else if (type === 'symbol') {
				const item = readTopo().fixPoints.find((entry) => sameId(entry.id, id));
				if (item) clipboard.push({ type, item: clone(item) });
			} else if (type === 'text') {
				const item = readTopo().textLabels.find((entry) => sameId(entry.id, id));
				if (item) clipboard.push({ type, item: clone(item) });
			}
		}
		state.clipboard = clipboard;
		return state.clipboard.length;
	}
	function pasteSelection(canvasSize: CanvasSize = state.viewport) {
		return commit('Paste selection', () => {
			const topo = readTopo();
			const dx = PASTE_OFFSET_PX / (canvasSize.baseWidth || 1);
			const dy = PASTE_OFFSET_PX / (canvasSize.baseHeight || 1);
			const pasted: SelectionItem[] = [];
			for (const entry of state.clipboard) {
				if (entry.type === 'outline') {
					const copy = clone(entry.item);
					copy.id = generateOutlineId();
					translateOutline(copy, dx, dy, canvasSize);
					topo.outlines.push(copy);
					pasted.push({ type: entry.type, id: copy.id });
				} else if (entry.type === 'symbol') {
					const copy = clone(entry.item);
					copy.id = generateSymbolId();
					if (copy.position2D) copy.position2D = [copy.position2D[0] + dx, copy.position2D[1] + dy];
					topo.fixPoints.push(copy);
					pasted.push({ type: entry.type, id: copy.id });
				} else {
					const copy = clone(entry.item);
					copy.id = nextTextId(topo);
					if (copy.position2D) copy.position2D = [copy.position2D[0] + dx, copy.position2D[1] + dy];
					topo.textLabels.push(copy);
					pasted.push({ type: entry.type, id: copy.id });
				}
			}
			selectItems(pasted);
			return pasted;
		});
	}
	function load(nextTopo: Partial<Topo2DEditorDocument> | null) {
		writeTopo(createInitialTopo(nextTopo ? clone(nextTopo) : undefined));
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
	function createSymbol(point: Point, type: string, values: Partial<FixPoint> = {}) {
		const item: FixPoint = {
			id: generateSymbolId(),
			type,
			position2D: [point.x, point.y],
			rotation2D: 0,
			scale2D: ['bolt', 'piton'].includes(type) ? 0.5 : 1,
			scaleX2D: 1,
			scaleY2D: 1,
			...values
		};
		collectionMethod('fixPoints', item, 'Add fixpoint');
		return item.id;
	}
	function createTextLabel(point: Point, values: Partial<TextLabel> = {}) {
		const item: TextLabel = {
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
	function appendRoutePoint(
		routeId: Id,
		target: RouteTarget,
		point: Point,
		{ recordHistory = true }: HistoryOptions = {}
	) {
		const mutate = () => {
			const route = readTopo().routes.find((entry) => entry.id === routeId);
			const path =
				target?.type === 'pitch'
					? route?.pitches?.find((entry) => entry.id === target.pitchId)
					: target?.type === 'variant'
						? route?.variants?.find((entry) => entry.id === target.variantId)
						: route;
			if (!path) return false;
			// Drawing an existing pitch or variant can temporarily leave it with just one point.
			path.points2D = [...(path.points2D || []), [point.x, point.y]] as NonNullable<
				Route['points2D']
			>;
			return path;
		};
		return recordHistory ? commit('Append route point', mutate) : mutate();
	}
	function appendOutlinePoint(
		outlineId: Id,
		point: Point,
		{ recordHistory = true }: HistoryOptions = {}
	) {
		const mutate = () => {
			const outline = readTopo().outlines.find((entry) => entry.id === outlineId);
			if (!outline) return false;
			outline.points2D = [...(outline.points2D || []), [point.x, point.y]];
			outline.shape = { type: 'polyline' };
			return true;
		};
		return recordHistory ? commit('Append outline point', mutate) : mutate();
	}
	function moveRouteLabel(
		routeId: Id,
		{ pitchId = null, variantId = null }: { pitchId?: Id | null; variantId?: Id | null } = {},
		mouse: Point
	) {
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
	function createInteractionActions() {
		return {
			startInteraction: (interaction: Topo2DInteraction) => {
				state.interaction = interaction;
			},
			endInteraction: () => {
				const done = state.interaction;
				state.interaction = null;
				return done;
			},
			cancelInteraction: () => state.endInteraction()
		};
	}
	function createActions() {
		return {
			...createInteractionActions(),
			selectObject,
			selectPath,
			selectItems,
			selectRoutePoints,
			isRoutePointSelected: (target: RoutePoint) =>
				state.selectedRoutePoints.has(routePointKey(target)),
			getSelectedRoutePoints: (): RoutePoint[] =>
				[...state.selectedRoutePoints].map((key) => {
					const [routeId, pitchId, variantId, index] = JSON.parse(key) as [
						string,
						string | null,
						string | null,
						number
					];
					return { routeId, pitchId, variantId, index };
				}),
			removeItems,
			clearSelection,
			loadSession,
			getSaveSession,
			setModelFile,
			markModelChanged: () => state.transient.modelRevision++,
			reconcileSelection,
			selectedId: (type: SelectionType) =>
				[...state.selection].find((key) => key.startsWith(`${type}:`))?.split(':')[1] || null,
			isSelected: (type: SelectionType, id: Id) => state.selection.has(`${type}:${id}`),
			setActiveTool: (tool: string) => (state.ui.activeTool = tool || 'select'),
			setSelectedSymbol: (symbol: string) => (state.ui.selectedSymbol = symbol),
			setSelectedOutlineStyle: (style: string) => (state.ui.selectedOutlineStyle = style),
			setSnapRoutesToAnchors: (enabled: boolean) =>
				(state.ui.snapRoutesToAnchors = Boolean(enabled)),
			setDrawingTarget: (target: TopoDrawingTarget | null) => {
				state.ui.drawingTarget = target;
				updatePendingChanges();
			},
			setMobileSelectionMode: (enabled: boolean) =>
				(state.ui.mobileSelectionMode = Boolean(enabled)),
			setShiftPressed: (pressed: boolean) => (state.ui.isShiftPressed = Boolean(pressed)),
			setDraftPending: (pending: boolean) => (state.hasPendingChanges = Boolean(pending)),
			commit,
			mutateDocument: <T>(mutator: (topo: Topo2DEditorDocument) => T): T => mutator(readTopo()),
			refreshPendingChanges: updatePendingChanges,
			undo,
			redo,
			saveHistory,
			undoDraftPoint,
			clearHistory,
			markSaved,
			addRoute: (item: Route, options?: { recordHistory?: boolean }) =>
				collectionMethod('routes', item, 'Add route', options),
			updateRoute: (id: Id, changes: Partial<Route>, options?: HistoryOptions) =>
				updateItem('routes', id, changes, 'Update route', options),
			removeRoute: (id: Id) => removeItem('routes', id, 'Remove route'),
			addPitch: (routeId: Id, item: Pitch, { recordHistory = true }: HistoryOptions = {}) => {
				const mutate = () => {
					const route = readTopo().routes.find((entry) => entry.id === routeId);
					if (!route) return false;
					route.pitches = [...(route.pitches || []), clone(item)];
					return true;
				};
				return recordHistory ? commit('Add pitch', mutate) : mutate();
			},
			updatePitch: (routeId: Id, id: Id, changes: Partial<Pitch>) =>
				commit('Update pitch', () => {
					const item = readTopo()
						.routes.find((r) => r.id === routeId)
						?.pitches?.find((p) => p.id === id);
					if (!item) return false;
					Object.assign(item, clone(changes));
					return true;
				}),
			duplicatePitch: (sourceRouteId: Id, pitchId: Id, targetRouteId: Id) => {
				let duplicatedId: Id | null = null;
				const result = commit('Duplicate pitch', () => {
					const topo = readTopo();
					const sourceRoute = topo.routes.find((route) => sameId(route.id, sourceRouteId));
					const targetRoute = topo.routes.find((route) => sameId(route.id, targetRouteId));
					const sourcePitch = sourceRoute?.pitches?.find((pitch) => sameId(pitch.id, pitchId));
					if (!sourcePitch || !targetRoute) return false;
					const duplicate = clone(sourcePitch);
					const id = nextPitchId(topo);
					duplicatedId = id;
					duplicate.id = id;
					duplicate.type = 'pitch';
					const targetTypes = Array.isArray(targetRoute.type)
						? targetRoute.type
						: targetRoute.type
							? [targetRoute.type]
							: [];
					if (!targetTypes.includes('multi-pitch'))
						(targetRoute as unknown as { type: string[] }).type = [...targetTypes, 'multi-pitch'];
					targetRoute.pitches = [...(targetRoute.pitches || []), duplicate];
					renumberPitches(targetRoute);
					return true;
				});
				if (result && duplicatedId) selectPath('pitch', targetRouteId, duplicatedId);
				return result ? duplicatedId : null;
			},
			movePitch: (routeId: Id, pitchId: Id, direction: number) => {
				const result = commit('Move pitch', () => {
					const route = readTopo().routes.find((entry) => sameId(entry.id, routeId));
					if (!route?.pitches?.length) return false;
					const from = route.pitches.findIndex((pitch) => sameId(pitch.id, pitchId));
					const to = from + Number(direction);
					if (from < 0 || to < 0 || to >= route.pitches.length) return false;
					const [pitch] = route.pitches.splice(from, 1);
					route.pitches.splice(to, 0, pitch);
					renumberPitches(route);
					return true;
				});
				if (result) selectPath('pitch', routeId, pitchId);
				return result;
			},
			removePitch: (routeId: Id, id: Id) =>
				commit('Remove pitch', () => {
					const route = readTopo().routes.find((r) => r.id === routeId);
					if (!route?.pitches?.some((p) => p.id === id)) return false;
					route.pitches = route.pitches.filter((p) => p.id !== id);
					renumberPitches(route);
					reconcileSelection();
					return true;
				}),
			removeVariant: (routeId: Id, id: Id) =>
				commit('Remove route variant', () => {
					const route = readTopo().routes.find((r) => r.id === routeId);
					if (!route?.variants?.some((variant) => variant.id === id)) return false;
					route.variants = route.variants.filter((variant) => variant.id !== id);
					reconcileSelection();
					return true;
				}),
			updateVariant: (routeId: Id, id: Id, changes: Partial<Variant>) =>
				commit('Update variant', () => {
					const item = readTopo()
						.routes.find((r) => r.id === routeId)
						?.variants?.find((p) => p.id === id);
					if (!item) return false;
					Object.assign(item, clone(changes));
					return true;
				}),
			addFixpoint: (item: FixPoint) => collectionMethod('fixPoints', item, 'Add fixpoint'),
			updateFixpoint: (id: Id, changes: Partial<FixPoint>, options?: HistoryOptions) =>
				updateItem('fixPoints', id, changes, 'Update fixpoint', options),
			removeFixpoint: (id: Id) => removeItem('fixPoints', id, 'Remove fixpoint'),
			addOutline: (item: OutlineDraft) => collectionMethod('outlines', item, 'Add outline'),
			updateOutline: (id: Id, changes: Partial<OutlineDraft>, options?: HistoryOptions) =>
				updateItem('outlines', id, changes, 'Update outline', options),
			removeOutline: (id: Id) => removeItem('outlines', id, 'Remove outline'),
			addTextLabel: (item: TextLabel, options?: HistoryOptions) =>
				collectionMethod('textLabels', item, 'Add text label', options),
			updateTextLabel: (id: Id, changes: Partial<TextLabel>, options?: HistoryOptions) =>
				updateItem('textLabels', id, changes, 'Update text label', options),
			removeTextLabel: (id: Id, options?: HistoryOptions) =>
				removeItem('textLabels', id, 'Remove text label', options),
			createTextLabel,
			createSymbol,
			appendRoutePoint,
			appendOutlinePoint,
			moveRouteLabel,
			deleteOutlines: (ids: Id[], options?: HistoryOptions) =>
				deleteItems('outlines', ids, 'outline', options),
			deleteSymbols: (ids: Id[], options?: HistoryOptions) =>
				deleteItems('fixPoints', ids, 'fixpoint', options),
			deleteRoutes: (ids: Id[], options?: HistoryOptions) =>
				deleteItems('routes', ids, 'route', options),
			deleteTextLabels: (ids: Id[], options?: HistoryOptions) =>
				deleteItems('textLabels', ids, 'text label', options),
			deleteSymbolAt: (point: Point, tolerance = 0.02) => {
				const item = readTopo().fixPoints.find(
					(entry) =>
						entry.position2D &&
						Math.abs(entry.position2D[0] - point.x) < tolerance &&
						Math.abs(entry.position2D[1] - point.y) < tolerance
				);
				return item ? state.removeFixpoint(item.id) : false;
			},
			updateTopoField,
			moveSelectedItems: (move: Point) =>
				commit('Move selection', () => {
					for (const key of state.selection) {
						const [type, id] = key.split(':');
						const topo = readTopo();
						const item =
							type === 'symbol'
								? topo.fixPoints.find((entry) => sameId(entry.id, id))
								: type === 'text'
									? topo.textLabels.find((entry) => sameId(entry.id, id))
									: null;
						if (item?.position2D)
							item.position2D = [item.position2D[0] + move.x, item.position2D[1] + move.y];
					}
					return true;
				}),
			deleteSelection,
			copySelection,
			pasteSelection,
			clearClipboard: () => (state.clipboard = []),
			beginRouteDraft: (mode: string = 'route') => {
				if (mode === 'multipitch') {
					state.drafts.multipitch = createDrafts().multipitch;
					return state.drafts.multipitch;
				}
				state.drafts.route = { ...createDrafts().route, mode };
				return state.drafts.route;
			},
			appendRouteDraftPoint: (point: number[], fixPointId: Id | null = null, mode = 'route') => {
				const draft = state.drafts[mode === 'multipitch' ? 'multipitch' : 'route'];
				draft.points.push(clone(point));
				if (fixPointId) draft.fixPointIds.push(fixPointId);
				updatePendingChanges();
				return draft;
			},
			commitRouteDraft: (item: Route | null = null, mode = 'route') => {
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
			beginOutlineDraft: (mode: string | null = null) =>
				(state.drafts.outline = { ...createDrafts().outline, mode }),
			updateOutlineDraft: (points: number[][]) => {
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
			beginPathEditDraft: (target: unknown, points: number[][] = []) => {
				state.drafts.pathEdit = {
					target: clone(target),
					points: clone(points),
					selectedPointIndex: null
				};
				updatePendingChanges();
			},
			updatePathEditDraft: (points: number[][]) => {
				state.drafts.pathEdit.points = clone(points);
				updatePendingChanges();
			},
			selectPathEditPoint: (index: number | null) =>
				(state.drafts.pathEdit.selectedPointIndex = index),
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
			beginTextEdit: (id: Id, { isNew = false }: { isNew?: boolean } = {}) => {
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
			setTextEditValue: (value: string) => {
				state.drafts.text.value = value;
				updatePendingChanges();
			},
			finishTextEdit: () => {
				state.drafts.text = createDrafts().text;
				updatePendingChanges();
			},
			load,
			reset,
			getSaveSnapshot: () => snapshot()
		};
	}
	state.history.savedSnapshot = snapshot();
	return state;
}
