<script>
	import { userState } from '$lib/state/editor.svelte.js';
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import { select } from 'd3-selection';
	import { RouteTool } from '../tools/RouteTool.svelte.js';
	import { SymbolTool } from '../tools/SymbolTool.svelte.js';
	import { OutlineTool } from '../tools/OutlineTool.svelte.js';
	import { EraserTool } from '../tools/EraserTool.svelte.js';
	import { SelectTool } from '../tools/SelectTool.svelte.js';
	import { TextTool } from '../tools/TextTool.svelte.js';
	import { SymbolEditTool } from '../tools/SymbolEditTool.svelte.js';
	import { RouteEditTool } from '../tools/RouteEditTool.svelte.js';
	import { OutlineEditTool } from '../tools/OutlineEditTool.svelte.js';
	import { createTopo2DEditorController } from './create-topo-2d-editor-controller.svelte.js';
	import { initializeIdCounters } from '$lib/assets/js/id-utils.js';
	import { getOutlinePoints } from '$lib/assets/js/outline-geometry.js';
	import { createEditablePathResolver } from './editable-path.js';
	import { buildTopo2DRenderModel } from './topo-2d-render-model.js';
	import { renderBackgroundLayer } from './render-background-layer.js';
	import { renderCurrentLayer } from './render-current-layer.js';
	import { renderOutlinesLayer } from './render-outlines-layer.js';
	import { renderRoutesLayer } from './render-routes-layer.js';
	import { renderTextLabelsLayer } from './render-text-labels-layer.js';
	import { renderSymbolsLayer } from './render-symbols-layer.js';
	import { createTopoLayerStack } from './create-topo-layer-stack.js';
	import { createTopo2DRenderContext } from './create-topo-render-context.js';
	import { createTopoHistory } from './create-topo-history.svelte.js';
	import { createCanvasInput } from './create-canvas-input.svelte.js';

	let {
		activeTool = $bindable('select'),
		selectedSymbol = 'bolt',
		selectedOutlineStyle = 'rock',
		drawingTarget = $bindable(null),
		hasPendingChanges = $bindable(false)
	} = $props();

	let svgElement = $state(null);
	let gElement = $state(null);

	// Pass editor callbacks to all remaining tools.
	const toolConfig = {
		saveHistory: () => history.save(),
		beginTextEdit,
		getCanvasSize: () => ({ baseWidth, baseHeight }),
		getDrawingTarget: () => drawingTarget,
		setDrawingTarget: (target) => (drawingTarget = target),
		clearSelection
	};
	const tools = {
		route: new RouteTool({ ...toolConfig, mode: 'route' }),
		multipitch: new RouteTool({ ...toolConfig, mode: 'multipitch' }),
		symbol: new SymbolTool(toolConfig),
		fixpoint: new SymbolTool(toolConfig),
		text: new TextTool(toolConfig),
		eraser: new EraserTool(toolConfig),
		outline: new OutlineTool(toolConfig),
		select: new SelectTool(toolConfig),
		routeEdit: new RouteEditTool({
			getTopo: () => userState.topo,
			getActiveTool: () => activeTool,
			getEditablePath: (target) => editablePaths.resolve(target),
			startInteraction: (kind, details) => editor.startInteraction(kind, details),
			isSelected,
			selectObject,
			getIsShiftPressed: () => isShiftPressed,
			beginSelectionMove: collectDraggingSelection,
			setDrawingTarget: (target) => (drawingTarget = target),
			saveHistory: () => history.save()
		}),
		outlineEdit: new OutlineEditTool({
			getTopo: () => userState.topo,
			getCanvasSize: () => ({ baseWidth, baseHeight }),
			getActiveTool: () => activeTool,
			getEditablePath: (target) => editablePaths.resolve(target),
			startInteraction: (kind, details) => editor.startInteraction(kind, details),
			isSelected,
			selectObject,
			getIsShiftPressed: () => isShiftPressed,
			beginSelectionMove: collectDraggingSelection,
			saveHistory: () => history.save()
		}),
		symbolEdit: new SymbolEditTool({
			getTopo: () => userState.topo,
			getCanvasSize: () => ({ baseWidth, baseHeight }),
			getInteraction: () => editor.interaction,
			startInteraction: (kind, details) => editor.startInteraction(kind, details),
			isSelected,
			selectObject,
			getSelectionSize: () => editor.selectedItems.size,
			getIsShiftPressed: () => isShiftPressed,
			getSelectedSymbolId: () => userState.ui.selectedFixpointId,
			saveHistory: () => history.save(),
			beginSelectionMove: (mouse) => ({
				kind: 'move-selection',
				...collectDraggingSelection(mouse)
			})
		})
	};

	// Track previous tool for lifecycle
	let previousTool = $state(null);

	// `select` is the editor's idle tool. Normalize bound values as well, so
	// consumers never have to handle a null active tool.
	$effect(() => {
		if (activeTool == null) activeTool = 'select';
	});

	let currentTool = $derived(tools[activeTool] || tools.select);

	// Sync selected options to their configured tool.
	$effect(() => {
		if (currentTool instanceof SymbolTool) {
			currentTool.selectedType = selectedSymbol;
		}
		if (tools.outline) {
			tools.outline.selectedStyle = selectedOutlineStyle;
		}
	});

	// Tool lifecycle management
	$effect(() => {
		if (previousTool && previousTool !== currentTool) {
			previousTool.onDeactivate?.();
		}

		// If we are activating a drawing tool, clear any existing selection
		if (
			currentTool instanceof RouteTool ||
			currentTool instanceof OutlineTool ||
			currentTool instanceof SymbolTool ||
			currentTool instanceof TextTool
		) {
			userState.ui.selectedFixpointId = null;
			userState.ui.selectedRouteId = null;
			userState.ui.selectedOutlineId = null;
			userState.ui.selectedTextLabelId = null;
			editor.clearSelection();
		}

		currentTool.onActivate?.();
		previousTool = currentTool;
	});

	// Derived state for rendering
	let currentRoutePoints = $derived(
		currentTool instanceof RouteTool ? currentTool.draftPoints : []
	);
	let currentOutlinePoints = $derived(
		currentTool instanceof OutlineTool ? currentTool.getPreviewPoints() : []
	);

	$effect(() => {
		const isMultiPitchRouteTarget = activeTool === 'multipitch' && drawingTarget?.type === 'newPitch';
		hasPendingChanges =
			(currentRoutePoints?.length || 0) > 0 ||
			(currentOutlinePoints?.length || 0) > 0 ||
			isMultiPitchRouteTarget;
	});
	// Symbol tool manages symbol creation directly into userState, so no "currentSymbolPoints" needed for preview distinct from cursor?
	// RouteTool owns route draft points, target transitions, and previews.

	const editor = createTopo2DEditorController({
		getTopo: () => userState.topo,
		ui: userState.ui
	});
	const editablePaths = createEditablePathResolver({
		getTopo: () => userState.topo,
		getCanvasSize: () => ({ baseWidth, baseHeight })
	});
	let editingTextLabelId = $state(null);
	let editingTextValue = $state('');
	let editingTextOriginalValue = $state('');
	let editingTextNeedsFocus = false;
	let isShiftPressed = $state(false);

	const history = createTopoHistory({
		getTopo: () => userState.topo,
		restore: (state) => {
			userState.topo.routes = JSON.parse(JSON.stringify(state.routes));
			userState.topo.fixPoints = JSON.parse(JSON.stringify(state.fixPoints));
			userState.topo.outlines = JSON.parse(JSON.stringify(state.outlines));
			userState.topo.textLabels = JSON.parse(JSON.stringify(state.textLabels || []));
		}
	});
	const saveHistory = () => history.save();
	const canvasInput = createCanvasInput({
		getActiveTool: () => activeTool,
		getAspectRatio: () => userState.topo.imageAspectRatio,
		onDown: handleCanvasDown,
		onMove: handleCanvasMove,
		onUp: handleCanvasUp,
		onEmptyTouchTap: handleEmptyTouchTap
	});
	let baseWidth = $derived(canvasInput.baseWidth);
	let baseHeight = $derived(canvasInput.baseHeight);
	let transform = $derived(canvasInput.transform);

	export function undo() {
		if (
			(currentTool instanceof RouteTool || currentTool instanceof OutlineTool) &&
			(currentTool instanceof RouteTool
				? currentTool.draftPoints.length > 0
				: currentTool.currentPoints.length > 0)
		) {
			currentTool.undoLastPoint();
			return;
		}

		history.undo();
	}

	export function redo() {
		history.redo();
	}

	/* Canvas setup and input lifecycle live in createCanvasInput. */
	onMount(() => {
		if (!svgElement || !gElement) return;
		canvasInput.setElements({ svg: svgElement, content: gElement });

		// Initialize ID counters from existing data to avoid collisions
		initializeIdCounters(userState.topo);

		// Initialize first history state
		saveHistory();

		return () => canvasInput.destroy();
	});

	// Update base dimensions when image aspect ratio changes
	$effect(() => {
		if (userState.topo.imageAspectRatio) {
			canvasInput.refreshDimensions();
		}
	});

	function handleCanvasDown(input) {
		if (!input || (input.button !== 0 && !input.isTouch)) return;
		const { point, sourceEvent: event } = input;

		if (editingTextLabelId) {
			commitTextEdit();
			event.stopPropagation?.();
			return;
		}
		if (['symbolEdit', 'routeEdit', 'outlineEdit'].includes(activeTool)) {
			deselectEditTarget();
			return;
		}

		// If in selection mode, clicking empty space clears selection (unless Shift is pressed)
		if (activeTool === 'select' && !isShiftPressed) {
			clearSelection();
		}

		const textLabelIdsBefore =
			activeTool === 'text'
				? new Set((userState.topo.textLabels || []).map((label) => label.id))
				: null;

		// Delegate to tool - this handles placing points, etc.
		currentTool.onMouseDown(event, point);

		if (activeTool === 'text' && textLabelIdsBefore) {
			const createdLabel = (userState.topo.textLabels || []).find(
				(label) => !textLabelIdsBefore.has(label.id)
			);
			if (createdLabel) beginTextEdit(createdLabel.id);
		}
	}

	function handleCanvasMove(input) {
		if (!input) return;
		const { point: mouse, sourceEvent: event } = input;

		// Delegate to tool for generic mouse move (e.g. hover effects)
		currentTool.onMouseMove(event, mouse);

		const interaction = editor.interaction;
		if (interaction?.kind === 'move-selection') {
			const deltaX = mouse.x - interaction.startMouse.x;
			const deltaY = mouse.y - interaction.startMouse.y;

			// Move routes
			interaction.items.paths.forEach(({ target, snapshot }) => {
				editablePaths.resolve(target)?.translateFrom(snapshot, [deltaX, deltaY]);
			});

			// Move symbols
			interaction.items.symbols.forEach(({ symbolId, startPos }) => {
				const symbol = userState.topo.fixPoints.find((s) => s.id === symbolId);
				if (symbol) {
					symbol.position2D = [startPos[0] + deltaX, startPos[1] + deltaY];
				}
			});

			// Move text labels
			interaction.items.texts.forEach(({ textId, startPos }) => {
				const label = userState.topo.textLabels?.find((t) => t.id === textId);
				if (label) {
					label.position2D = [startPos[0] + deltaX, startPos[1] + deltaY];
				}
			});
		} else if (interaction?.kind === 'move-point') {
			editablePaths
				.resolve(interaction)
				?.movePoint(interaction.pointIndex, [mouse.x, mouse.y]);
		} else if (interaction?.kind === 'transform-preset-outline') {
			tools.outlineEdit.applySemanticTransform(interaction, mouse);
		} else if (
			interaction?.kind === 'move-symbol' ||
			interaction?.kind === 'rotate-symbol' ||
			interaction?.kind === 'scale-symbol'
		) {
			currentTool.onMouseMove(event, mouse);
		} else if (interaction?.kind === 'move-route-label') {
			const route = userState.topo.routes.find((r) => r.id === interaction.routeId);
			if (route) {
				const target = interaction.pitchId
					? route.pitches.find((p) => p.id === interaction.pitchId)
					: interaction.variantId
						? route.variants?.find((v) => v.id === interaction.variantId)
						: route;
				if (target && target.points2D?.length > 0) {
					const basePoint = target.points2D[0];
					if (!target.labelOffset2D) target.labelOffset2D = [0, 0.05];
					target.labelOffset2D = [mouse.x - basePoint[0], mouse.y - basePoint[1]];
				}
			}
		} else if (interaction?.kind === 'move-text') {
			const label = userState.topo.textLabels?.find((t) => t.id === interaction.id);
			if (label) {
				label.position2D = [
					interaction.startPos[0] + mouse.x - interaction.startMouse.x,
					interaction.startPos[1] + mouse.y - interaction.startMouse.y
				];
			}
		}
	}

	function handleCanvasUp(input) {
		if (!input) return;
		const { point, sourceEvent: event } = input;
		currentTool.onMouseUp(event, point);

		if (editor.endInteraction()) saveHistory();
	}

	function isSelected(type, id) {
		return editor.isSelected(type, id);
	}

	function selectObject(type, id, multi = false) {
		editor.selectObject(type, id, multi);
		if(type ==='symbol'){
			activeTool = 'symbolEdit'
		}
		else if (type === 'route') {
			activeTool = 'routeEdit';
		}
		else if (type === 'outline') {
			activeTool = 'outlineEdit';
		}
		else {
			activeTool = 'select'
		}
	}

	function handleObjectMouseDown(event, { type, id, pitchId = null, variantId = null }) {
		if (activeTool !== 'select') return;
		event?.stopPropagation?.();
		const mouse = canvasInput.normalizeEvent(event)?.point;
		if (!mouse) return;

		if (!isSelected(type, id)) {
			selectObject(type, id, isShiftPressed);
		}
		if (type === 'route') {
			if (pitchId) {
				drawingTarget = { type: 'pitch', routeId: id, pitchId };
			} else if (variantId) {
				drawingTarget = { type: 'variant', routeId: id, variantId };
			} else {
				drawingTarget = null;
			}
		}
		editor.startInteraction('move-selection', collectDraggingSelection(mouse));
	}

	function clearSelection() {
		editor.clearSelection();
	}

	function handleEmptyTouchTap() {
		deselectEditTarget();
	}

	function deselectEditTarget() {
		if (!['symbolEdit', 'routeEdit', 'outlineEdit'].includes(activeTool)) return;
		clearSelection();
		drawingTarget = null;
		activeTool = 'select';
	}

	function beginTextEdit(id) {
		const label = userState.topo.textLabels?.find((textLabel) => textLabel.id === id);
		if (!label) return;
		selectObject('text', id);
		editingTextLabelId = id;
		editingTextValue = label.text || '';
		editingTextOriginalValue = label.text || '';
		editingTextNeedsFocus = true;
	}

	function commitTextEdit() {
		if (!editingTextLabelId) return;
		const label = userState.topo.textLabels?.find(
			(textLabel) => textLabel.id === editingTextLabelId
		);
		const nextText = editingTextValue.trim();

		if (label) {
			if (nextText) {
				label.text = nextText;
			} else {
				userState.topo.textLabels = (userState.topo.textLabels || []).filter(
					(textLabel) => textLabel.id !== editingTextLabelId
				);
				userState.ui.selectedTextLabelId = null;
				editor.selectedItems.delete(`text:${editingTextLabelId}`);
			}
		}

		if (nextText !== editingTextOriginalValue) saveHistory();
		editingTextLabelId = null;
		editingTextValue = '';
		editingTextOriginalValue = '';
	}

	function cancelTextEdit() {
		const label = userState.topo.textLabels?.find(
			(textLabel) => textLabel.id === editingTextLabelId
		);
		if (label) label.text = editingTextOriginalValue;
		editingTextLabelId = null;
		editingTextValue = '';
		editingTextOriginalValue = '';
	}

	function handleTextEditKeyDown(event) {
		event.stopPropagation();
		if (event.key === 'Enter') {
			event.preventDefault();
			commitTextEdit();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			cancelTextEdit();
		}
	}

	function handleObjectClick(event, type, id) {
		if (event?.stopPropagation) event.stopPropagation();
		if (activeTool !== 'select') return;
		if (currentRoutePoints.length > 0 || currentOutlinePoints.length > 0) return;
		selectObject(type, id, isShiftPressed);
	}

	function collectDraggingSelection(mouse) {
		const paths = [];
		const symbols = [];
		const texts = [];
		const addPath = (target) => {
			const path = editablePaths.resolve(target);
			if (path?.getPoints().length) paths.push({ target, snapshot: path.snapshot() });
		};

		editor.selectedItems.forEach((itemKey) => {
			const [type, id] = itemKey.split(':');

			if (type === 'route') {
				const r = userState.topo.routes.find((rt) => rt.id === id);
				if (r) {
					const selectedPitchId =
						drawingTarget?.type === 'pitch' && drawingTarget.routeId === r.id
							? drawingTarget.pitchId
							: null;
					const selectedVariantId =
						drawingTarget?.type === 'variant' && drawingTarget.routeId === r.id
							? drawingTarget.variantId
							: null;

					if (r.points2D && !selectedPitchId && !selectedVariantId) {
						addPath({ routeId: r.id });
					}

					if (r.pitches) {
						r.pitches.forEach((p) => {
							if (selectedPitchId && p.id !== selectedPitchId) return;
							if (p.points2D) {
								addPath({ routeId: r.id, pitchId: p.id });
							}
						});
					}
					if (r.variants) {
						r.variants.forEach((v) => {
							if (selectedVariantId && v.id !== selectedVariantId) return;
							if (v.points2D) {
								addPath({ routeId: r.id, variantId: v.id });
							}
						});
					}
				}
			} else if (type === 'outline') {
				addPath({ outlineId: id });
			} else if (type === 'symbol') {
				const s = userState.topo.fixPoints.find((fp) => fp.id === id);
				if (s && s.position2D) {
					symbols.push({
						symbolId: s.id,
						startPos: [...s.position2D]
					});
				}
			} else if (type === 'text') {
				const t = userState.topo.textLabels?.find((label) => label.id === id);
				if (t && t.position2D) {
					texts.push({
						textId: t.id,
						startPos: [...t.position2D]
					});
				}
			}
		});

		return {
			items: { paths, symbols, texts },
			startMouse: mouse
		};
	}

	function handleTextMouseDown(event, label) {
		if (activeTool !== 'select') return;
		event?.stopPropagation?.();
		const mouse = canvasInput.normalizeEvent(event)?.point;
		if (!mouse || !label.position2D) return;
		selectObject('text', label.id, isShiftPressed);
		editor.startInteraction('move-text', {
			id: label.id,
			startPos: [...label.position2D],
			startMouse: mouse
		});
	}

	function handleLabelMouseDown(event, { routeId, pitchId, variantId }) {
		event?.stopPropagation?.();
		editor.startInteraction('move-route-label', { routeId, pitchId, variantId });
	}

	export function finalize() {
		if (currentTool && typeof currentTool.finalize === 'function') {
			currentTool.finalize();
		}
	}

	export function cancel() {
		if (currentTool && typeof currentTool.cancel === 'function') {
			currentTool.cancel();
		} else {
			currentTool.onKeyDown?.({ key: 'Escape' });
		}
		drawingTarget = null;
		clearSelection();
	}

	export function getCurrentTool() {
		return currentTool;
	}

	function handleKeyDown(event) {
		if (editingTextLabelId) return;

		// Track shift key for multi-select
		if (event.key === 'Shift') {
			isShiftPressed = true;
		}

		// Global delete handler
		if (event.key === 'Escape') {
			// Priority 1: If drawing, cancel the drawing
			if (currentRoutePoints.length > 0 || currentOutlinePoints.length > 0) {
				currentTool.cancel?.();
				return;
			}

			// Priority 2: If a tool is active, deselect it
			if (activeTool !== 'select') {
				currentTool.cancel?.();
				drawingTarget = null;
				activeTool = 'select';
				clearSelection();
				return;
			}

			// Priority 3: Clear all selections
			clearSelection();
		}

		if (event.key === 'Delete' || event.key === 'Backspace') {
			if (editor.selectedItems.size > 0) {
				const idsByType = { route: [], symbol: [], outline: [], text: [] };
				editor.selectedItems.forEach((itemKey) => {
					const [type, id] = itemKey.split(':');
					idsByType[type].push(id);
				});

				// Delete routes
				if (idsByType.route.length > 0) {
					tools.routeEdit.delete(idsByType.route);
					userState.ui.selectedRouteId = null;
				}

				// Delete symbols
				if (idsByType.symbol.length > 0) {
					tools.symbolEdit.delete(idsByType.symbol);
					userState.ui.selectedFixpointId = null;
				}

				// Delete outlines
				if (idsByType.outline.length > 0) {
					userState.topo.outlines = userState.topo.outlines.filter(
						(o) => !idsByType.outline.includes(o.id)
					);
					userState.ui.selectedOutlineId = null;
				}

				if (idsByType.text.length > 0) {
					userState.topo.textLabels = (userState.topo.textLabels || []).filter(
						(t) => !idsByType.text.includes(t.id)
					);
					userState.ui.selectedTextLabelId = null;
				}

				editor.selectedItems.clear();
				saveHistory();
				return;
			}

			// Single delete (existing logic)
			if (userState.ui.selectedFixpointId) {
				const idToDelete = userState.ui.selectedFixpointId;
				if (tools.symbolEdit.delete([idToDelete])) saveHistory();

				userState.ui.selectedFixpointId = null;
				editor.selectedSymbolInstance = null;
				return;
			}
		}

		currentTool.onKeyDown(event);

		if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
			event.preventDefault();
			undo();
		} else if ((event.ctrlKey || event.metaKey) && event.key === 'y') {
			event.preventDefault();
			redo();
		}
	}


	onMount(() => {
		window.addEventListener('keydown', handleKeyDown);
		window.addEventListener('keyup', (event) => {
			if (event.key === 'Shift') {
				isShiftPressed = false;
			}
		});
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
		};
	});

	// D3 Render groups (Managed imperatively)

	function updateD3Rendering() {
		if (!svgElement || !gElement) return;

		const svg = select(svgElement);

		// Interaction state check for suppressing handles/gizmos
		// We suppress handles when moving OBJECTS, but NOT when moving POINTS
		const isAnyInteractionActive =
			editor.interaction && editor.interaction.kind !== 'move-point';

		const layers = createTopoLayerStack(gElement);
		const {
			background: bgLayer,
			outlines: outlinesLayer,
			routes: routesLayer,
			current: currentLayer,
			handles: handlesLayer,
			symbols: symbolsLayer,
			text: textLayer
		} = layers;
		const renderModel = buildTopo2DRenderModel({
			topo: userState.topo,
			ui: userState.ui,
			isSelected,
			selectionSize: editor.selectedItems.size,
			activeTool,
			drawingTarget,
			isInteractionActive: isAnyInteractionActive,
			baseWidth,
			baseHeight,
			currentRoutePoints,
			currentOutlinePoints
		});

		const renderContext = createTopo2DRenderContext({
			svg,
			layers,
			topo: userState.topo,
			renderModel,
			activeTool,
			baseWidth,
			baseHeight,
			currentRoutePoints,
			currentOutlinePoints,
			selectedOutlineStyle,
			outlinePreview: {
				baseWidth,
				baseHeight,
				fillColor: currentTool instanceof OutlineTool ? currentTool.fillColor : null,
				fillOpacity: currentTool instanceof OutlineTool ? currentTool.fillOpacity : null
			},
			canvasInput,
			routeEditTool: tools.routeEdit,
			outlineEditTool: tools.outlineEdit,
			symbolEditTool: tools.symbolEdit,
			isSelected,
			selectedSymbolInstance: editor.selectedSymbolInstance,
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
			onTextValueChange: (value) => (editingTextValue = value),
			onCommitTextEdit: commitTextEdit,
			onTextFocusHandled: () => (editingTextNeedsFocus = false),
			setActiveTouch: (identifier) => canvasInput.trackTouch({ identifier })
		});

		renderBackgroundLayer(renderContext);
		renderOutlinesLayer(renderContext);
		renderRoutesLayer(renderContext);
		renderCurrentLayer(renderContext);
		tools.route.render(renderContext);
		tools.multipitch.render(renderContext);
		renderSymbolsLayer(renderContext);
		renderTextLabelsLayer(renderContext);
	}

	// Trigger D3 render on state changes
	$effect(() => {
		// Explicitly track deep reactive dependencies for D3 rendering
		// Svelte 5 needs to see these accessed synchronously to track them
		for (const r of userState.topo.routes) {
			r.lineStyle;
			if (r.labelOffset2D) {
				r.labelOffset2D[0];
				r.labelOffset2D[1];
			}
			if (r.points2D) {
				for (const p of r.points2D) {
					p[0];
					p[1];
				}
			}
			if (r.pitches) {
				for (const pitch of r.pitches) {
					pitch.lineStyle;
					pitch.grade;
					pitch.length;
					pitch.pitchNumber;
					if (pitch.labelOffset2D) {
						pitch.labelOffset2D[0];
						pitch.labelOffset2D[1];
					}
					if (pitch.points2D) {
						for (const p of pitch.points2D) {
							p[0];
							p[1];
						}
					}
				}
			}
			if (r.variants) {
				for (const variant of r.variants) {
					variant.name;
					variant.lineStyle;
					variant.grade;
					variant.length;
					if (variant.labelOffset2D) {
						variant.labelOffset2D[0];
						variant.labelOffset2D[1];
					}
					if (variant.points2D) {
						for (const p of variant.points2D) {
							p[0];
							p[1];
						}
					}
				}
			}
		}
		for (const o of userState.topo.outlines) {
			o.lineStyle;
			o.fillColor;
			o.fillOpacity;
			o.closed;
			o.shape?.type;
			o.shape?.radius2D;
			o.shape?.fromCenter;
			o.shape?.square;
			const outlinePoints = getOutlinePoints(o, { baseWidth, baseHeight });
			for (const p of outlinePoints) {
				p[0];
				p[1];
			}
		}
		for (const s of userState.topo.fixPoints) {
			if (s.position2D) {
				s.position2D[0];
				s.position2D[1];
				s.rotation2D;
				s.scale2D;
			}
		}
		for (const t of userState.topo.textLabels || []) {
			t.text;
			t.fontSize2D;
			t.color;
			t.fontWeight;
			if (t.position2D) {
				t.position2D[0];
				t.position2D[1];
			}
		}
		for (const p of currentRoutePoints) {
			p[0];
			p[1];
		}
		for (const p of currentOutlinePoints) {
			p[0];
			p[1];
		}

		// Map these as dependencies too
		const _deps = {
			active: activeTool,
			selectedRoute: userState.ui.selectedRouteId,
			selectedOutline: userState.ui.selectedOutlineId,
			selectedFixpoint: userState.ui.selectedFixpointId,
			editingText: editingTextLabelId,
			editingTextValue,
			selectedItems: editor.selectedItems.size,
			transform: transform,
			base: { baseWidth, baseHeight }
		};

		updateD3Rendering();
	});
</script>

<div
	class="relative w-full h-full bg-gray-100 rounded-lg overflow-hidden"
	style="touch-action: none;"
>
	<svg
		bind:this={svgElement}
		viewBox="0 0 {baseWidth} {baseHeight}"
		class="w-full h-full cursor-{activeTool === 'eraser' ? 'crosshair' : 'crosshair'}"
		style="touch-action: none;"
		role="application"
		aria-label="Topo Editor"
	>
		<g bind:this={gElement}></g>
	</svg>
</div>
