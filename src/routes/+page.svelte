<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { authState } from '$lib/api/auth.svelte.ts';
	import { draftsState, type DraftMetadata } from '$lib/state/drafts.svelte.ts';
	import LanguageSwitcher from '$lib/components/ui/LanguageSwitcher.svelte';
	import SessionInfo from '$lib/components/ui/SessionInfo.svelte';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';

	let brokenDraftId = $state<string | null>(null);
	let draftPendingDelete = $state<DraftMetadata | null>(null);

	onMount(() => {
		void draftsState.load();
	});

	function handleSelect(wizardRoute: string) {
		goto(`${base}/${wizardRoute}`);
	}

	function draftWorkspaceMeta(lastEditor: DraftMetadata['lastEditor']) {
		if (lastEditor === 'crag') {
			return {
				label: $_('ui.crag_studio'),
				icon: 'fa-map-location-dot',
				badgeClass: 'bg-workspace-crag/15 text-near-black',
				dotClass: 'bg-workspace-crag'
			};
		}
		if (lastEditor === '2d') {
			return {
				label: $_('ui.2d_studio'),
				icon: 'fa-layer-group',
				badgeClass: 'bg-workspace-topo-2d/15 text-near-black',
				dotClass: 'bg-workspace-topo-2d'
			};
		}
		return {
			label: $_('ui.3d_studio'),
			icon: 'fa-cube',
			badgeClass: 'bg-workspace-topo-3d/15 text-near-black',
			dotClass: 'bg-workspace-topo-3d'
		};
	}

	async function openDraft(draft: DraftMetadata) {
		brokenDraftId = null;
		const session = await draftsState.get(draft.id);
		if (session) {
			const workspace =
				session.lastEditor === 'crag'
					? 'crags/editor'
					: session.lastEditor === '2d'
						? 'topos/2d/editor'
						: 'topos/3d/editor';
			goto(`${base}/${workspace}?draft=${encodeURIComponent(draft.id)}`);
		} else {
			brokenDraftId = draft.id;
		}
	}

	async function confirmDeleteDraft() {
		if (!draftPendingDelete) return;
		const id = draftPendingDelete.id;
		draftPendingDelete = null;
		if (brokenDraftId === id) brokenDraftId = null;
		await draftsState.delete(id);
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
		}
	];

	const workflows = [
		{
			id: 'captures',
			name: 'processing.captures_title',
			description: 'editor.captures_workspace_desc',
			icon: 'fa-camera',
			href: 'felslager/captures'
		},
		{
			id: 'reviews',
			name: 'editor.review_inbox',
			description: 'editor.review_inbox_desc',
			icon: 'fa-inbox',
			href: 'felslager/reviews'
		}
	];
</script>

<div class="h-screen overflow-y-auto bg-warm-white px-4 py-6 sm:px-6 md:py-10 custom-scrollbar">
	<div class="mx-auto w-full max-w-5xl">
		<header
			class="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-black/10 pb-5"
		>
			<div class="min-w-0">
				<h1 class="text-display-title mb-2">{$_('ui.felsstudio')}</h1>
				<p class="text-ui-label text-warm-gray-500">{$_('ui.select_environment')}</p>
			</div>
			<div class="flex flex-wrap items-center gap-3">
				<SessionInfo />
				<LanguageSwitcher />
			</div>
		</header>

		<section aria-label={$_('ui.select_environment')}>
			<div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
				{#each workspaces as ws}
					<button
						type="button"
						class="panel group flex h-full flex-col p-5 text-left transition-colors hover:border-creator-blue/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-creator-blue"
						onclick={() => handleSelect(ws.wizardRoute)}
					>
						<div class="mb-4 flex items-center justify-between">
							<div
								class="flex h-8 w-8 items-center justify-center rounded-sm {ws.color} text-sm text-white shadow-sm"
							>
								<i class="fa-solid {ws.icon}" aria-hidden="true"></i>
							</div>
							<i
								class="fa-solid fa-arrow-right text-xs text-warm-gray-300 transition-none group-hover:text-creator-blue"
								aria-hidden="true"
							></i>
						</div>

						<span class="text-micro-data text-warm-gray-400 mb-1">
							{$_(ws.label)}
						</span>
						<h2 class="text-section-title mb-2 leading-tight">{$_(ws.name)}</h2>
						<p class="text-body-text text-warm-gray-500 leading-relaxed">
							{$_(ws.description)}
						</p>
					</button>
				{/each}
			</div>
		</section>

		{#if authState.user}
			<section class="mt-8" aria-label={$_('editor.workflows')}>
				<p class="text-ui-label mb-3">{$_('editor.workflows')}</p>
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
					{#each workflows as workflow}
						<a
							href={`${base}/${workflow.href}`}
							class="panel group flex items-center gap-4 p-4 text-left transition-colors hover:border-creator-blue/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-creator-blue"
						>
							<div
								class="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-black/10 bg-warm-white text-warm-gray-600 transition-none group-hover:border-creator-blue/30 group-hover:bg-creator-blue/10 group-hover:text-creator-blue"
							>
								<i class="fa-solid {workflow.icon}" aria-hidden="true"></i>
							</div>
							<div class="min-w-0 flex-1">
								<h3
									class="text-body-text font-semibold text-near-black group-hover:text-creator-blue"
								>
									{$_(workflow.name)}
								</h3>
								<p class="text-micro-data text-warm-gray-500 mt-0.5 leading-snug">
									{$_(workflow.description)}
								</p>
							</div>
							<i
								class="fa-solid fa-chevron-right text-xs text-warm-gray-300 transition-colors group-hover:text-creator-blue"
								aria-hidden="true"
							></i>
						</a>
					{/each}
				</div>
			</section>
		{/if}

		{#if draftsState.drafts.length > 0}
			<section class="mt-10 border-t border-black/10 pt-8" aria-label={$_('ui.resume_sessions')}>
				<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
					<p class="text-ui-label text-warm-gray-500">{$_('ui.resume_sessions')}</p>
					<span class="text-micro-data text-warm-gray-400">
						{draftsState.drafts.length}
						{$_('ui.drafts_found')}
					</span>
				</div>
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
					{#each draftsState.drafts as draft (draft.id)}
						{@const meta = draftWorkspaceMeta(draft.lastEditor)}
						<div
							class="panel group cursor-pointer bg-white p-3.5 text-left transition-colors hover:border-creator-blue/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-creator-blue"
							role="button"
							tabindex="0"
							onclick={() => void openDraft(draft)}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									void openDraft(draft);
								}
							}}
						>
							<div class="mb-2.5 flex items-start justify-between gap-2">
								<div class="flex flex-wrap items-center gap-1.5">
									<span
										class={`inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-[10px] font-bold ${meta.badgeClass}`}
									>
										<span class={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`}></span>
										{meta.label}
									</span>
									{#if draft.reviewId}
										<span
											class="inline-flex items-center gap-1 rounded-sm bg-creator-blue/10 px-1.5 py-0.5 text-[10px] font-bold text-creator-blue"
										>
											<i class="fa-solid fa-inbox text-[9px]" aria-hidden="true"></i>
											{$_('editor.review_badge')}
										</span>
									{/if}
								</div>
								<button
									type="button"
									class="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-warm-gray-300 transition-none hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-creator-blue"
									onclick={(e) => {
										e.stopPropagation();
										draftPendingDelete = draft;
									}}
									title={$_('ui.delete_draft')}
									aria-label={$_('ui.delete_draft')}
								>
									<i class="fa-solid fa-xmark text-xs" aria-hidden="true"></i>
								</button>
							</div>
							<h3 class="text-body-text truncate font-semibold text-near-black">
								{draft.name || $_('ui.unnamed_topo')}
							</h3>
							<p class="text-micro-data text-warm-gray-400 mt-1">
								{$_('ui.modified')}
								{new Date(draft.updated).toLocaleString([], {
									dateStyle: 'short',
									timeStyle: 'short'
								})}
							</p>
							{#if brokenDraftId === draft.id}
								<div
									class="mt-2.5 flex items-center justify-between gap-2 rounded-sm border border-rose-200 bg-rose-50 px-2.5 py-2"
								>
									<p class="text-micro-data leading-tight text-rose-700">
										{$_('editor.session_data_lost_browser_storage_cleared')}
									</p>
									<button
										type="button"
										class="text-micro-data whitespace-nowrap text-rose-600 underline hover:text-rose-800"
										onclick={(e) => {
											e.stopPropagation();
											draftsState.delete(draft.id);
											brokenDraftId = null;
										}}
									>
										{$_('editor.remove')}
									</button>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</section>
		{/if}
	</div>
</div>

<ConfirmModal
	open={Boolean(draftPendingDelete)}
	title={$_('ui.delete_draft')}
	message={draftPendingDelete
		? `${$_('ui.delete_draft_confirm')} (${draftPendingDelete.name || $_('ui.unnamed_topo')})`
		: ''}
	confirmLabel={$_('ui.delete')}
	destructive
	onConfirm={confirmDeleteDraft}
	onCancel={() => (draftPendingDelete = null)}
/>
