<script>
	import { _ } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { topoSymbols } from '$lib/assets/js/topo-utils.js';
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

	let showSymbolPicker = $state(false);
	const fixpoints = topoSymbols.filter((symbol) => symbol.type === 'fixpoint');
	const features = topoSymbols.filter((symbol) => symbol.type === 'feature');

	function toggleSymbolTool(id, symbols) {
		if (activeTool === id) {
			activeTool = null;
			showSymbolPicker = false;
			return;
		}
		activeTool = id;
		if (!symbols.some((symbol) => symbol.id === selectedSymbol)) selectedSymbol = symbols[0].id;
		showSymbolPicker = true;
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

{#if activeTool === 'route' || activeTool === 'multipitch' || activeTool === 'outline'}
	<div
		class="fixed left-2 top-16 z-[100] hidden items-center gap-4 rounded-sm border border-black/15 bg-white p-2 text-warm-gray-500 shadow-modal md:flex"
	>
		<span class="border-r border-black/10 pr-3 text-ui-label text-near-black"
			>{$_(`ui.${activeTool}`)}</span
		>
		<span class="text-micro-data"
			>{$_('ui.set_vertex')}
			<kbd
				class="ml-1 rounded-sm border border-black/15 bg-black/5 px-1.5 py-0.5 font-mono text-[9px] font-bold text-near-black"
				>{$_('ui.click')}</kbd
			></span
		>
		<span class="text-micro-data"
			>{$_('ui.undo_vertex')}
			<kbd
				class="ml-1 rounded-sm border border-black/15 bg-black/5 px-1.5 py-0.5 font-mono text-[9px] font-bold text-near-black"
				>Backspace</kbd
			></span
		>
	</div>
{/if}

{#if showSymbolPicker && (activeTool === 'symbol' || activeTool === 'fixpoint')}
	<div
		class="fixed bottom-16 left-1/2 z-[100] w-[min(20rem,calc(100vw-1rem))] -translate-x-1/2 rounded-sm border border-black/15 bg-white p-2 shadow-modal md:bottom-auto md:left-2 md:top-16 md:translate-x-0"
	>
		<div class="mb-2 flex items-center justify-between border-b border-black/10 px-1 pb-1">
			<p class="text-ui-label text-near-black">
				{activeTool === 'fixpoint' ? $_('ui.fixpoints') : $_('ui.symbol')}
			</p>
			<button
				type="button"
				class="text-warm-gray-500 hover:text-near-black"
				onclick={() => (showSymbolPicker = false)}
				aria-label={$_('ui.cancel')}><i class="fa-solid fa-xmark"></i></button
			>
		</div>
		<div class="grid grid-cols-5 gap-1.5">
			{#each activeTool === 'fixpoint' ? fixpoints : features as symbol}
				<button
					type="button"
					class={`flex flex-col items-center gap-1 rounded-sm p-1.5 transition-none ${selectedSymbol === symbol.id ? 'bg-black/10 ring-1 ring-black/20' : 'hover:bg-black/5'}`}
					onclick={() => {
						selectedSymbol = symbol.id;
						showSymbolPicker = false;
					}}
					title={$_(`topo.fixpoints.${symbol.id}`)}
				>
					<img src={symbol.icon} alt={symbol.name} class="h-5 w-5" />
				</button>
			{/each}
		</div>
	</div>
{/if}
