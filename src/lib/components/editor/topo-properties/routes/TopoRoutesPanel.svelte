<script lang="ts">
	import type { Route } from '@vorstieg/fels-types/types';
	import type { TopoDrawingTarget } from '$lib/state/topo-drawing-target.ts';
	import { getTopo2DEditorState } from '$lib/state/topo-2d-editor-state.svelte.ts';
	import { getGradeValue } from '$lib/assets/js/topo-utils.ts';
	import { _ } from 'svelte-i18n';
	import { snapToBiggestHeight } from '$lib/assets/js/resize.ts';
	import SelectedRoutePanel from '$lib/components/editor/topo-properties/routes/SelectedRoutePanel.svelte';

	type RouteId = Route['id'];
	type Props = {
		routes?: Route[];
		drawingTarget?: TopoDrawingTarget | null;
		activeTool?: string;
		mobile?: boolean;
		onPathSelect?: ((_route: Route, _pathId: RouteId) => void) | null;
	};

	const editorState = getTopo2DEditorState();

	let {
		routes = [],
		drawingTarget = $bindable(null),
		activeTool = $bindable('route'),
		mobile = false,
		onPathSelect = null
	}: Props = $props();

	function selectRoute(route: Route) {
		if (editorState.ui.selectedRouteId === route.id) {
			if (
				editorState.ui.selectedPitchId != null ||
				editorState.ui.selectedVariantId != null ||
				editorState.ui.selectedPathId != null
			) {
				editorState.selectObject('route', route.id);
				drawingTarget = null;
				return;
			}
			editorState.clearSelection();
			drawingTarget = null;
			return;
		}

		editorState.selectObject('route', route.id);
		drawingTarget =
			!hasRouteType(route, 'multi-pitch') && !isTrackOnlyRoute(route)
			? { type: 'route', routeId: route.id }
				: null;
		if (mobile) snapToBiggestHeight?.();
	}

	function deleteRoute(route: Route) {
		const wasSelected = editorState.ui.selectedRouteId === route.id;
		editorState.removeRoute(route.id);
		if (wasSelected) drawingTarget = null;
	}

	function hasRouteType(route: Pick<Route, 'type'>, type: string) {
		return Array.isArray(route.type) ? route.type.includes(type) : route.type === type;
	}

	function isTrackOnlyRoute(route: Route) {
		return (route as Route & { geometryMode?: string }).geometryMode === 'track' || hasRouteType(route, 'alpine-tour');
	}
</script>

{#if routes.length === 0}
	<div class="bg-warm-white rounded-sm p-4 text-center border border-black/15">
		<p class="text-body-text text-warm-gray-500 font-medium">{$_('ui.no_routes_yet')}</p>
	</div>
{/if}

{#each routes as route, i (route.id)}
	<div
		id={'route-' + route.id}
		class={`panel-inner p-2.5 relative overflow-visible transition-none border
		${editorState.ui.selectedRouteId === route.id ? 'border-creator-blue' : 'border-black/10'}`}
	>
		<div
			class={mobile
				? 'flex items-center gap-3 cursor-pointer'
				: 'flex justify-between items-center mb-2 cursor-pointer group'}
			onclick={() => selectRoute(route)}
			onkeydown={(event) => {
				if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return;
				event.preventDefault();
				selectRoute(route);
			}}
			role="button"
			tabindex="0"
		>
			<div class={mobile ? 'flex items-center gap-3 min-w-0 flex-1' : 'flex items-center gap-2'}>
				<div
					class={`w-8 h-8 rounded-sm transition-none flex items-center justify-center text-xs font-black transition-colors shadow-sm
					${editorState.ui.selectedRouteId === route.id
								? 'bg-creator-blue text-white'
								: 'bg-warm-gray-100 text-warm-gray-500'}`}
				>
					{i + 1}
				</div>
				<div class="min-w-0">
					<h3
						class={`font-black text-sm truncate ${editorState.ui.selectedRouteId === route.id
									? 'text-creator-blue'
									: 'text-near-black'}`}

					>
						{route.name || `${$_('ui.route')} ${i + 1}`}
					</h3>
					{#if mobile}
						<div class="text-[10px] text-warm-gray-400 font-bold uppercase tracking-wider">
							{#if getGradeValue(route)}{getGradeValue(route)} ·{/if}
							{#if route.length}{route.length}m ·{/if}{$_(`types.${route.type}`)}
						</div>
					{/if}
				</div>
			</div>

			<button
				class='w-9 h-9 flex items-center justify-center rounded-sm text-warm-gray-200 hover:text-red-500 hover:bg-red-50 transition-none'
				onclick={(event) => {
					event.stopPropagation();
					deleteRoute(route);
				}}
				title={$_('ui.delete_route')}
				aria-label={$_('ui.delete_route')}
			>
				<i class='fa-solid fa-trash-can text-sm'></i>
			</button>
		</div>

		{#if !mobile || editorState.ui.selectedRouteId === route.id}
		<SelectedRoutePanel
			route={routes[i]}
			{mobile}
			{onPathSelect}
		/>
		{/if}
	</div>
{/each}
