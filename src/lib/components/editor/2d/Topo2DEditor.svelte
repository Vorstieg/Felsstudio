<script lang="ts">
	import {
		createTopo2DEditorState,
		getTopo2DEditorState
	} from '$lib/state/topo-2d-editor-state.svelte.ts';
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import { untrack } from 'svelte';
	import { initializeIdCounters } from '$lib/assets/js/id-utils.ts';
	import { createEditablePathResolver } from './editable-path.ts';
	import { createCanvasInput } from './create-canvas-input.svelte.ts';
	import { referenceFixpoint, snapRoutePointToAnchor } from './route-fixpoint-snap.ts';
	import { createTopoKeyboardController } from './create-topo-keyboard-controller.ts';
	import { createTopoInputController } from './create-topo-input-controller.ts';
	import { createTopoSelectionSnapshot } from './create-topo-selection-snapshot.ts';
	import { createTopoObjectInteractionController } from './create-topo-object-interaction-controller.ts';
	import { trackTopoRenderDependencies } from './track-topo-render-dependencies.svelte.ts';
	import { createTopoToolRegistry } from './create-topo-tool-registry.ts';
	import { renderTopo2D } from './render-topo-2d.ts';
	import { createTopoEditorActions } from './create-topo-editor-actions.ts';
	import { syncTopoToolLifecycle } from './sync-topo-tool-lifecycle.ts';
	import type { Route } from '@vorstieg/fels-types/types';
	import type { InteractionId, InteractionPoint } from '$lib/state/topo-2d-editor-interactions.ts';
	import type { Point2D } from '$lib/assets/js/path-geometry.ts';
	import type { createTopo2DEditorState as createEditorState } from '$lib/state/topo-2d-editor-state.svelte.ts';

	type Editor = ReturnType<typeof createEditorState>;
	function aspectRatio(value: unknown): number | null {
		return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
	}

	let { editorState: providedEditorState = null }: { editorState?: Editor | null } = $props();

	// svelte-ignore state_referenced_locally
	const editor = providedEditorState || getTopo2DEditorState() || createTopo2DEditorState();
	let drawingTarget = $derived(editor.ui.drawingTarget);
	const referenceFixpointInStore = (route: Route, fixPointId: InteractionId | null) =>
		editor.mutateDocument(() => referenceFixpoint(route, fixPointId));
	const clipboard = {
		copy: () => editor.copySelection(),
		paste: ({ canvasSize }: { canvasSize?: { baseWidth: number; baseHeight: number } } = {}) =>
			editor.pasteSelection(canvasSize),
		clear: editor.clearClipboard
	};
	let svgElement = $state<SVGSVGElement | null>(null);
	let gElement = $state<SVGGElement | null>(null);

	function snapRoutePoint(point: InteractionPoint) {
		return snapRoutePointToAnchor(point, editor.topo.fixPoints, {
			enabled: editor.ui.snapRoutesToAnchors,
			canvasSize: editor.viewport
		});
	}
	const editablePaths = createEditablePathResolver(editor);
	const tools = createTopoToolRegistry({
		editor,
		getCanvasSize: () => editor.viewport,
		getEditablePath: (target) => editablePaths.resolve(target),
		beginSelectionMove: collectDraggingSelection,
		snapRoutePoint,
		referenceFixpoint: referenceFixpointInStore
	});
	// Track previous tool for lifecycle
	let previousTool = $state<(typeof tools)[keyof typeof tools] | null>(null);

	// `select` is the editor's idle tool. Normalize bound values as well, so
	// consumers never have to handle a null active tool.
	$effect(() => {
		if (editor.ui.activeTool == null) editor.setActiveTool('select');
	});

	const inputToolIds = [
		'route',
		'multipitch',
		'outline',
		'symbol',
		'fixpoint',
		'text',
		'eraser',
		'select'
	] as const;
	const draftToolIds = ['route', 'multipitch', 'outline'] as const;
	function getTool<K extends keyof typeof tools>(id: K) {
		return tools[id];
	}
	function getActiveTool() {
		return getTool(editor.ui.activeTool as keyof typeof tools) ?? tools.select;
	}
	function getAllowedTool<K extends keyof typeof tools>(ids: readonly K[]) {
		const id = editor.ui.activeTool as K;
		return ids.includes(id) ? getTool(id) : null;
	}
	let currentTool = $derived(getActiveTool());
	const getInputTool = () => getAllowedTool(inputToolIds);
	const getDraftTool = () => getAllowedTool(draftToolIds);

	// Sync selected options to their configured tool.
	$effect(() => {
		tools.symbol.selectedType = editor.ui.selectedSymbol;
		tools.fixpoint.selectedType = editor.ui.selectedSymbol;
		if (tools.outline) {
			tools.outline.selectedStyle = editor.ui.selectedOutlineStyle;
		}
	});

	// Tool lifecycle management
	$effect(() => {
		const nextTool = currentTool;
		previousTool = untrack(() =>
			syncTopoToolLifecycle({
				previousTool,
				currentTool: nextTool,
				drawingTools: [
					tools.route,
					tools.multipitch,
					tools.outline,
					tools.symbol,
					tools.fixpoint,
					tools.text
				],
				clearSelection: editor.clearSelection
			})
		);
	});

	// Derived state for rendering
	let currentRoutePoints = $derived(
		(currentTool === tools.route
			? tools.route.draftPoints
			: currentTool === tools.multipitch
				? tools.multipitch.draftPoints
				: []
		).map(([x, y]): Point2D => [x, y])
	);
	let currentOutlinePoints = $derived(
		currentTool === tools.outline ? tools.outline.getPreviewPoints() : []
	);
	let brushPreview = $derived(
		currentTool === tools.outline ? tools.outline.getBrushPreview() : null
	);
	$effect(() => {
		editor.setDraftPending(
			currentRoutePoints.length > 0 ||
				currentOutlinePoints.length > 0 ||
				Boolean(brushPreview?.points?.length) ||
				(editor.ui.activeTool === 'multipitch' && drawingTarget?.type === 'newPitch')
		);
	});

	// Symbol tool manages symbol creation directly into topoSession, so no "currentSymbolPoints" needed for preview distinct from cursor?
	// RouteTool owns route draft points, target transitions, and previews.

	const saveHistory = () => editor.saveHistory();
	const inputController = createTopoInputController({
		editor,
		getCurrentTool: getInputTool,
		textTool: tools.text,
		getCanvasSize: () => editor.viewport,
		getEditablePath: (target) => editablePaths.resolve(target),
		snapRoutePoint,
		referenceFixpoint: referenceFixpointInStore,
		editTools: {
			outline: tools.outlineEdit,
			route: tools.routeEdit,
			symbol: tools.symbolEdit
		}
	});
	const canvasInput = createCanvasInput({
		getAspectRatio: () => aspectRatio(editor.ui.canvasAspectRatio) ?? 1.5,
		getGesturePolicy: inputController.getGesturePolicy,
		onInput: inputController
	});
	$effect(() => {
		editor.viewport.baseWidth = canvasInput.baseWidth;
		editor.viewport.baseHeight = canvasInput.baseHeight;
		editor.viewport.transform = canvasInput.transform;
	});
	const objectInteractionController = createTopoObjectInteractionController({
		editor,
		canvasInput,
		createSelectionSnapshot: (mouse) => collectDraggingSelection(mouse)
	});

	const actions = createTopoEditorActions({
		editor,
		getCurrentTool: getDraftTool,
		outlineEditTool: tools.outlineEdit
	});

	export const undo = actions.undo;
	export const redo = actions.redo;

	/* Canvas setup and input lifecycle live in createCanvasInput. */
	onMount(() => {
		if (!svgElement || !gElement) return;
		if (!editor.topo.backgroundFit) editor.topo.backgroundFit = 'contain';
		canvasInput.setElements({ svg: svgElement, content: gElement });

		// Initialize ID counters from existing data to avoid collisions
		initializeIdCounters(editor.topo);

		// Initialize first history state
		saveHistory();

		return () => canvasInput.destroy();
	});

	// Canvas dimensions change only when its explicit logical aspect ratio changes.
	$effect(() => {
		if (editor.ui.canvasAspectRatio) {
			canvasInput.refreshDimensions();
		}
	});

	function collectDraggingSelection(mouse: InteractionPoint) {
		return createTopoSelectionSnapshot({
			getTopo: () => editor.topo,
			selectedItems: editor.selectedItems,
			drawingTarget,
			getEditablePath: (target) => editablePaths.resolve(target),
			startMouse: mouse
		});
	}

	export const finalize = actions.finalize;
	export const cancel = actions.cancel;

	export function getCurrentTool() {
		return currentTool;
	}

	export function getOutlineEditTool() {
		return tools.outlineEdit;
	}

	export function getRouteEditTool() {
		return tools.routeEdit;
	}

	export const simplifySelectedOutline = actions.simplifySelectedOutline;

	const keyboard = createTopoKeyboardController({
		getCurrentTool: () => currentTool,
		finalize: actions.finalize,
		cancel: actions.cancel,
		getCanvasSize: () => editor.viewport,
		clipboard,
		selection: editor,
		setActiveTool: (tool) => editor.setActiveTool(tool),
		setDrawingTarget: editor.setDrawingTarget,
		clearSelection: editor.clearSelection,
		deleteSelection: editor.deleteSelection,
		recordHistory: saveHistory,
		undo,
		redo,
		setShiftPressed: (pressed) => editor.setShiftPressed(pressed),
		onEditSelectedText: () => {
			const id = editor.selectedId('text');
			return id ? tools.text.beginEdit(id) : false;
		}
	});

	onMount(() => {
		const handleKeyUp = (event: KeyboardEvent) => {
			if (event.key === 'Shift') editor.setShiftPressed(false);
		};
		window.addEventListener('keydown', keyboard.handleKeyDown);
		window.addEventListener('keyup', handleKeyUp);
		return () => {
			window.removeEventListener('keydown', keyboard.handleKeyDown);
			window.removeEventListener('keyup', handleKeyUp);
		};
	});

	// D3 Render groups (Managed imperatively)

	function updateD3Rendering() {
		renderTopo2D({
			svgElement,
			gElement,
			editor,
			baseWidth: editor.viewport.baseWidth,
			baseHeight: editor.viewport.baseHeight,
			currentRoutePoints,
			currentOutlinePoints,
			outlinePreview: {
				baseWidth: editor.viewport.baseWidth,
				baseHeight: editor.viewport.baseHeight,
				mode: currentTool === tools.outline ? tools.outline.mode : null,
				fillColor: currentTool === tools.outline ? tools.outline.fillColor : null,
				fillOpacity: currentTool === tools.outline ? tools.outline.fillOpacity : null
			},
			brushPreview,
			canvasInput,
			editTools: {
				route: tools.routeEdit,
				outline: tools.outlineEdit,
				symbol: tools.symbolEdit
			},
			draftTools: { route: tools.route, multipitch: tools.multipitch },
			textTool: tools.text,
			basePath: base,
			onObjectMouseDown: objectInteractionController.objectMouseDown,
			onObjectClick: objectInteractionController.objectClick,
			onTextMouseDown: objectInteractionController.textMouseDown
		});
	}

	// Trigger D3 render on state changes
	$effect(() => {
		trackTopoRenderDependencies({
			topo: editor.topo,
			currentRoutePoints,
			currentOutlinePoints,
			brushPreview,
			baseWidth: editor.viewport.baseWidth,
			baseHeight: editor.viewport.baseHeight
		});

		// Map these as dependencies too
		void {
			active: editor.ui.activeTool,
			selectedRoute: editor.ui.selectedRouteId,
			selectedPitch: editor.ui.selectedPitchId,
			selectedVariant: editor.ui.selectedVariantId,
			drawingTarget,
			selectedOutline: editor.ui.selectedOutlineId,
			selectedFixpoint: editor.ui.selectedFixpointId,
			selectedText: editor.ui.selectedTextLabelId,
			textDraft: tools.text.editingValue,
			textDraftPosition: tools.text.editingPosition,
			textDraftStyle: [
				tools.text.fontSize2D,
				tools.text.color,
				tools.text.fontWeight,
				tools.text.textAlign2D
			],
			selectedItems: editor.selectedItems.size,
			selectedRoutePoints: editor.selectedRoutePoints.size,
			selectionInteraction: editor.interaction?.kind,
			transform: editor.viewport.transform,
			base: editor.viewport
		};

		updateD3Rendering();
	});
</script>

<div
	data-testid="topo-2d-editor"
	class="relative w-full h-full bg-gray-100 rounded-lg overflow-hidden"
	style="touch-action: none;"
>
	<button
		type="button"
		class="absolute right-3 top-3 z-10 rounded bg-white/95 px-3 py-2 text-sm font-semibold shadow md:hidden"
		class:bg-creator-blue={editor.ui.mobileSelectionMode}
		class:text-white={editor.ui.mobileSelectionMode}
		aria-pressed={editor.ui.mobileSelectionMode}
		onclick={() => editor.setMobileSelectionMode(!editor.ui.mobileSelectionMode)}
	>
		{editor.ui.mobileSelectionMode ? 'Done selecting' : 'Select multiple'}
	</button>
	<svg
		data-testid="topo-2d-canvas"
		bind:this={svgElement}
		viewBox="0 0 {editor.viewport.baseWidth} {editor.viewport.baseHeight}"
		preserveAspectRatio="xMidYMid meet"
		class="w-full h-full cursor-{editor.ui.activeTool === 'eraser' ? 'crosshair' : 'crosshair'}"
		style="touch-action: none;"
		role="application"
		aria-label="Topo Editor"
	>
		<g bind:this={gElement}></g>
	</svg>
</div>
