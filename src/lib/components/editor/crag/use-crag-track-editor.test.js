import { createCragTrackPersistence } from './create-crag-track-persistence.ts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCragRouteTool } from './CragRouteTool.svelte.ts';
import { useCragTrackEditor } from './use-crag-track-editor.svelte.ts';
import { createCragEditorSession, createFelsEntry } from '$lib/state/crag-session.svelte.ts';

vi.hoisted(() => {
	URL.createObjectURL = () => 'blob:test';
});

const coordinates = [
	[0, 0],
	[1, 0],
	[2, 0],
	[3, 0]
];
function fixture() {
	const state = createCragEditorSession();
	state.workspace = {
		entry: createFelsEntry('crag', { id: 'wall', name: 'Wall' }),
		path: 'crags',
		childEntries: [],
		topo: null,
		access: {
			type: 'FeatureCollection',
			features: [
				{
					type: 'Feature',
					id: 'a',
					properties: { kind: 'approach', name: 'Trail', description: 'Keep me' },
					geometry: { type: 'LineString', coordinates }
				}
			]
		},
		dirtyPaths: [],
		removedPaths: [],
		images: []
	};
	state.activeWorkspaceEntryPath = 'crags/wall';
	let tool = 'select';
	const canvas = document.createElement('canvas');
	document.body.append(canvas);
	canvas.setPointerCapture = () => {};
	canvas.releasePointerCapture = () => {};
	canvas.hasPointerCapture = () => false;
	const gesture = () => {
		let enabled = true;
		return {
			isEnabled: () => enabled,
			enable: () => {
				enabled = true;
			},
			disable: () => {
				enabled = false;
			}
		};
	};
	let renderedFeatures = [];
	const map = {
		getLayer: () => ({}),
		queryRenderedFeatures: vi.fn(() => renderedFeatures),
		getCanvas: () => canvas,
		project: ([x, y]) => ({ x: x * 100, y: y * 100 }),
		unproject: ([x, y]) => ({ lng: x / 100, lat: y / 100 }),
		fitBounds: vi.fn(),
		dragPan: gesture(),
		touchZoomRotate: gesture()
	};
	const editor = useCragTrackEditor({
		persistence: createCragTrackPersistence(state),
		getMap: () => map,
		getActiveTool: () => tool,
		setActiveTool: (next) => {
			tool = next;
		}
	});
	function click(x, y = 0, extra = {}) {
		return editor.handleMapClick({
			point: { x, y },
			lngLat: { lng: x / 100, lat: y / 100 },
			originalEvent: new MouseEvent('click', extra)
		});
	}
	function pointer(type, x, y = 0, pointerType = 'touch', pointerId = 1) {
		const event = new MouseEvent(type, {
			clientX: x,
			clientY: y,
			button: 0,
			bubbles: true,
			cancelable: true
		});
		Object.defineProperties(event, {
			pointerType: { value: pointerType },
			pointerId: { value: pointerId }
		});
		canvas.dispatchEvent(event);
	}
	return {
		editor,
		state,
		map,
		canvas,
		click,
		pointer,
		tool: () => tool,
		setHit: (properties) => {
			renderedFeatures = properties ? [{ properties }] : [];
		}
	};
}
afterEach(() => {
	vi.unstubAllGlobals();
	document.body.replaceChildren();
});

describe('track draft transactions', () => {
	it('preserves a recording with altitude when reversing points at the same map location', () => {
		const { editor, state } = fixture();
		state.workspace.access.features[0].geometry.coordinates = [
			[16, 48, 100],
			[16, 48, 200],
			[16, 48, 300]
		];
		editor.editTrack('a');
		editor.reverseTrack();
		expect(editor.isDirty).toBe(true);
		expect(editor.requestLeave(() => {})).toBe(true);
		expect(state.workspace.access.features[0].geometry.coordinates).toEqual([
			[16, 48, 300],
			[16, 48, 200],
			[16, 48, 100]
		]);
	});
	it('uses one primary action for picking, previewing, and applying an operation', () => {
		const { editor, click } = fixture();
		editor.editTrack('a');
		expect(editor.operation).toEqual({ kind: 'idle' });
		expect(editor.primaryAction).toMatchObject({
			label: 'track.done',
			disabled: false,
			placement: 'toolbar'
		});
		editor.startTrackSplit();
		expect(editor.operation).toEqual({ kind: 'split', preview: null });
		expect(editor.primaryAction).toMatchObject({ label: 'track.applySplit', disabled: true });
		click(150);
		expect(editor.primaryAction.disabled).toBe(false);
		editor.primaryAction.run();
		expect(editor.operation).toEqual({ kind: 'idle' });
		expect(editor.primaryAction.label).toBe('track.done');
		expect(editor.draftTails).toHaveLength(1);
	});
	it('does not alter an untouched recording when Undo is exhausted', () => {
		const { editor } = fixture();
		editor.editTrack('a');
		expect(editor.undoTrackPoint()).toBe(false);
		expect(editor.currentTrackPoints).toEqual(coordinates);
	});
	it('deletion supports Undo and Redo without modifying the workspace before Finish', () => {
		const { editor, state } = fixture();
		editor.editTrack('a');
		editor.toggleTrackPointSelection(1);
		editor.deleteSelectedTrackPoints();
		expect(state.workspace.access.features[0].geometry.coordinates).toEqual(coordinates);
		expect(editor.undoTrackPoint()).toBe(true);
		expect(editor.currentTrackPoints).toEqual(coordinates);
		expect(editor.redoTrackPoint()).toBe(true);
		expect(editor.finalizeTrack()).toBe(true);
		expect(state.workspace.access.features[0].geometry.coordinates).toEqual([
			[0, 0],
			[2, 0],
			[3, 0]
		]);
		expect(state.workspace.access.features[0].properties.description).toBe('Keep me');
		expect(state.history.entries).toHaveLength(1);
	});
	it('cancels a split without changing the saved track, and stages two tracks in one commit', () => {
		const { editor, state, click } = fixture();
		editor.editTrack('a');
		editor.startTrackSplit();
		click(150);
		expect(editor.operation.kind).toBe('split');
		expect(state.workspace.access.features).toHaveLength(1);
		editor.cancelOperation();
		expect(editor.currentTrackPoints).toEqual(coordinates);
		editor.startTrackSplit();
		click(150);
		editor.confirmOperation();
		expect(editor.draftTails).toHaveLength(1);
		editor.undoTrackPoint();
		expect(editor.draftTails).toHaveLength(0);
		editor.redoTrackPoint();
		editor.finalizeTrack();
		expect(state.workspace.access.features).toHaveLength(2);
		expect(state.history.entries).toHaveLength(1);
		state.undo();
		expect(state.workspace.access.features).toHaveLength(1);
	});
	it('trimming keeps the selected boundary and needs preview confirmation', () => {
		const { editor } = fixture();
		editor.editTrack('a');
		expect(editor.trimTrackEnd(1)).toBe(true);
		expect(editor.currentTrackPoints).toEqual([
			[0, 0],
			[1, 0]
		]);
		expect(editor.canApply).toBe(false);
		editor.cancelOperation();
		expect(editor.currentTrackPoints).toEqual(coordinates);
		editor.trimTrackStart(1);
		editor.confirmOperation();
		expect(editor.currentTrackPoints).toEqual(coordinates.slice(1));
	});
	it('new drawing resets the old tool and Finish produces a classified visible approach', async () => {
		const { editor, state, tool } = fixture();
		editor.editTrack('a');
		editor.setTrackDraftMode('select');
		editor.cancelTrackEdit();
		editor.startRoutingDraft();
		expect(editor.trackDraftMode).toBe('routing');
		editor.setTrackDraftMode('editing');
		await editor.addTrackPoint([5, 5]);
		await editor.addTrackPoint([6, 6]);
		editor.finalizeTrack();
		expect(state.workspace.access.features.at(-1).properties.kind).toBe('approach');
		expect(tool()).toBe('select');
		expect(editor.sessionActive).toBe(false);
		expect(editor.currentTrackPoints).toEqual([]);
	});
	it('switching tools applies valid edits and leaves a workspace Undo step', () => {
		const { editor, state } = fixture();
		editor.editTrack('a');
		editor.reverseTrack();
		let switched = false;
		editor.requestLeave(() => {
			switched = true;
		});
		expect(switched).toBe(true);
		expect(editor.sessionActive).toBe(false);
		expect(state.workspace.access.features[0].geometry.coordinates).toEqual(
			[...coordinates].reverse()
		);
		state.undo();
		expect(state.workspace.access.features[0].geometry.coordinates).toEqual(coordinates);
	});

	it('keeps an incomplete new track when changing tools', async () => {
		const { editor, tool } = fixture();
		editor.startRoutingDraft();
		await editor.addTrackPoint([5, 5]);
		const next = vi.fn();
		expect(editor.requestLeave(next)).toBe(false);
		expect(next).not.toHaveBeenCalled();
		expect(tool()).toBe('track');
		expect(editor.currentTrackPoints).toEqual([[5, 5]]);
		expect(editor.message).toBe('track.incompleteTrack');
	});
	it('keeps pending trim previews until explicitly applied or cancelled', () => {
		const { editor, state } = fixture();
		editor.editTrack('a');
		editor.trimTrackStart(1);
		const next = vi.fn();
		expect(editor.requestLeave(next)).toBe(false);
		expect(next).not.toHaveBeenCalled();
		expect(editor.operation.kind).toBe('trim');
		expect(state.workspace.access.features[0].geometry.coordinates).toEqual(coordinates);
		editor.confirmOperation();
		expect(editor.requestLeave(next)).toBe(true);
		expect(state.workspace.access.features[0].geometry.coordinates).toEqual(coordinates.slice(1));
	});
	it('opening an existing track preserves the camera; fitting is explicit', () => {
		const { editor, map } = fixture();
		editor.editTrack('a');
		expect(map.fitBounds).not.toHaveBeenCalled();
		editor.fitTrackBounds();
		expect(map.fitBounds).toHaveBeenCalledOnce();
	});
	it('explicit discard leaves the saved geometry intact', () => {
		const { editor, state } = fixture();
		editor.editTrack('a');
		editor.reverseTrack();
		editor.cancelTrackEdit();
		expect(editor.sessionActive).toBe(false);
		expect(state.workspace.access.features[0].geometry.coordinates).toEqual(coordinates);
	});
	it('typing does not delete, cancel, or finish a track', () => {
		const { editor } = fixture();
		editor.editTrack('a');
		editor.toggleTrackPointSelection(1);
		const input = document.createElement('input');
		input.addEventListener('keydown', editor.handleKeyDown);
		document.body.append(input);
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
		expect(editor.currentTrackPoints).toHaveLength(4);
		editor.handleKeyDown(new KeyboardEvent('keydown', { key: 'Delete', cancelable: true }));
		expect(editor.currentTrackPoints).toHaveLength(3);
	});
});

describe('touch and desktop map gestures', () => {
	it.each(['mouse', 'touch'])(
		'multi-select adds and removes points through %s pointer events',
		(pointerType) => {
			const { editor, pointer, click } = fixture();
			editor.editTrack('a');
			editor.initTrackPointDragHandlers();
			editor.setMultiSelect(true);
			const tap = (x) => {
				pointer('pointerdown', x, 0, pointerType);
				pointer('pointerup', x, 0, pointerType);
				// MapLibre can emit a click after the pointer gesture; do not toggle twice.
				click(x);
			};
			tap(0);
			expect(editor.selectedTrackPointIndexes).toEqual([0]);
			tap(200);
			expect(editor.selectedTrackPointIndexes).toEqual([0, 2]);
			tap(100);
			expect(editor.selectedTrackPointIndexes).toEqual([0, 2, 1]);
			tap(200);
			expect(editor.selectedTrackPointIndexes).toEqual([0, 1]);
			expect(editor.currentTrackPoints).toEqual(coordinates);
			expect(editor.canUndo).toBe(false);
			editor.setMultiSelect(false);
			tap(300);
			expect(editor.selectedTrackPointIndexes).toEqual([3]);
			editor.cleanup();
		}
	);
	it('dragging a multi-selected point moves the whole selection without toggling it', () => {
		const { editor, pointer, click } = fixture();
		editor.editTrack('a');
		editor.initTrackPointDragHandlers();
		editor.setMultiSelect(true);
		for (const x of [0, 200]) {
			pointer('pointerdown', x);
			pointer('pointerup', x);
			click(x);
		}
		pointer('pointerdown', 200);
		pointer('pointermove', 200, 20);
		pointer('pointerup', 200, 20);
		click(200, 20);
		expect(editor.selectedTrackPointIndexes).toEqual([0, 2]);
		expect(editor.currentTrackPoints).toEqual([
			[0, 0.2],
			[1, 0],
			[2, 0.2],
			[3, 0]
		]);
		editor.undoTrackPoint();
		expect(editor.currentTrackPoints).toEqual(coordinates);
		editor.cleanup();
	});
	it('plain taps replace selection, multi-select toggles, and range selects both endpoints', () => {
		const { editor, click } = fixture();
		editor.editTrack('a');
		click(0);
		click(200);
		expect(editor.selectedTrackPointIndexes).toEqual([2]);
		editor.setMultiSelect(true);
		click(100);
		expect(editor.selectedTrackPointIndexes).toEqual([2, 1]);
		editor.clearTrackSelection();
		editor.setMultiSelect(false);
		editor.startRangeSelection();
		click(0);
		expect(editor.rangePending).toBe(true);
		click(200);
		expect(editor.selectedTrackPointIndexes).toEqual([0, 1, 2]);
	});
	it('box selection applies on the second tap and ordinary map dragging leaves pan enabled', () => {
		const { editor, click, pointer, map } = fixture();
		editor.editTrack('a');
		editor.initTrackPointDragHandlers();
		pointer('pointerdown', 50, 100);
		expect(map.dragPan.isEnabled()).toBe(true);
		editor.startBoxSelection();
		click(80, -20);
		click(220, 20);
		expect(editor.operation.kind).toBe('idle');
		expect(editor.selectedTrackPointIndexes).toEqual([1, 2]);
		editor.cleanup();
	});
	it('touch dragging directly moves a point, restores gestures, and suppresses its trailing click', () => {
		const { editor, click, pointer, map } = fixture();
		editor.editTrack('a');
		editor.initTrackPointDragHandlers();
		pointer('pointerdown', 100);
		expect(map.dragPan.isEnabled()).toBe(false);
		pointer('pointermove', 110, 20);
		pointer('pointerup', 110, 20);
		expect(editor.currentTrackPoints[1]).toEqual([1.1, 0.2]);
		expect(map.dragPan.isEnabled()).toBe(true);
		click(110, 20);
		expect(editor.selectedTrackPointIndexes).toEqual([1]);
		expect(editor.canUndo).toBe(true);
		editor.cleanup();
	});

	it('desktop box dragging selects immediately and restores map gestures', () => {
		const { editor, pointer, map } = fixture();
		editor.editTrack('a');
		editor.initTrackPointDragHandlers();
		editor.startBoxSelection();
		pointer('pointerdown', 80, -20, 'mouse');
		pointer('pointermove', 220, 20, 'mouse');
		pointer('pointerup', 220, 20, 'mouse');
		expect(editor.selectedTrackPointIndexes).toEqual([1, 2]);
		expect(editor.operation.kind).toBe('idle');
		expect(map.dragPan.isEnabled()).toBe(true);
		expect(editor.canUndo).toBe(false);
		editor.cleanup();
	});
	it('touch dragging a midpoint inserts without an initial selection tap', () => {
		const { editor, pointer } = fixture();
		editor.editTrack('a');
		editor.initTrackPointDragHandlers();
		pointer('pointerdown', 50);
		pointer('pointermove', 50, 30);
		pointer('pointerup', 50, 30);
		expect(editor.currentTrackPoints).toHaveLength(5);
		expect(editor.currentTrackPoints[1]).toEqual([0.5, 0.3]);
		editor.undoTrackPoint();
		expect(editor.currentTrackPoints).toEqual(coordinates);
		editor.cleanup();
	});
	it('a second touch cancels a point drag without adding history', () => {
		const { editor, click, pointer, map } = fixture();
		editor.editTrack('a');
		editor.initTrackPointDragHandlers();
		click(100);
		pointer('pointerdown', 100);
		pointer('pointermove', 120, 20);
		pointer('pointerdown', 200, 0, 'touch', 2);
		expect(editor.currentTrackPoints).toEqual(coordinates);
		expect(editor.canUndo).toBe(false);
		expect(map.touchZoomRotate.isEnabled()).toBe(true);
		editor.cleanup();
	});
	it('a midpoint tap is harmless, then dragging inserts exactly one point', () => {
		const { editor, click, pointer } = fixture();
		editor.editTrack('a');
		editor.initTrackPointDragHandlers();
		click(50);
		expect(editor.currentTrackPoints).toHaveLength(4);
		expect(editor.midpointSelected).toBe(1);
		pointer('pointerdown', 50);
		pointer('pointermove', 50, 30);
		pointer('pointerup', 50, 30);
		expect(editor.currentTrackPoints).toHaveLength(5);
		expect(editor.currentTrackPoints[1]).toEqual([0.5, 0.3]);
		editor.undoTrackPoint();
		expect(editor.currentTrackPoints).toEqual(coordinates);
		editor.cleanup();
	});
});

describe('routing and GPX import', () => {
	it('serializes rapid routed clicks and records one Undo step per destination', async () => {
		const { editor } = fixture();
		let resolve;
		const requests = [];
		vi.stubGlobal(
			'fetch',
			vi.fn((url) => {
				requests.push(url);
				return new Promise((done) => {
					resolve = () =>
						done({
							ok: true,
							json: async () => ({
								routes: [
									{
										geometry: {
											coordinates:
												requests.length === 1
													? [
															[0, 0],
															[1, 0]
														]
													: [
															[1, 0],
															[2, 0]
														]
										}
									}
								]
							})
						});
				});
			})
		);
		editor.startRoutingDraft();
		await editor.addTrackPoint([0, 0]);
		const first = editor.addTrackPoint([1, 0]),
			second = editor.addTrackPoint([2, 0]);
		await vi.waitFor(() => expect(requests).toHaveLength(1));
		resolve();
		await first;
		await vi.waitFor(() => expect(requests).toHaveLength(2));
		resolve();
		await second;
		expect(editor.currentTrackPoints).toEqual([
			[0, 0],
			[1, 0],
			[2, 0]
		]);
		editor.undoTrackPoint();
		expect(editor.currentTrackPoints).toEqual([
			[0, 0],
			[1, 0]
		]);
		editor.redoTrackPoint();
		expect(editor.currentTrackPoints).toHaveLength(3);
	});
	it('discards a late route response after Cancel and another drawing starts', async () => {
		const { editor } = fixture();
		let resolve, signal;
		vi.stubGlobal(
			'fetch',
			vi.fn((_, options) => {
				signal = options.signal;
				return new Promise((done) => {
					resolve = () =>
						done({
							ok: true,
							json: async () => ({
								routes: [
									{
										geometry: {
											coordinates: [
												[0, 0],
												[1, 0]
											]
										}
									}
								]
							})
						});
				});
			})
		);
		editor.startRoutingDraft();
		await editor.addTrackPoint([0, 0]);
		const pending = editor.addTrackPoint([1, 0]);
		await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
		editor.cancelTrackEdit();
		expect(signal.aborted).toBe(true);
		editor.startRoutingDraft();
		await editor.addTrackPoint([5, 5]);
		resolve();
		await pending;
		expect(editor.currentTrackPoints).toEqual([[5, 5]]);
	});
	it('routing failure never silently creates a straight segment', async () => {
		const { editor } = fixture();
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
		editor.startRoutingDraft();
		await editor.addTrackPoint([0, 0]);
		await editor.addTrackPoint([1, 0]);
		expect(editor.currentTrackPoints).toEqual([[0, 0]]);
		expect(editor.hasRoutingFailure).toBe(true);
		editor.useStraightSegment();
		expect(editor.currentTrackPoints).toEqual([
			[0, 0],
			[1, 0]
		]);
		editor.undoTrackPoint();
		expect(editor.currentTrackPoints).toEqual([[0, 0]]);
	});

	it('a failed destination cannot be silently omitted by Done or a tool change', async () => {
		const { editor, state } = fixture();
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
		editor.editTrack('a');
		editor.setTrackDraftMode('routing');
		await editor.addTrackPoint([4, 0]);
		expect(editor.canApply).toBe(false);
		expect(editor.finalizeTrack()).toBe(false);
		const next = vi.fn();
		expect(editor.requestLeave(next)).toBe(false);
		expect(next).not.toHaveBeenCalled();
		expect(editor.sessionActive).toBe(true);
		expect(state.workspace.access.features[0].geometry.coordinates).toEqual(coordinates);
	});
	it('importing a new GPX applies the previous valid edit instead of losing it', async () => {
		const { editor, state } = fixture();
		editor.editTrack('a');
		editor.reverseTrack();
		await editor.handleGpxUpload({
			currentTarget: {
				files: [
					{
						name: 'New.gpx',
						text: async () =>
							'<gpx><trk><trkseg><trkpt lon="10" lat="10"/><trkpt lon="11" lat="11"/></trkseg></trk></gpx>'
					}
				],
				value: 'New.gpx'
			}
		});
		expect(state.workspace.access.features[0].geometry.coordinates).toEqual(
			[...coordinates].reverse()
		);
		expect(editor.currentTrackPoints).toEqual([
			[10, 10],
			[11, 11]
		]);
		expect(editor.sessionActive).toBe(true);
		editor.cancelTrackEdit();
		expect(state.workspace.access.features).toHaveLength(1);
	});
	it('imports one selected GPX segment as a cancellable draft', async () => {
		const { editor, state } = fixture();
		editor.startRoutingDraft();
		const input = {
			files: [
				{
					name: 'Trail.gpx',
					text: async () =>
						'<gpx><trk><trkseg><trkpt lon="10" lat="10"/><trkpt lon="11" lat="11"/></trkseg><trkseg><trkpt lon="20" lat="20"/><trkpt lon="21" lat="21"/></trkseg></trk></gpx>'
				}
			],
			value: 'Trail.gpx'
		};
		await editor.handleGpxUpload({ currentTarget: input });
		expect(editor.importSegments).toHaveLength(2);
		expect(state.workspace.access.features).toHaveLength(1);
		editor.importSegment(editor.importSegments[1]);
		expect(editor.currentTrackPoints).toEqual([
			[20, 20],
			[21, 21]
		]);
		editor.cancelTrackEdit();
		expect(state.workspace.access.features).toHaveLength(1);
		expect(input.value).toBe('');
	});
});

describe('map based track joining', () => {
	function joinFixture() {
		const value = fixture();
		value.state.workspace.access.features.push({
			type: 'Feature',
			id: 'b',
			properties: { kind: 'approach', name: 'Second trail' },
			geometry: {
				type: 'LineString',
				coordinates: [
					[4, 0],
					[5, 0]
				]
			}
		});
		value.editor.editTrack('a');
		value.editor.startTrackJoin();
		value.setHit({ kind: 'approach', accessFeatureId: 'b' });
		return value;
	}
	it('clicking the second approach previews a join without selecting or editing it', () => {
		const { editor, state, click, tool } = joinFixture();
		expect(editor.operation.kind).toBe('join');
		expect(click(400)).toBe(true);
		expect(editor.activeTrackTarget).toEqual({ kind: 'access', featureId: 'a' });
		expect(tool()).toBe('track');
		expect(editor.joinPreview.target).toEqual({ kind: 'access', featureId: 'b' });
		expect(editor.joinPreview.connection).toEqual([
			[3, 0],
			[4, 0]
		]);
		expect(state.workspace.access.features).toHaveLength(2);
		expect(state.history.entries).toHaveLength(0);
		editor.cancelOperation();
		expect(editor.joinPreview).toBeNull();
		expect(editor.sessionActive).toBe(true);
		expect(editor.currentTrackPoints).toEqual(coordinates);
	});
	it('Join applies edited base geometry and the name, consumes the second track, and is one Undo step', () => {
		const { editor, state, click, tool } = joinFixture();
		editor.cancelOperation();
		editor.removeTrackPoint(1);
		editor.startTrackJoin();
		click(400);
		editor.setJoinName('Complete approach');
		expect(editor.confirmJoinTrack()).toBe(true);
		expect(editor.sessionActive).toBe(false);
		expect(tool()).toBe('select');
		expect(state.workspace.access.features).toHaveLength(1);
		expect(state.workspace.access.features[0].geometry.coordinates).toEqual([
			[0, 0],
			[2, 0],
			[3, 0],
			[4, 0],
			[5, 0]
		]);
		expect(state.workspace.access.features[0].properties).toMatchObject({
			name: 'Complete approach',
			description: 'Keep me',
			kind: 'approach'
		});
		expect(state.history.entries).toHaveLength(1);
		state.undo();
		expect(state.workspace.access.features).toHaveLength(2);
		expect(state.workspace.access.features[0].geometry.coordinates).toEqual(coordinates);
		state.redo();
		expect(state.workspace.access.features).toHaveLength(1);
	});
	it('an invalid click clears the preview and cannot join the track to itself', () => {
		const { editor, click, setHit, state } = joinFixture();
		click(400);
		setHit({ kind: 'approach', accessFeatureId: 'a' });
		click(100);
		expect(editor.joinPreview).toBeNull();
		expect(editor.confirmJoinTrack()).toBe(false);
		expect(editor.operation.kind).toBe('join');
		expect(state.history.entries).toHaveLength(0);
	});
	it('refuses to apply an outdated preview after the candidate changed', () => {
		const { editor, click, state } = joinFixture();
		click(400);
		state.workspace.access.features[1].geometry.coordinates = [
			[6, 0],
			[7, 0]
		];
		expect(editor.confirmJoinTrack()).toBe(false);
		expect(editor.message).toBe('track.joinChanged');
		expect(state.workspace.access.features).toHaveLength(2);
		expect(state.history.entries).toHaveLength(0);
		click(600);
		expect(editor.confirmJoinTrack()).toBe(true);
	});
	it('Escape cancels joining and returns to the original edit', () => {
		const { editor, click } = joinFixture();
		click(400);
		editor.handleKeyDown(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
		expect(editor.operation.kind).toBe('idle');
		expect(editor.joinPreview).toBeNull();
		expect(editor.sessionActive).toBe(true);
	});
	it('Enter confirms the join directly', () => {
		const { editor, click, state } = joinFixture();
		click(400);
		editor.handleKeyDown(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
		expect(editor.sessionActive).toBe(false);
		expect(state.workspace.access.features).toHaveLength(1);
	});
	it('joins topo paths and preserves route references in a single commit', () => {
		const { state, map, setHit } = fixture();
		const documentPath = 'crags/wall/wall-topo.json';
		state.workspace.topo = {
			id: 'wall',
			routes: [
				{
					id: 'r1',
					pathRefs: [
						{ pathId: 'a', role: 'main' },
						{ pathId: 'b', role: 'main' }
					]
				},
				{ id: 'r2', pathRefs: [{ pathId: 'b', role: 'main' }] }
			],
			paths: {
				type: 'FeatureCollection',
				features: [
					{
						type: 'Feature',
						id: 'a',
						properties: { name: 'First' },
						geometry: { type: 'LineString', coordinates }
					},
					{
						type: 'Feature',
						id: 'b',
						properties: { name: 'Second' },
						geometry: {
							type: 'LineString',
							coordinates: [
								[4, 0],
								[5, 0]
							]
						}
					}
				]
			}
		};
		const routeTool = createCragRouteTool({ state });
		const editor = useCragTrackEditor({
			persistence: createCragTrackPersistence(state, {
				save: (target, segments) => routeTool.saveRouteSegments(target, segments),
				join: (base, append, points, name) =>
					routeTool.joinRoutePaths({ base, candidate: append, points: points, name }),
				remove: (target) => routeTool.deleteRoutePath(target.documentPath, target.pathId)
			}),
			getMap: () => map,
			getActiveTool: () => 'track',
			setActiveTool: () => {},
			getRoutePathTarget: () => ({ documentPath, pathId: 'a', pathIndex: 0 })
		});
		editor.editRoutePath(coordinates);
		editor.startTrackJoin();
		setHit({ feature: 'route-path', documentPath: 'other-topo', pathId: 'b', pathIndex: 1 });
		editor.handleMapClick({ point: { x: 400, y: 0 } });
		expect(editor.joinPreview).toBeNull();
		setHit({ feature: 'route-path', documentPath, pathId: 'b', pathIndex: 1 });
		editor.handleMapClick({ point: { x: 400, y: 0 } });
		expect(editor.joinPreview.target.pathId).toBe('b');
		expect(editor.confirmJoinTrack()).toBe(true);
		expect(state.workspace.topo.paths.features).toHaveLength(1);
		expect(state.workspace.topo.routes[0].pathRefs).toEqual([{ pathId: 'a', role: 'main' }]);
		expect(state.workspace.topo.routes[1].pathRefs).toEqual([{ pathId: 'a', role: 'main' }]);
		expect(state.history.entries).toHaveLength(1);
		state.undo();
		expect(state.workspace.topo.paths.features).toHaveLength(2);
		expect(state.workspace.topo.routes[1].pathRefs[0].pathId).toBe('b');
	});
});
