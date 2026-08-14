<script>
	import {
		createTopo2DEditorState,
		getTopo2DEditorState
	} from '$lib/state/topo-2d-editor-state.svelte.js';
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import { untrack } from 'svelte';
	import { initializeIdCounters } from '$lib/assets/js/id-utils.js';
	import { createEditablePathResolver } from './editable-path.js';
	import { createCanvasInput } from './create-canvas-input.svelte.js';
	import { referenceFixpoint, snapRoutePointToAnchor } from './route-fixpoint-snap.js';
	import { createTopoKeyboardController } from './create-topo-keyboard-controller.js';
	import { createTopoInputController } from './create-topo-input-controller.js';
	import { createTopoSelectionSnapshot } from './create-topo-selection-snapshot.js';
	import { createTopoObjectInteractionController } from './create-topo-object-interaction-controller.js';
	import { trackTopoRenderDependencies } from './track-topo-render-dependencies.svelte.js';
	import { createTopoToolRegistry } from './create-topo-tool-registry.js';
	import { renderTopo2D } from './render-topo-2d.js';
	import { createTopoEditorActions } from './create-topo-editor-actions.js';
	import { syncTopoToolLifecycle } from './sync-topo-tool-lifecycle.js';

	let { editorState: providedEditorState = null } = $props();

	// svelte-ignore state_referenced_locally
	const editor = providedEditorState || getTopo2DEditorState() || createTopo2DEditorState();
	const referenceFixpointInStore = (route, fixPointId) =>
		editor.mutateDocument(() => referenceFixpoint(route, fixPointId));
	const clipboard = {
		copy: () => editor.copySelection(),
		paste: ({ canvasSize } = {}) => editor.pasteSelection(canvasSize),
		clear: editor.clearClipboard
	};
	let svgElement = $state(null);
	let gElement = $state(null);

	function snapRoutePoint(point) {
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
	let previousTool = $state(null);

	// `select` is the editor's idle tool. Normalize bound values as well, so
	// consumers never have to handle a null active tool.
	$effect(() => {
		if (editor.ui.activeTool == null) editor.setActiveTool('select');
	});

	let currentTool = $derived(tools[editor.ui.activeTool] || tools.select);

	// Sync selected options to their configured tool.
	$effect(() => {
		if (currentTool === tools.symbol || currentTool === tools.fixpoint) {
			currentTool.selectedType = editor.ui.selectedSymbol;
		}
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
		currentTool === tools.route || currentTool === tools.multipitch ? currentTool.draftPoints : []
	);
	let currentOutlinePoints = $derived(
		currentTool === tools.outline ? currentTool.getPreviewPoints() : []
	);
	let brushPreview = $derived(currentTool === tools.outline ? currentTool.getBrushPreview() : null);
	$effect(() => {
		editor.setDraftPending(
			currentRoutePoints.length > 0 ||
			currentOutlinePoints.length > 0 ||
			Boolean(brushPreview?.points?.length) ||
				(editor.ui.activeTool === 'multipitch' && editor.ui.drawingTarget?.type === 'newPitch')
		);
	});

	// Symbol tool manages symbol creation directly into topoSession, so no "currentSymbolPoints" needed for preview distinct from cursor?
	// RouteTool owns route draft points, target transitions, and previews.

	const saveHistory = () => editor.saveHistory();
	const inputController = createTopoInputController({
		editor,
		getCurrentTool: () => currentTool,
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
		getAspectRatio: () => editor.topo.canvasAspectRatio ?? editor.topo.imageAspectRatio ?? 1.5,
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
		getCurrentTool: () => currentTool,
		outlineEditTool: tools.outlineEdit
	});

	export const undo = actions.undo;
	export const redo = actions.redo;

	/* Canvas setup and input lifecycle live in createCanvasInput. */
	onMount(() => {
		if (!svgElement || !gElement) return;
		// Migrate old topographies lazily: their current canvas appearance becomes permanent.
		if (!editor.topo.canvasAspectRatio) {
			editor.topo.canvasAspectRatio = editor.topo.imageAspectRatio || 1.5;
		}
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
		if (editor.topo.canvasAspectRatio ?? editor.topo.imageAspectRatio) {
			canvasInput.refreshDimensions();
		}
	});

	function handleObjectMouseDown(event, { type, id, pitchId = null, variantId = null }) {
		objectInteractionController.objectMouseDown(event, { type, id, pitchId, variantId });
	}

	function handleObjectClick(event, type, id) {
		objectInteractionController.objectClick(event, type, id);
	}

	function handleTextMouseDown(event, label) {
		objectInteractionController.textMouseDown(event, label);
	}

	function collectDraggingSelection(mouse) {
		return createTopoSelectionSnapshot({
			getTopo: () => editor.topo,
			selectedItems: editor.selectedItems,
			drawingTarget: editor.ui.drawingTarget,
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
		getSelectedItems: () => editor.selectedItems,
		getCanvasSize: () => editor.viewport,
		clipboard,
		getTopo: () => editor.topo,
		selection: editor,
		setActiveTool: (tool) => editor.setActiveTool(tool),
		setDrawingTarget: (target) => editor.setDrawingTarget(target),
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
		const handleKeyUp = (event) => {
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
				fillColor: currentTool === tools.outline ? currentTool.fillColor : null,
				fillOpacity: currentTool === tools.outline ? currentTool.fillOpacity : null
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
			onObjectMouseDown: handleObjectMouseDown,
			onObjectClick: handleObjectClick,
			onTextMouseDown: handleTextMouseDown
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
		const _deps = {
			active: editor.ui.activeTool,
			selectedRoute: editor.ui.selectedRouteId,
			selectedPitch: editor.ui.selectedPitchId,
			selectedVariant: editor.ui.selectedVariantId,
			drawingTarget: editor.ui.drawingTarget
				? [
					editor.ui.drawingTarget.type,
					editor.ui.drawingTarget.routeId,
					editor.ui.drawingTarget.id,
					editor.ui.drawingTarget.pitchId,
					editor.ui.drawingTarget.variantId
				]
				: null,
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
