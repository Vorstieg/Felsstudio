<script>
	import { isMobileViewport } from '$lib/assets/js/mobile-utils.js';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';

	let {
		activeTool = $bindable('route'),
		selectedSymbol = $bindable('bolt'),
		hasPendingChanges = false,
		onFinishRoute = null,
		onCancelAction = null,
		onUndo = null,
		onRedo = null,
		onExport = null
	} = $props();

	import { vibrateOnAction } from '$lib/assets/js/mobile-utils.js';
	import { topoSymbols } from '$lib/assets/js/topo-utils.js';
	import { _ } from 'svelte-i18n';
	import { userState } from '$lib/state/editor.svelte.js';

	let isMobile = $state(false);

	onMount(() => {
		isMobile = isMobileViewport();
		const handleResize = () => {
			isMobile = isMobileViewport();
		};
		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	});

	function handleFinish(e) {
		e?.stopPropagation?.();
		e?.preventDefault?.();
		vibrateOnAction('light');
		if (onFinishRoute) {
			onFinishRoute();
		}
	}

	function handleCancel(e) {
		e?.stopPropagation?.();
		e?.preventDefault?.();
		vibrateOnAction('light');
		if (onCancelAction) {
			onCancelAction();
		}
	}

	let showSymbolPicker = $state(false);
	const fixpoints = topoSymbols.filter((s) => s.type === 'fixpoint');
	const features = topoSymbols.filter((s) => s.type === 'feature');

	function toggleTool(tool, category) {
		if (activeTool === tool) {
			activeTool = null;
			showSymbolPicker = false;
		} else {
			activeTool = tool;
			// If switching to a symbol tool, ensure the selected symbol is from that category
			const categorySymbols = category === 'fixpoint' ? fixpoints : features;
			if (!categorySymbols.some((s) => s.id === selectedSymbol)) {
				selectedSymbol = categorySymbols[0].id;
			}
			showSymbolPicker = true;
		}
	}
</script>

<!-- Mobile compact mode -->
{#if isMobile}
	<div
		class="fixed bottom-2 left-1/2 transform -translate-x-1/2 bg-white rounded p-1 border border-black/15 flex gap-1 items-center z-50 shadow-panel"
	>
		<!-- Tools -->
		<button
			class="w-10 h-10 flex items-center justify-center rounded-sm transition-none {activeTool ===
			'route'
				? 'bg-creator-blue text-white'
				: 'text-warm-gray-500 hover:bg-black/5'}"
			onclick={() => (activeTool = activeTool === 'route' ? null : 'route')}
			title={$_('ui.route')}
		>
			<i class="fa-solid fa-route"></i>
		</button>

		<button
			class="w-10 h-10 flex items-center justify-center rounded-sm transition-none {activeTool ===
			'multipitch'
				? 'bg-creator-blue text-white'
				: 'text-warm-gray-500 hover:bg-black/5'}"
			onclick={() => (activeTool = activeTool === 'multipitch' ? null : 'multipitch')}
			title={$_('ui.multipitch')}
		>
			<i class="fa-solid fa-timeline"></i>
		</button>

		<button
			class="w-10 h-10 flex items-center justify-center rounded-sm transition-none {activeTool ===
			'outline'
				? 'bg-creator-blue text-white'
				: 'text-warm-gray-500 hover:bg-black/5'}"
			onclick={() => (activeTool = activeTool === 'outline' ? null : 'outline')}
			title={$_('ui.outline')}
		>
			<i class="fa-solid fa-draw-polygon"></i>
		</button>

		<button
			class="w-10 h-10 flex items-center justify-center rounded-sm transition-none {activeTool ===
			'fixpoint'
				? 'bg-creator-blue text-white'
				: 'text-warm-gray-500 hover:bg-black/5'}"
			onclick={() => toggleTool('fixpoint', 'fixpoint')}
			title={$_('ui.fixpoints')}
		>
			<i class="fa-solid fa-circle-dot"></i>
		</button>

		<button
			class="w-10 h-10 flex items-center justify-center rounded-sm transition-none {activeTool ===
			'symbol'
				? 'bg-creator-blue text-white'
				: 'text-warm-gray-500 hover:bg-black/5'}"
			onclick={() => toggleTool('symbol', 'feature')}
			title={$_('ui.symbol')}
		>
			<i class="fa-solid fa-icons"></i>
		</button>

		<button
			class="w-10 h-10 flex items-center justify-center rounded-sm transition-none {activeTool ===
			'eraser'
				? 'bg-creator-blue text-white'
				: 'text-warm-gray-500 hover:bg-black/5'}"
			onclick={() => (activeTool = activeTool === 'eraser' ? null : 'eraser')}
			title={$_('ui.delete')}
		>
			<i class="fa-solid fa-eraser"></i>
		</button>

		<!-- Divider -->
		{#if hasPendingChanges}
			<div class="w-px h-6 bg-black/15 mx-0.5"></div>
			<button
				class="w-10 h-10 flex items-center justify-center rounded-sm bg-near-black text-white hover:bg-black shadow-sm transition-none"
				onclick={handleFinish}
				ontouchend={handleFinish}
				title="{$_('ui.finish')} (N)"
			>
				<i class="fa-solid fa-check text-[10px]"></i>
			</button>

			<button
				class="w-10 h-10 flex items-center justify-center rounded-sm bg-warm-white text-near-black border border-black/15 hover:bg-black/5 transition-none"
				onclick={handleCancel}
				ontouchend={handleCancel}
				title="{$_('ui.cancel')} (Esc)"
			>
				<i class="fa-solid fa-xmark text-[10px]"></i>
			</button>
		{/if}
	</div>

	<!-- Symbol picker for mobile -->
	{#if showSymbolPicker && (activeTool === 'symbol' || activeTool === 'fixpoint')}
		<div
			class="fixed bottom-14 left-1/2 transform -translate-x-1/2 bg-white rounded p-2 border border-black/15 z-50 w-[90vw] max-w-sm shadow-panel"
		>
			<div class="grid grid-cols-5 gap-1.5">
				{#each activeTool === 'fixpoint' ? fixpoints : features as symbol}
					<button
						class="flex flex-col items-center gap-1 p-1.5 rounded-sm transition-none {selectedSymbol ===
						symbol.id
							? 'bg-black/10 ring-1 ring-black/20'
							: 'hover:bg-black/5'}"
						onclick={() => {
							selectedSymbol = symbol.id;
							showSymbolPicker = false;
						}}
						title={$_(`topo.fixpoints.${symbol.id}`)}
					>
						<img src={symbol.icon} alt={symbol.name} class="w-6 h-6" />
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Desktop mode -->
{:else}
	<!-- Floating Hint Panel for Route/Outline -->
	{#if activeTool === 'route' || activeTool === 'multipitch' || activeTool === 'outline'}
		<div
			class="fixed top-[58px] left-2 flex items-center gap-3 p-1.5 bg-white rounded border border-black/15 shadow-modal z-[100]"
		>
			<div class="px-2 py-0.5 border-r border-black/10">
				<p class="text-ui-label text-near-black !m-0">{$_(`ui.${activeTool}`)}</p>
			</div>
			<div class="flex items-center gap-4 px-1 text-warm-gray-500">
				<div class="flex items-center gap-1.5 text-micro-data">
					<span>{$_('ui.set_vertex')}</span>
					<kbd
						class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm"
						>{$_('ui.click')}</kbd
					>
				</div>
				<div class="flex items-center gap-1.5 text-micro-data">
					<span>{$_('ui.undo_vertex')}</span>
					<kbd
						class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm"
						>Backspace</kbd
					>
				</div>
				<div class="flex items-center gap-1.5 text-micro-data">
					<span>{$_('ui.finalize')}</span>
					<kbd
						class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm"
						>Enter / N</kbd
					>
				</div>
				<div class="flex items-center gap-1.5 text-micro-data">
					<span>{$_('ui.cancel')}</span>
					<kbd
						class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm"
						>Esc</kbd
					>
				</div>
			</div>
		</div>
	{/if}

	<div class="panel p-1.5 flex items-center justify-between shadow-panel bg-white">
		<div class="flex items-center gap-2.5">
			<button
				class="w-7 h-7 flex items-center justify-center rounded-sm bg-black/5 hover:bg-black/10 text-near-black transition-none border border-black/10 ml-0.5"
				onclick={() => goto(base + '/')}
				title={$_('ui.back_to_launcher')}
			>
				<i class="fa-solid fa-arrow-left text-[11px]"></i>
			</button>
			<div class="ml-1 mr-3 hidden sm:block">
				<h1 class="text-section-title leading-none">{$_('ui.2d_studio')}</h1>
			</div>
			<div class="w-px h-5 bg-black/15 mx-1 hidden sm:block"></div>

			<div class="flex items-center gap-1">
				<button
					class={`flex items-center gap-2 rounded-sm py-1.5 px-3 text-ui-label transition-none ${activeTool === 'route' ? 'bg-creator-blue text-white' : 'bg-transparent text-warm-gray-500 hover:bg-black/5'}`}
					onclick={() => (activeTool = activeTool === 'route' ? null : 'route')}
				>
					<i class="fa-solid fa-route"></i>
					<span class="hidden md:inline">{$_('ui.route')}</span>
				</button>

				<button
					class={`flex items-center gap-2 rounded-sm py-1.5 px-3 text-ui-label transition-none ${activeTool === 'multipitch' ? 'bg-creator-blue text-white' : 'bg-transparent text-warm-gray-500 hover:bg-black/5'}`}
					onclick={() => (activeTool = activeTool === 'multipitch' ? null : 'multipitch')}
				>
					<i class="fa-solid fa-timeline"></i>
					<span class="hidden md:inline">{$_('ui.multipitch')}</span>
				</button>

				<button
					class={`flex items-center gap-2 rounded-sm py-1.5 px-3 text-ui-label transition-none ${activeTool === 'outline' ? 'bg-creator-blue text-white' : 'bg-transparent text-warm-gray-500 hover:bg-black/5'}`}
					onclick={() => (activeTool = activeTool === 'outline' ? null : 'outline')}
				>
					<i class="fa-solid fa-draw-polygon"></i>
					<span class="hidden md:inline">{$_('ui.outline')}</span>
				</button>

				<div class="relative group/tool">
					<button
						class={`flex items-center gap-2 rounded-sm py-1.5 px-3 text-ui-label transition-none ${activeTool === 'fixpoint' ? 'bg-creator-blue text-white' : 'bg-transparent text-warm-gray-500 hover:bg-black/5'}`}
						onclick={() => toggleTool('fixpoint', 'fixpoint')}
					>
						<i class="fa-solid fa-circle-dot"></i>
						<span class="hidden md:inline">{$_('ui.fixpoints')}</span>
					</button>

					{#if showSymbolPicker && activeTool === 'fixpoint'}
						<div
							class="fixed top-[58px] left-2 flex flex-col gap-2 p-2 bg-white rounded border border-black/15 shadow-modal z-[100] min-w-[320px]"
						>
							<div class="px-1 py-0.5 border-b border-black/10 flex justify-between items-center">
								<p class="text-ui-label text-near-black !m-0">{$_('ui.fixpoints')}</p>
								<span class="text-[9px] text-warm-gray-400 font-medium"
									>{$_('ui.select_type_to_place')}</span
								>
							</div>
							<div class="grid grid-cols-5 gap-1">
								{#each fixpoints as symbol}
									<button
										class="flex flex-col items-center gap-1 p-1.5 rounded transition-none {selectedSymbol ===
										symbol.id
											? 'bg-black/10 ring-1 ring-black/10'
											: 'hover:bg-black/5'}"
										onclick={() => (selectedSymbol = symbol.id)}
										title={$_(`topo.fixpoints.${symbol.id}`)}
									>
										<img src={symbol.icon} alt={symbol.name} class="w-4 h-4 opacity-80" />
										<span
											class="text-[7px] font-black uppercase text-warm-gray-500 truncate w-full text-center"
											>{$_(`topo.fixpoints.${symbol.id}`)}</span
										>
									</button>
								{/each}
							</div>
							<div
								class="pt-1.5 border-t border-black/10 flex flex-row flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-warm-gray-500"
							>
								<div class="flex items-center gap-1.5 text-micro-data">
									<span>{$_('ui.place')}</span>
									<kbd
										class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm"
										>{$_('ui.click')}</kbd
									>
								</div>
								<div class="flex items-center gap-1.5 text-micro-data">
									<span>{$_('ui.scale_up')}</span>
									<kbd
										class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm"
										>+</kbd
									>
								</div>
								<div class="flex items-center gap-1.5 text-micro-data">
									<span>{$_('ui.scale_down')}</span>
									<kbd
										class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm"
										>-</kbd
									>
								</div>
							</div>
						</div>
					{/if}
				</div>

				<div class="relative group/tool">
					<button
						class={`flex items-center gap-2 rounded-sm py-1.5 px-3 text-ui-label transition-none ${activeTool === 'symbol' ? 'bg-creator-blue text-white' : 'bg-transparent text-warm-gray-500 hover:bg-black/5'}`}
						onclick={() => toggleTool('symbol', 'feature')}
					>
						<i class="fa-solid fa-icons"></i>
						<span class="hidden md:inline">{$_('ui.symbol')}</span>
					</button>

					{#if showSymbolPicker && activeTool === 'symbol'}
						<div
							class="fixed top-[58px] left-2 flex flex-col gap-2 p-2 bg-white rounded border border-black/15 shadow-modal z-[100] min-w-[320px]"
						>
							<div class="px-1 py-0.5 border-b border-black/10 flex justify-between items-center">
								<p class="text-ui-label text-near-black !m-0">{$_('ui.symbol')}</p>
								<span class="text-[9px] text-warm-gray-400 font-medium"
									>{$_('ui.select_feature_to_place')}</span
								>
							</div>
							<div class="grid grid-cols-5 gap-1">
								{#each features as symbol}
									<button
										class="flex flex-col items-center gap-1 p-1.5 rounded transition-none {selectedSymbol ===
										symbol.id
											? 'bg-black/10 ring-1 ring-black/10'
											: 'hover:bg-black/5'}"
										onclick={() => (selectedSymbol = symbol.id)}
										title={$_(`topo.fixpoints.${symbol.id}`)}
									>
										<img src={symbol.icon} alt={symbol.name} class="w-4 h-4 opacity-80" />
										<span
											class="text-[7px] font-black uppercase text-warm-gray-500 truncate w-full text-center"
											>{$_(`topo.fixpoints.${symbol.id}`)}</span
										>
									</button>
								{/each}
							</div>
							<div
								class="pt-1.5 border-t border-black/10 flex flex-row flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-warm-gray-500"
							>
								<div class="flex items-center gap-1.5 text-micro-data">
									<span>{$_('ui.place')}</span>
									<kbd
										class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm"
										>{$_('ui.click')}</kbd
									>
								</div>
								<div class="flex items-center gap-1.5 text-micro-data">
									<span>{$_('ui.scale_up')}</span>
									<kbd
										class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm"
										>+</kbd
									>
								</div>
								<div class="flex items-center gap-1.5 text-micro-data">
									<span>{$_('ui.scale_down')}</span>
									<kbd
										class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm"
										>-</kbd
									>
								</div>
								<div class="flex items-center gap-1.5 text-micro-data">
									<span>{$_('ui.rotate')}</span>
									<kbd
										class="px-1.5 py-0.5 bg-black/5 border border-black/15 rounded-sm text-[9px] font-mono text-near-black font-bold shadow-sm"
										>{$_('ui.drag_handle')}</kbd
									>
								</div>
							</div>
						</div>
					{/if}
				</div>

				<button
					class={`flex items-center gap-2 rounded-sm py-1.5 px-3 text-ui-label transition-none ${activeTool === 'eraser' ? 'bg-creator-blue text-white' : 'bg-transparent text-warm-gray-500 hover:bg-black/5'}`}
					onclick={() => (activeTool = activeTool === 'eraser' ? null : 'eraser')}
				>
					<i class="fa-solid fa-eraser"></i>
					<span class="hidden md:inline">{$_('ui.delete')}</span>
				</button>
			</div>

			<div class="w-px h-5 bg-black/15 mx-1.5 hidden sm:block"></div>

			<div class="flex items-center gap-1">
				<button
					class="w-7 h-7 flex items-center justify-center rounded-sm text-warm-gray-500 hover:bg-black/5 transition-none"
					onclick={onUndo}
					title="{$_('ui.undo_desc')} (Ctrl+Z)"
				>
					<i class="fa-solid fa-rotate-left text-[11px]"></i>
				</button>
				<button
					class="w-7 h-7 flex items-center justify-center rounded-sm text-warm-gray-500 hover:bg-black/5 transition-none"
					onclick={onRedo}
					title="{$_('ui.redo_desc')} (Ctrl+Y)"
				>
					<i class="fa-solid fa-rotate-right text-[11px]"></i>
				</button>
			</div>
		</div>

		<div class="flex items-center gap-3 pr-1">
			{#if userState.ui.lastSaved}
				<div
					class="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-sm bg-black/5 text-warm-gray-400"
				>
					<i class="fa-solid fa-cloud-check text-[9px]"></i>
					<span class="text-[9px] font-bold uppercase tracking-tighter">{$_('ui.saved')}</span>
				</div>
			{/if}
			{#if hasPendingChanges}
				<div class="flex gap-1">
					<button
						class="py-1 px-3 rounded-sm bg-creator-blue text-white text-ui-label hover:bg-creator-blue-active transition-none shadow-sm flex items-center justify-center gap-1.5"
						onclick={handleFinish}
					>
						<i class="fa-solid fa-check text-[10px]"></i>{$_('ui.finish')}
					</button>
					<button
						class="py-1 px-3 rounded-sm bg-warm-white text-near-black border border-black/15 text-ui-label hover:bg-black/5 transition-none flex items-center justify-center gap-1.5"
						onclick={handleCancel}
					>
						<i class="fa-solid fa-xmark text-[10px]"></i>{$_('ui.cancel')}
					</button>
				</div>
			{/if}
			<button
				class="bg-near-black text-white px-4 py-1.5 rounded-sm text-[11px] font-bold shadow-sm hover:bg-black transition-none uppercase tracking-widest ml-1"
				onclick={onExport}
			>
				{$_('ui.export')}
			</button>
		</div>
	</div>
{/if}
