<script>
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { userState } from '$lib/state/editor.svelte.js';
	import { draftsState } from '$lib/state/drafts.svelte.js';

	let brokenDraftId = $state(null);

	onMount(() => {
		draftsState.init();
	});

	function handleSelect(wizardRoute) {
		goto(`${base}/${wizardRoute}`);
	}

	const workspaces = [
		{
			id: 'crags',
			name: 'ui.crag_studio',
			label: 'ui.geospatial_registry',
			description: 'ui.geospatial_desc',
			icon: 'fa-map-location-dot',
			color: 'bg-workspace-crag',
			wizardRoute: 'crags/select'
		},
		{
			id: 'topos-3d',
			name: 'ui.3d_studio',
			label: 'ui.interactive_reconstruction',
			description: 'ui.interactive_desc',
			icon: 'fa-cube',
			color: 'bg-workspace-topo-3d',
			wizardRoute: 'topos/3d/select'
		},
		{
			id: 'topos-2d',
			name: 'ui.2d_studio',
			label: 'ui.schematic_design',
			description: 'ui.schematic_desc',
			icon: 'fa-layer-group',
			color: 'bg-workspace-topo-2d',
			wizardRoute: 'topos/2d/select'
		},
		{
			id: 'felslager',
			name: 'ui.felslager_studio',
			label: 'ui.data_management',
			description: 'ui.data_management_desc',
			icon: 'fa-folder-tree',
			color: 'bg-workspace-felslager',
			wizardRoute: 'felslager/edit'
		},
		{
			id: 'path-routes',
			name: 'ui.path_studio',
			label: 'ui.track_based_routes',
			description: 'ui.path_desc',
			icon: 'fa-route',
			color: 'bg-workspace-crag',
			wizardRoute: 'topos/path/select'
		}
	];
</script>

<div class="h-screen bg-warm-white flex flex-col items-center p-4 overflow-y-auto">
	<div class="max-w-4xl w-full mt-12">
		<div class="mb-8 flex flex-col items-start border-b border-black/15 pb-4">
			<h1 class="text-display-title mb-1">{$_('ui.felsstudio')}</h1>
			<p class="text-ui-label text-warm-gray-500">{$_('ui.select_environment')}</p>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-5 gap-3">
			{#each workspaces as ws}
				<button
					class="panel p-4 flex flex-col h-full text-left hover:border-creator-blue transition-none group cursor-pointer"
					onclick={() => handleSelect(ws.wizardRoute)}
				>
					<div
						class="w-8 h-8 rounded {ws.color} flex items-center justify-center text-white text-sm mb-4 shadow-sm"
					>
						<i class="fa-solid {ws.icon}"></i>
					</div>

					<div class="mb-1">
						<span class="text-micro-data text-warm-gray-300">
							{$_(ws.label)}
						</span>
					</div>
					<h3 class="text-section-title mb-2 leading-tight">{$_(ws.name)}</h3>
					<p class="text-body-text text-warm-gray-500 leading-relaxed mb-6">
						{$_(ws.description)}
					</p>
				</button>
			{/each}
		</div>

		{#if draftsState.drafts.length > 0}
			<div class="mt-12 pt-8 border-t border-black/15">
				<div class="flex justify-between items-center mb-4">
					<p class="text-ui-label text-warm-gray-500">{$_('ui.resume_sessions')}</p>
					<span class="text-micro-data text-warm-gray-300"
					>{draftsState.drafts.length} {$_('ui.drafts_found')}</span
					>
				</div>
				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
					{#each draftsState.drafts as draft}
						<div
							class="panel p-3 text-left hover:border-creator-blue transition-none group bg-white/50 cursor-pointer"
							role="button"
							tabindex="0"
							onclick={async () => {
								brokenDraftId = null;
								const session = await draftsState.getById(draft.id);
								if (session) {
									userState.reset();
									const topo = session.topo || session;
									userState.topo = topo;

									if (session.clustering) {
										userState.clustering = { ...userState.clustering, ...session.clustering };
									}

									if (session.glbBlob) {
										userState.ui.glbBlob = session.glbBlob;
										userState.ui.modelUrl = URL.createObjectURL(session.glbBlob);
									}

									userState.ui.activeDraftId = draft.id;
									userState.ui.workspace =
										topo.editorMode === 'path'
											? 'topos/path/editor'
											: topo.editorMode === '2d'
												? 'topos/2d/editor'
												: 'topos/3d/editor';
									goto(`${base}/${userState.ui.workspace}`);
								} else {
									brokenDraftId = draft.id;
								}
							}}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									e.currentTarget.click();
								}
							}}
						>
							<div class="flex justify-between items-start mb-2">
								<div class="w-6 h-6 rounded-sm bg-black/5 flex items-center justify-center text-near-black">
									<i class="fa-solid fa-file-pen text-[10px]"></i>
								</div>
								<button
									class="text-warm-gray-300 hover:text-rose-600 transition-none p-1"
									onclick={(e) => {
										e.stopPropagation();
										draftsState.delete(draft.id);
									}}
									title={$_('ui.delete_draft')}
								>
									<i class="fa-solid fa-xmark text-xs"></i>
								</button>
							</div>
							<h4 class="text-body-text font-bold truncate mb-0.5">
								{draft.name || $_('ui.unnamed_topo')}
							</h4>
							<p class="text-micro-data text-warm-gray-400">
								{$_('ui.modified')} {new Date(draft.updated).toLocaleString([], {
								dateStyle: 'short',
								timeStyle: 'short'
							})}
							</p>
							{#if brokenDraftId === draft.id}
								<div
									class="mt-2 flex items-center justify-between gap-2 rounded bg-rose-50 border border-rose-200 px-2 py-1.5"
								>
									<p class="text-micro-data text-rose-600 leading-tight">
										Session data lost (browser storage cleared).
									</p>
									<button
										class="text-micro-data text-rose-500 hover:text-rose-700 underline whitespace-nowrap transition-none"
										onclick={(e) => {
											e.stopPropagation();
											draftsState.delete(draft.id);
											brokenDraftId = null;
										}}
									>Remove
									</button>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</div>
