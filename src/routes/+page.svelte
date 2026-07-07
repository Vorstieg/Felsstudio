<script>
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { userState } from '$lib/state/editor.svelte.js';
	import { draftsState } from '$lib/state/drafts.svelte.js';

	// Component for the file upload wizard
	import WorkspaceWizard from '$lib/components/editor/WorkspaceWizard.svelte';

	let { data } = $props();
	let step = $state('select'); // 'select' | 'wizard'
	let selectedWorkspace = $state(null);
	let brokenDraftId = $state(null);

	onMount(() => {
		draftsState.init();
	});

	function handleSelect(workspaceId) {
		selectedWorkspace = workspaceId;
		step = 'wizard';
	}

	function handleBack() {
		step = 'select';
		selectedWorkspace = null;
	}

	function handleComplete(workspace = selectedWorkspace) {
		userState.ui.workspace = workspace;
		goto(`${base}/${workspace}`);
	}

	const workspaces = [
		{
			id: 'crags',
			name: 'ui.crag_studio',
			label: 'ui.geospatial_registry',
			description: 'ui.geospatial_desc',
			icon: 'fa-map-location-dot',
			color: 'bg-workspace-crag',
			newId: 'crags/edit',
			editId: null
		},
		{
			id: 'topos-3d',
			name: 'ui.3d_studio',
			label: 'ui.interactive_reconstruction',
			description: 'ui.interactive_desc',
			icon: 'fa-cube',
			color: 'bg-workspace-topo-3d',
			newId: 'topos/3d',
			editId: null,
			actionLabel: 'ui.new_or_edit'
		},
		{
			id: 'topos-2d',
			name: 'ui.2d_studio',
			label: 'ui.schematic_design',
			description: 'ui.schematic_desc',
			icon: 'fa-layer-group',
			color: 'bg-workspace-topo-2d',
			newId: 'topos/2d/new',
			editId: null,
			actionLabel: 'ui.new_or_edit'
		}
	];
</script>

<div class="h-screen bg-warm-white flex flex-col items-center p-4 overflow-y-auto">
	<div class="max-w-4xl w-full mt-12">
		{#if step === 'select'}
			<div class="mb-8 flex flex-col items-start border-b border-black/15 pb-4">
				<h1 class="text-display-title mb-1">{$_('ui.felsstudio')}</h1>
				<p class="text-ui-label text-warm-gray-500">{$_('ui.select_environment')}</p>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-3 gap-3">
				{#each workspaces as ws}
					<button
						class="panel p-4 flex flex-col h-full text-left hover:border-creator-blue transition-none group cursor-pointer"
						onclick={() => handleSelect(ws.newId)}
					>
						<div class="w-8 h-8 rounded {ws.color} flex items-center justify-center text-white text-sm mb-4 shadow-sm">
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
						<span class="text-micro-data text-warm-gray-300">{draftsState.drafts.length} {$_('ui.drafts_found')}</span>
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
                                        // Handle legacy drafts vs new session structure
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
                                        userState.ui.workspace = topo.editorMode === '2d' ? 'topos/2d/edit' : 'topos/3d/edit';
                                        goto(`${base}/${userState.ui.workspace}`);
                                    } else {
                                        // Session data missing from IndexedDB (e.g. browser cleared storage)
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
										onclick={(e) => { e.stopPropagation(); draftsState.delete(draft.id); }}
										title={$_('ui.delete_draft')}
									>
										<i class="fa-solid fa-xmark text-xs"></i>
									</button>
								</div>
								<h4 class="text-body-text font-bold truncate mb-0.5">{draft.name || $_('ui.unnamed_topo')}</h4>
								<p class="text-micro-data text-warm-gray-400">
									{$_('ui.modified')} {new Date(draft.updated).toLocaleString([], {
									dateStyle: 'short',
									timeStyle: 'short'
								})}
								</p>
								{#if brokenDraftId === draft.id}
									<div
										class="mt-2 flex items-center justify-between gap-2 rounded bg-rose-50 border border-rose-200 px-2 py-1.5">
										<p class="text-micro-data text-rose-600 leading-tight">Session data lost (browser storage
											cleared).</p>
										<button
											class="text-micro-data text-rose-500 hover:text-rose-700 underline whitespace-nowrap transition-none"
											onclick={(e) => { e.stopPropagation(); draftsState.delete(draft.id); brokenDraftId = null; }}
										>Remove
										</button>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/if}
		{:else}
			<div class="max-w-xl mx-auto mt-8">
				<div class="panel overflow-hidden">
					<div class="p-4 border-b border-black/15 bg-white flex items-center justify-between">
						<div class="flex items-center gap-3">
							<button
								onclick={handleBack}
								class="w-8 h-8 rounded border border-transparent hover:border-black/15 hover:bg-black/5 flex items-center justify-center text-near-black transition-none"
								title={$_('ui.back_to_launcher')}
							>
								<i class="fa-solid fa-arrow-left"></i>
							</button>
							<div>
								<h2 class="text-section-title leading-none">
									{$_(workspaces.find((w) => w.newId === selectedWorkspace || w.editId === selectedWorkspace)?.name)}
								</h2>
								<p class="text-micro-data text-creator-blue mt-0.5">
									{$_('ui.workspace_label')}: {$_(
										workspaces.find((w) => w.newId === selectedWorkspace)?.actionLabel ||
											'ui.' + selectedWorkspace.split('/').at(-1)
									)}
								</p>
							</div>
						</div>
					</div>

					<div class="p-5 bg-white">
						<WorkspaceWizard
							workspace={selectedWorkspace}
							locations={data.locations}
							onComplete={handleComplete}
						/>
					</div>
				</div>


			</div>
		{/if}
	</div>
</div>

<style>
</style>
