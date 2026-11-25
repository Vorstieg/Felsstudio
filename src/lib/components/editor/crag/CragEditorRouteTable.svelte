<script lang="ts">
	import { _ } from 'svelte-i18n';
	import type { Route } from '@vorstieg/fels-types/types';
	import type { CragSelection, RouteDocument, RouteEntry } from './crag-route-types.ts';
	import { getRoutePathRoleMeta } from './route-path-roles.ts';
	type Selection = CragSelection | null;
	type Props = {
		routes?: RouteEntry[];
		selectedObject?: Selection;
		onSelectRoute?: (_path: string, _routeId: string | number) => void;
		onDeleteRoute?: (_path: string, _routeId: string | number) => void;
	};
	let {
		routes = [],
		selectedObject = null,
		onSelectRoute = () => {},
		onDeleteRoute = () => {}
	}: Props = $props();
	let collapsed = $state(true);

	function routeKey(document: RouteDocument, route: Route) {
		return `${document.path}:${route.id}`;
	}

	function routePathRefs(document: RouteDocument, route: Route) {
		const features = new Set(
			(document.data?.paths?.features || [])
				.filter(
					(feature) =>
						feature.geometry?.type === 'LineString' && feature.geometry.coordinates?.length > 1
				)
				.map((feature) => String(feature.id))
		);
		return (route.pathRefs || []).filter((ref) => features.has(String(ref.pathId)));
	}
</script>

<table class="w-full text-left text-micro-data">
	<thead class="text-warm-gray-400">
		<tr>
			<th class="pb-1 font-bold">{$_('editor.route_label')}</th>
			<th class="pb-1 font-bold">{$_('editor.type')}</th>
			<th class="pb-1 font-bold">{$_('editor.paths')}</th>
			<th></th>
		</tr>
	</thead>
	<tbody>
		{#each routes.slice(0, collapsed ? 3 : routes.length) as { document, route }}
			{@const refs = routePathRefs(document, route)}
			<tr
				class="border-t border-black/10 {selectedObject?.type === 'route' &&
				selectedObject.key === routeKey(document, route)
					? 'bg-creator-blue/5 text-creator-blue'
					: ''}"
			>
				<td>
					<button
						class="w-full py-1.5 text-left font-bold"
						onclick={(event) => {
							event.stopPropagation();
							onSelectRoute(document.path, route.id);
						}}
					>
						{route.name || $_('editor.unnamed_route')}
					</button>
				</td>
				<td class="pr-1.5">{route.type ? $_('types.' + route.type) : $_('editor.route_label')}</td>
				<td class="py-1 pr-1">
					{#if refs.length === 0}
						<span class="text-warm-gray-300">–</span>
					{:else}
						<div class="flex flex-wrap gap-1">
							{#each refs as ref}
								{@const meta = getRoutePathRoleMeta(ref.role)}
								<span
									class={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[9px] font-bold leading-none ${meta.badgeClass}`}
								>
									<span class={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`} aria-hidden="true"
									></span>
									{$_(meta.shortLabelKey)}
								</span>
							{/each}
						</div>
					{/if}
				</td>
				<td>
					<button
						class="text-warm-gray-300 hover:text-rose-600"
						title={$_('editor.delete_route')}
						onclick={(event) => {
							event.stopPropagation();
							onDeleteRoute(document.path, route.id);
						}}
					>
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
		onclick={() => (collapsed = !collapsed)}
	>
		<i class={`fa-solid ${collapsed ? 'fa-chevron-down' : 'fa-chevron-up'} text-[10px]`}></i>
		{collapsed
			? $_('editor.show_more_routes', { values: { count: routes.length - 3 } })
			: $_('editor.show_fewer_routes')}
	</button>
{/if}
