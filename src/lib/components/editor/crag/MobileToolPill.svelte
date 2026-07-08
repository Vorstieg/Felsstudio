<script>
	let { activeTool = $bindable('position') } = $props();

	const tools = [
		{ id: 'position', icon: 'fa-location-crosshairs', label: 'Position' },
		{ id: 'parking', icon: 'fa-square-parking', label: 'Parking' },
		{ id: 'transit', icon: 'fa-bus', label: 'Transit' },
		{ id: 'track', icon: 'fa-route', label: 'Track' }
	];
</script>

<div class="fixed bottom-4 left-4 right-4 z-50 flex justify-center pointer-events-none">
	<div class="panel pointer-events-auto flex items-center gap-1 bg-white p-1.5 shadow-panel">
		{#each tools as tool}
			<button
				type="button"
				class={`flex items-center justify-center gap-1.5 rounded-sm px-3 py-2 text-ui-label transition-none ${activeTool === tool.id ? 'bg-creator-blue text-white' : 'bg-transparent text-warm-gray-500 hover:bg-black/5'}`}
				onclick={() => activeTool = tool.id}
				title={tool.label}
				aria-label={tool.label}
			>
				<i class={`fa-solid ${tool.icon} text-[11px]`}></i>
				<span class="text-[10px] font-bold uppercase tracking-wider">{tool.label}</span>
			</button>
		{/each}
	</div>
</div>
