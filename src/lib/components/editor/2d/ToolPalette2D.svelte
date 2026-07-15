<script>
	import { _ } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
import { topoSymbols } from '@vorstieg/topo-renderer';
	import ToolBar from '$lib/components/editor/tools/ToolBar.svelte';

	let {
		activeTool = $bindable('route'),
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

	function toggleSymbolTool(id, symbols) {
		if (activeTool === id) {
			activeTool = 'select';
			return;
		}
		activeTool = id;
		if (!symbols.some((symbol) => symbol.id === selectedSymbol)) {
			selectedSymbol = symbols[0].id;
		}
	}

	let tools = $derived([
		{ id: 'route', icon: 'fa-route', label: $_('ui.route') },
		{ id: 'multipitch', icon: 'fa-timeline', label: $_('ui.multipitch') },
		{ id: 'outline', icon: 'fa-draw-polygon', label: $_('ui.outline') },
		{
			id: 'fixpoint',
			icon: 'fa-circle-dot',
			label: $_('ui.fixpoints'),
			onSelect: () => toggleSymbolTool('fixpoint', fixpoints)
		},
		{
			id: 'symbol',
			icon: 'fa-icons',
			label: $_('ui.symbol'),
			onSelect: () => toggleSymbolTool('symbol', features)
		},
		{ id: 'text', icon: 'fa-font', label: 'Text' },
		{ id: 'eraser', icon: 'fa-eraser', label: $_('ui.delete') }
	]);
</script>

<ToolBar
	title={$_('ui.2d_studio')}
	bind:activeTool
	deselectedTool="select"
	{tools}
	onBack={() => goto(base + '/')}
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
