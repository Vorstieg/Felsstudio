<script>
	import { onMount } from 'svelte';

	let {
		title = 'Properties',
		subtitle = '',
		tabs = [],
		activeTab = $bindable(),
		onTabChange = (tab) => (activeTab = tab),
		width = '20rem',
		shadow = true,
		footer,
		headerActions,
		children
	} = $props();

	let isDesktop = $state(false);
	let sheetElement = $state();
	let sheetPosition = $state(0.4);
	let isDragging = $state(false);
	let startY = 0;
	let startPosition = 0;
	let didDrag = false;

	const collapsedPeekHeight = 48;
	const snapPoints = [0, 0.4, 0.9];

	onMount(() => {
		const updateLayout = () => (isDesktop = window.innerWidth > 1024);
		updateLayout();
		window.addEventListener('resize', updateLayout);
		return () => window.removeEventListener('resize', updateLayout);
	});

	function setSheetPosition(position) {
		sheetPosition = Math.max(0, Math.min(1, position));
		if (!sheetElement) return;
		const hiddenOffset = Math.max(0, sheetElement.offsetHeight - collapsedPeekHeight);
		sheetElement.style.transform = `translateY(${hiddenOffset * (1 - sheetPosition)}px)`;
	}

	function snapSheet(position) {
		return snapPoints.reduce((closest, point) =>
			Math.abs(point - position) < Math.abs(closest - position) ? point : closest
		);
	}

	function handlePointerDown(event) {
		isDragging = true;
		didDrag = false;
		startY = event.clientY;
		startPosition = sheetPosition;
		event.currentTarget?.setPointerCapture?.(event.pointerId);
	}

	function handlePointerMove(event) {
		if (!isDragging || !sheetElement) return;
		if (Math.abs(event.clientY - startY) > 4) didDrag = true;
		setSheetPosition(startPosition + (startY - event.clientY) / sheetElement.offsetHeight);
	}

	function handlePointerUp() {
		if (!isDragging) return;
		isDragging = false;
		setSheetPosition(snapSheet(sheetPosition));
	}

	function toggleSheet() {
		if (didDrag) return;
		setSheetPosition(sheetPosition > 0.45 ? 0.4 : 0.9);
	}
</script>

{#snippet tabBar(mobile = false)}
	{#if tabs.length}
		<div class="bg-black/5 rounded-sm p-0.5 border border-black/10 flex gap-0.5 mx-3 mb-2 shrink-0">
			{#each tabs as tab}
				<button
					type="button"
					class="flex-1 px-2 {mobile ? 'py-2.5' : 'py-1.5'} rounded-sm text-ui-label transition-none whitespace-nowrap {activeTab === tab.id ? mobile ? 'bg-creator-blue text-white' : 'bg-white shadow-sm text-near-black' : 'text-warm-gray-500 hover:bg-black/5'}"
					onclick={() => onTabChange(tab.id)}
					aria-label={tab.label}
				>
					{#if tab.icon}<i class="fa-solid {tab.icon} {mobile ? '' : 'mr-1.5'}"></i>{/if}
					{#if !mobile}{tab.label}{/if}
					{#if tab.count !== undefined}<span class="ml-1 text-micro-data {mobile && !tab.icon ? '' : ''}">{tab.count}</span>{/if}
				</button>
			{/each}
		</div>
	{/if}
{/snippet}

{#if isDesktop}
	<div class="fixed top-14 right-2 z-50 flex flex-col max-h-[calc(100vh-4rem)]" style:width>
		<div class="panel flex flex-1 flex-col overflow-hidden {shadow ? 'shadow-panel' : ''}">
			<div class="flex justify-between items-center border-b border-black/15 p-3 pb-2 mb-2 shrink-0">
				<div><h1 class="text-section-title">{title}</h1>{#if subtitle}<p class="text-ui-label m-0!">{subtitle}</p>{/if}</div>
				{@render headerActions?.()}
			</div>
			{@render tabBar()}
			<div class="overflow-y-auto flex-1 p-2.5 pt-0 custom-scrollbar bg-transparent">{@render children?.({ mobile: false })}</div>
		</div>
		{#if footer}<div class="mt-2 panel p-2 bg-white shadow-sm border-black/15">{@render footer()}</div>{/if}
	</div>
{:else}
	<div class="fixed inset-0 z-40 pointer-events-none">
		<div
			bind:this={sheetElement}
			class="fixed left-0 right-0 bottom-0 z-50 flex h-[90dvh] max-h-[90dvh] flex-col bg-white shadow-panel rounded-t-4xl border-t border-black/10 overflow-hidden pointer-events-auto transition-transform duration-300"
			role="dialog"
			aria-label={title}
		>
			<button
				type="button"
				class="w-full py-3 flex justify-center touch-none cursor-grab active:cursor-grabbing"
				onpointerdown={handlePointerDown}
				onpointermove={handlePointerMove}
				onpointerup={handlePointerUp}
				onpointercancel={handlePointerUp}
				onclick={toggleSheet}
				aria-label="Resize details panel"
			><span class="w-12 h-1.5 bg-warm-gray-300 rounded-full"></span></button>
			{@render tabBar(true)}
			<div class="overflow-y-auto flex-1 p-4 pt-1 custom-scrollbar pb-[max(1rem,env(safe-area-inset-bottom))]">{@render children?.({ mobile: true })}</div>
			{#if footer}<div class="border-t border-black/10 p-2 bg-white">{@render footer()}</div>{/if}
		</div>
	</div>
{/if}
