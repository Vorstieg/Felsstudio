<script>
	import { getTopoEditorSession } from '$lib/state/topo-session.svelte.js';
	import { createTopo2DEditorState } from '$lib/state/topo-2d-editor-state.svelte.js';
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import { untrack } from 'svelte';
	import { initializeIdCounters } from '$lib/assets/js/id-utils.js';
	import { createEditablePathResolver } from './editable-path.js';
	import { createCanvasInput } from './create-canvas-input.svelte.js';
	import { referenceFixpoint, snapRoutePointToFixpoint } from './route-fixpoint-snap.js';
	import { createTopoKeyboardController } from './create-topo-keyboard-controller.js';
	import { createTopoInteractionController } from './create-topo-interaction-controller.js';
	import { createTopoPointerController } from './create-topo-pointer-controller.js';
	import { createTopoSelectionSnapshot } from './create-topo-selection-snapshot.js';
	import { createTopoObjectInteractionController } from './create-topo-object-interaction-controller.js';
	import { createTopoRenderEditServices } from './create-topo-render-edit-services.js';
	import { trackTopoRenderDependencies } from './track-topo-render-dependencies.svelte.js';
	import { createTopoToolRegistry } from './create-topo-tool-registry.js';
	import { renderTopo2D } from './render-topo-2d.js';
	import { createTopoEditorActions } from './create-topo-editor-actions.js';
	import { syncTopoToolLifecycle } from './sync-topo-tool-lifecycle.js';

	let { editorState: providedEditorState = null } = $props();

	const userState = getTopoEditorSession();
	// svelte-ignore state_referenced_locally
	const editor =
		providedEditorState ||
		createTopo2DEditorState({
			getTopo: () => userState.topo,
			setTopo: (topo) => (userState.topo = topo),
			ui: userState.ui
		});
	const referenceFixpointInStore = (route, fixPointId) =>
		editor.mutateDocument(() => referenceFixpoint(route, fixPointId));
	const commands = editor;
	const clipboard = {
		copy: () => editor.copySelection(),
		paste: ({ canvasSize } = {}) => editor.pasteSelection(canvasSize),
		clear: editor.clearClipboard
	};
	const toolContext = {
		document: { getTopo: () => userState.topo, ui: editor.ui },
		selection: {
			selectObject: editor.selectObject,
			selectPath: editor.selectPath,
			selectedId: editor.selectedId,
			isSelected: editor.isSelected,
			removeItems: editor.removeItems,
			clear: editor.clearSelection,
			startInteraction: editor.startInteraction,
			getInteraction: () => editor.interaction
		},
		history: { save: editor.saveHistory },
		viewport: { getCanvasSize: () => ({ baseWidth, baseHeight }) },
		drawing: {
			getTarget: () => editor.ui.drawingTarget,
			setTarget: (target) => editor.setDrawingTarget(target)
		},
		image: {
			getSrc: () => userState.topo.image2D,
			getFit: () => userState.topo.backgroundFit ?? 'contain'
		},
		commands
	};

	let svgElement = $state(null);
	let gElement = $state(null);
	let observedTopo = userState.topo;

	// Session loads replace the canonical document. Reset all 2D-only state at
	// that boundary so stale selection, drafts, interaction, and history cannot
	// leak into the newly loaded document.
	$effect(() => {
		const topo = userState.topo;
		if (topo !== observedTopo) {
			editor.load(topo);
			observedTopo = userState.topo;
		}
	});

	function snapRoutePoint(point) {
		return snapRoutePointToFixpoint(point, userState.topo.fixPoints, {
			enabled: editor.ui.snapRoutesToFixpoints,
			canvasSize: { baseWidth, baseHeight }
		});
	}
	const tools = createTopoToolRegistry({
		context: toolContext,
		state: editor,
		getTopo: () => userState.topo,
		getActiveTool: () => editor.ui.activeTool,
		getEditablePath: (target) => editablePaths.resolve(target),
		getIsShiftPressed: () => editor.ui.isShiftPressed,
		getMobileSelectionMode: () => editor.ui.mobileSelectionMode,
		beginSelectionMove: collectDraggingSelection,
		setDrawingTarget: (target) => editor.setDrawingTarget(target),
		getSelectionSize: () => editor.selectedItems.size,
		getSelectedSymbolId: () => userState.ui.selectedFixpointId,
		snapRoutePoint,
		referenceFixpoint: referenceFixpointInStore
	});
	const renderEditServices = createTopoRenderEditServices({
		route: tools.routeEdit,
		outline: tools.outlineEdit,
		symbol: tools.symbolEdit
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
				Boolean(brushPreview?.points?.length) ||
				(editor.ui.activeTool === 'multipitch' && editor.ui.drawingTarget?.type === 'newPitch')
		);
	});

	// Symbol tool manages symbol creation directly into userState, so no "currentSymbolPoints" needed for preview distinct from cursor?
	// RouteTool owns route draft points, target transitions, and previews.

	const editablePaths = createEditablePathResolver({
		getTopo: () => userState.topo,
		getCanvasSize: () => ({ baseWidth, baseHeight })
	});
	let editingTextNeedsFocus = false;

	const saveHistory = () => editor.saveHistory();
	let editingTextLabelId = $derived(tools.text.editingId);
	let editingTextValue = $derived(tools.text.editingValue);
	let editingTextOriginalValue = $derived(tools.text.editingOriginalValue);
	const canvasInput = createCanvasInput({
		getActiveTool: () => editor.ui.activeTool,
		getAspectRatio: () =>
			userState.topo.canvasAspectRatio ?? userState.topo.imageAspectRatio ?? 1.5,
		getMobileSelectionMode: () => editor.ui.mobileSelectionMode,
		onDown: handleCanvasDown,
		onMove: handleCanvasMove,
		onUp: handleCanvasUp,
		onEmptyTouchTap: handleEmptyTouchTap
	});
	let baseWidth = $derived(canvasInput.baseWidth);
	let baseHeight = $derived(canvasInput.baseHeight);
	let transform = $derived(canvasInput.transform);
	$effect(() => {
		editor.viewport.baseWidth = baseWidth;
		editor.viewport.baseHeight = baseHeight;
		editor.viewport.transform = transform;
	});
	const interactionController = createTopoInteractionController({
		getTopo: () => userState.topo,
		mutateDocument: editor.mutateDocument,
		getInteraction: () => editor.interaction,
		getCurrentTool: () => currentTool,
		getEditablePath: (target) => editablePaths.resolve(target),
		snapRoutePoint,
		referenceFixpoint: referenceFixpointInStore,
		outlineEditTool: tools.outlineEdit,
		symbolEditTool: tools.symbolEdit,
		onMoveRouteLabel: (interaction, mouse) =>
			commands.moveRouteLabel(interaction.routeId, interaction, mouse)
	});
	const pointerController = createTopoPointerController({
		getActiveTool: () => editor.ui.activeTool,
		getCurrentTool: () => currentTool,
		getEditingTextId: () => editingTextLabelId,
		commitTextEdit,
		getMobileSelectionMode: () => editor.ui.mobileSelectionMode,
		getTopo: () => userState.topo,
		getCanvasSize: () => ({ baseWidth, baseHeight }),
		selection: editor,
		clearSelection,
		deselectEditTarget,
		saveHistory,
		onBeginSelectionRegion: (interaction) =>
			editor.startInteraction('selection-region', interaction)
	});
	const objectInteractionController = createTopoObjectInteractionController({
		getActiveTool: () => editor.ui.activeTool,
		normalizeEvent: (event) => canvasInput.normalizeEvent(event),
		getMobileSelectionMode: () => editor.ui.mobileSelectionMode,
		getIsShiftPressed: () => editor.ui.isShiftPressed,
		getDraftState: () => ({
			routePoints: currentRoutePoints.length,
			outlinePoints: currentOutlinePoints.length
		}),
		selection: editor,
		createSelectionSnapshot: (mouse) => collectDraggingSelection(mouse),
		setDrawingTarget: (target) => editor.setDrawingTarget(target)
	});

	const actions = createTopoEditorActions({
		editor,
		getCurrentTool: () => currentTool,
		getDraftState: () => ({
			routePoints: currentRoutePoints.length,
			outlinePoints: currentOutlinePoints.length
		}),
		getSelectedOutlineId: () => userState.ui.selectedOutlineId,
		getOutlineEditTool: () => tools.outlineEdit,
		getActiveTool: () => editor.ui.activeTool,
		setActiveTool: (tool) => editor.setActiveTool(tool),
		setDrawingTarget: (target) => editor.setDrawingTarget(target),
		clearSelection
	});

	export const undo = actions.undo;
	export const redo = actions.redo;

	/* Canvas setup and input lifecycle live in createCanvasInput. */
	onMount(() => {
		if (!svgElement || !gElement) return;
		// Migrate old topographies lazily: their current canvas appearance becomes permanent.
		if (!userState.topo.canvasAspectRatio) {
			userState.topo.canvasAspectRatio = userState.topo.imageAspectRatio || 1.5;
		}
		if (!userState.topo.backgroundFit) userState.topo.backgroundFit = 'contain';
		canvasInput.setElements({ svg: svgElement, content: gElement });

		// Initialize ID counters from existing data to avoid collisions
		initializeIdCounters(userState.topo);

		// Initialize first history state
		saveHistory();

		return () => canvasInput.destroy();
	});

	// Canvas dimensions change only when its explicit logical aspect ratio changes.
	$effect(() => {
		if (userState.topo.canvasAspectRatio ?? userState.topo.imageAspectRatio) {
			canvasInput.refreshDimensions();
		}
	});

	function handleCanvasDown(input) {
		pointerController.down(input);
	}

	function handleCanvasMove(input) {
		interactionController.update(input);
	}

	function handleCanvasUp(input) {
		pointerController.up(input);
	}

	function isSelected(type, id) {
		return editor.isSelected(type, id);
	}

	function selectObject(type, id, multi = false) {
		editor.selectObject(type, id, multi);
	}

	function handleObjectMouseDown(event, { type, id, pitchId = null, variantId = null }) {
		objectInteractionController.objectMouseDown(event, { type, id, pitchId, variantId });
	}

	function clearSelection() {
		editor.clearSelection();
	}

	function handleEmptyTouchTap() {
		deselectEditTarget();
	}

	function deselectEditTarget() {
		if (!['symbolEdit', 'routeEdit', 'outlineEdit'].includes(editor.ui.activeTool)) return;
		clearSelection();
		editor.setDrawingTarget(null);
		editor.setActiveTool('select');
	}

	function beginTextEdit(id) {
		if (tools.text.beginEdit(id)) {
			editingTextNeedsFocus = true;
			editor.ui.editingTextNeedsFocus = true;
		}
	}

	function commitTextEdit() {
		tools.text.commitEdit();
		editingTextNeedsFocus = false;
		editor.ui.editingTextNeedsFocus = false;
	}

	function cancelTextEdit() {
		tools.text.cancelEdit();
		editingTextNeedsFocus = false;
		editor.ui.editingTextNeedsFocus = false;
	}

	function handleTextEditKeyDown(event) {
		tools.text.handleEditKeyDown(event);
		editingTextNeedsFocus = false;
		editor.ui.editingTextNeedsFocus = false;
	}

	function handleObjectClick(event, type, id) {
		objectInteractionController.objectClick(event, type, id);
	}

	function collectDraggingSelection(mouse) {
		return createTopoSelectionSnapshot({
			getTopo: () => userState.topo,
			selectedItems: editor.selectedItems,
			drawingTarget: editor.ui.drawingTarget,
			getEditablePath: (target) => editablePaths.resolve(target),
			startMouse: mouse
		});
	}

	function handleTextMouseDown(event, label) {
		objectInteractionController.textMouseDown(event, label);
	}

	function handleLabelMouseDown(event, { routeId, pitchId, variantId }) {
		objectInteractionController.routeLabelMouseDown(event, { routeId, pitchId, variantId });
	}

	export const finalize = actions.finalize;
	export const cancel = actions.cancel;

	export function getCurrentTool() {
		return currentTool;
	}

	export const simplifySelectedOutline = actions.simplifySelectedOutline;

	const keyboard = createTopoKeyboardController({
		getEditingTextId: () => editingTextLabelId,
		getCurrentTool: () => currentTool,
		finalize: actions.finalize,
		cancel: actions.cancel,
		getSelectedItems: () => editor.selectedItems,
		getCanvasSize: () => ({ baseWidth, baseHeight }),
		clipboard,
		getTopo: () => userState.topo,
		selection: editor,
		setActiveTool: (tool) => editor.setActiveTool(tool),
		setDrawingTarget: (target) => editor.setDrawingTarget(target),
		clearSelection,
		deleteSelection: (selectedItems) => commands.deleteSelection(selectedItems),
		recordHistory: saveHistory,
		undo,
		redo,
		setShiftPressed: (pressed) => editor.setShiftPressed(pressed)
	});

	function handleKeyDown(event) {
		keyboard.handleKeyDown(event);
	}
	onMount(() => {
		const handleKeyUp = (event) => {
			if (event.key === 'Shift') editor.setShiftPressed(false);
		};
		window.addEventListener('keydown', handleKeyDown);
		window.addEventListener('keyup', handleKeyUp);
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
			window.removeEventListener('keyup', handleKeyUp);
		};
	});

	// D3 Render groups (Managed imperatively)

	function updateD3Rendering() {
		renderTopo2D({
			svgElement,
			gElement,
			topo: userState.topo,
			ui: userState.ui,
			activeTool: editor.ui.activeTool,
			drawingTarget: editor.ui.drawingTarget,
			baseWidth,
			baseHeight,
			currentRoutePoints,
			currentOutlinePoints,
			selectedOutlineStyle: editor.ui.selectedOutlineStyle,
			outlinePreview: {
				baseWidth,
				baseHeight,
				fillColor: currentTool === tools.outline ? currentTool.fillColor : null,
				fillOpacity: currentTool === tools.outline ? currentTool.fillOpacity : null
			},
			brushPreview,
			canvasInput,
			editTools: renderEditServices,
			draftTools: { route: tools.route, multipitch: tools.multipitch },
			isSelected,
			selectionSize: editor.selectedItems.size,
			selectedSymbolInstance: editor.selectedSymbolInstance,
			interaction: editor.interaction,
			editingTextLabelId,
			editingTextValue,
			editingTextNeedsFocus,
			basePath: base,
			onObjectMouseDown: handleObjectMouseDown,
			onObjectClick: handleObjectClick,
			onLabelMouseDown: handleLabelMouseDown,
			onTextMouseDown: handleTextMouseDown,
			onBeginTextEdit: beginTextEdit,
			onTextEditKeyDown: handleTextEditKeyDown,
			onTextValueChange: (value) => tools.text.setValue(value),
			onCommitTextEdit: commitTextEdit,
			onTextFocusHandled: () => {
				editingTextNeedsFocus = false;
				editor.ui.editingTextNeedsFocus = false;
			},
			setActiveTouch: (identifier) => canvasInput.trackTouch({ identifier })
		});
	}

	// Trigger D3 render on state changes
	$effect(() => {
		trackTopoRenderDependencies({
			topo: userState.topo,
			currentRoutePoints,
			currentOutlinePoints,
			brushPreview,
			baseWidth,
			baseHeight
		});

		// Map these as dependencies too
		const _deps = {
			active: editor.ui.activeTool,
			selectedRoute: userState.ui.selectedRouteId,
			selectedOutline: userState.ui.selectedOutlineId,
			selectedFixpoint: userState.ui.selectedFixpointId,
			editingText: editingTextLabelId,
			editingTextValue,
			selectedItems: editor.selectedItems.size,
			selectionInteraction: editor.interaction?.kind,
			transform: transform,
			base: { baseWidth, baseHeight }
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
		viewBox="0 0 {baseWidth} {baseHeight}"
		preserveAspectRatio="xMidYMid meet"
		class="w-full h-full cursor-{editor.ui.activeTool === 'eraser' ? 'crosshair' : 'crosshair'}"
		style="touch-action: none;"
		role="application"
		aria-label="Topo Editor"
	>
		<g bind:this={gElement}></g>
	</svg>
</div>
