<script>
	import { _ } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
import { topoSymbols } from '@vorstieg/topo-renderer';
	import ToolBar from '$lib/components/editor/tools/ToolBar.svelte';

	let {
		activeTool = $bindable('route'),
		toolOptionsOpen = $bindable(false),
		selectedSymbol = $bindable('bolt'),
		hasPendingChanges = false,
		onFinishRoute = null,
		onCancelAction = null,
		onUndo = null,
		onRedo = null,
		onExport = null,
		status = 'idle',
		errorMessage = ''
	} = $props();

	const fixpoints = topoSymbols.filter((symbol) => symbol.type === 'fixpoint');
	const features = topoSymbols.filter((symbol) => symbol.type === 'feature');

	function selectSymbolTool(id, symbols, { isActive } = {}) {
		if (isActive) return;
		if (!symbols.some((symbol) => symbol.id === selectedSymbol)) {
			selectedSymbol = symbols[0].id;
		}
	}

	let tools = $derived([
		{ id: 'select', icon: 'fa-arrow-pointer', label: $_('ui.select') },
		{ id: 'route', icon: 'fa-route', label: $_('ui.route'), hasOptions: true },
		{ id: 'multipitch', icon: 'fa-timeline', label: $_('ui.multipitch'), hasOptions: true },
		{ id: 'outline', icon: 'fa-draw-polygon', label: $_('ui.outline'), hasOptions: true },
		{
			id: 'fixpoint',
			icon: 'fa-circle-dot',
			label: $_('ui.fixpoints'),
			hasOptions: true,
			onSelect: (context) => selectSymbolTool('fixpoint', fixpoints, context)
		},
		{
			id: 'symbol',
			icon: 'fa-icons',
			label: $_('ui.symbol'),
			hasOptions: true,
			onSelect: (context) => selectSymbolTool('symbol', features, context)
		},
		{ id: 'text', icon: 'fa-font', label: 'Text' },
		{ id: 'eraser', icon: 'fa-eraser', label: $_('ui.delete') }
	]);
</script>

<ToolBar
	bind:activeTool
	neutralTool="select"
	{tools}
	bind:toolOptionsOpen
	undo={onUndo ? { label: `${$_('ui.undo_desc')} (Ctrl+Z)`, run: onUndo } : null}
	redo={onRedo ? { label: `${$_('ui.redo_desc')} (Ctrl+Y)`, run: onRedo } : null}
	finish={hasPendingChanges && onFinishRoute
		? { label: $_('ui.finish'), run: onFinishRoute }
		: null}
	cancel={hasPendingChanges && onCancelAction
		? { label: $_('ui.cancel'), run: onCancelAction }
		: null}
	save={onExport ? { status, errorMessage, run: onExport } : null}
/>
