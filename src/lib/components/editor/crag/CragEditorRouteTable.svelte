<script>
	let {
		routes = [],
		selectedObject = null,
		onSelectRoute = () => {},
		onDeleteRoute = () => {}
	} = $props();
	let collapsed = $state(true);

	function routeKey(document, route) {
		return `${document.path}:${route.id}`;
	}

	function routePathCount(document, route) {
		const features = new Set(
			(document.data?.paths?.features || [])
				.filter((feature) => feature.geometry?.type === 'LineString' && feature.geometry.coordinates?.length > 1)
				.map((feature) => String(feature.id))
		);
		return (route.pathRefs || []).filter((ref) => features.has(String(ref.pathId))).length;
	}

</script>

<table class="w-full text-left text-micro-data">
	<thead class="text-warm-gray-400">
	<tr>
		<th class="pb-1 font-bold">Route</th>
		<th class="pb-1 font-bold">Type</th>
		<th class="pb-1 font-bold">Paths</th>
		<th></th>
	</tr>
	</thead>
	<tbody>
	{#each routes.slice(0, collapsed ? 3 : routes.length) as { document, route }}
		<tr class="border-t border-black/10 {selectedObject?.type === 'route' && selectedObject.key === routeKey(document, route) ? 'bg-creator-blue/5 text-creator-blue' : ''}">
			<td>
				<button class="w-full py-1.5 text-left font-bold" onclick={(event) => { event.stopPropagation(); onSelectRoute(document.path, route.id); }}>
					{route.name || 'Unnamed route'}
				</button>
			</td>
			<td>{route.type || 'route'}</td>
			<td>{routePathCount(document, route)}</td>
			<td>
				<button class="text-warm-gray-300 hover:text-rose-600" title="Delete route" onclick={(event) => { event.stopPropagation(); onDeleteRoute(document.path, route.id); }}>
					<i class="fa-solid fa-trash-can"></i>
				</button>
			</td>
		</tr>
	{/each}
	</tbody>
</table>
{#if routes.length > 3}
	<button
		class="mt-2 flex w-full items-center justify-center gap-1 rounded-sm border border-black/10 bg-white px-2 py-1.5 text-micro-data font-bold text-creator-blue"
		onclick={() => collapsed = !collapsed}
	>
		<i class={`fa-solid ${collapsed ? 'fa-chevron-down' : 'fa-chevron-up'} text-[10px]`}></i>
		{collapsed ? `Show ${routes.length - 3} more route${routes.length === 4 ? '' : 's'}` : 'Show fewer routes'}
	</button>
{/if}
