<script lang="ts">
	import { goto } from '$app/navigation';
	import { _ } from 'svelte-i18n';
	import { getDraftEditor } from './use-draft-editor.svelte';

	let {
		variant = 'bar',
		onNavigate
	}: {
		variant?: 'bar' | 'menu';
		onNavigate?: () => void;
	} = $props();

	const draft = getDraftEditor();
	const destinations = [
		{
			editor: 'crag',
			route: 'crags/editor',
			label: 'editor.studio_tab_crag',
			title: 'ui.crag_studio',
			dotClass: 'bg-workspace-crag'
		},
		{
			editor: '2d',
			route: 'topos/2d/editor',
			label: 'editor.studio_tab_2d',
			title: 'ui.2d_studio',
			dotClass: 'bg-workspace-topo-2d'
		},
		{
			editor: '3d',
			route: 'topos/3d/editor',
			label: 'editor.studio_tab_3d',
			title: 'ui.3d_studio',
			dotClass: 'bg-workspace-topo-3d'
		}
	] as const;

	function selectEditor(destination: (typeof destinations)[number]) {
		if (!draft || !draft.ready || draft.busy || destination.editor === draft.mode) return;
		onNavigate?.();
		void goto(draft.href(destination.route));
	}
</script>

{#if draft}
	<nav aria-label={$_('draft.editors')} class="relative">
		<div
			class={variant === 'menu'
				? 'grid w-full grid-cols-3 gap-0.5 rounded-sm border border-black/10 bg-black/[0.04] p-0.5'
				: 'inline-flex items-center gap-0.5 rounded-sm border border-black/10 bg-black/[0.04] p-0.5'}
			role="group"
			aria-label={$_('draft.editors')}
		>
			{#each destinations as destination}
				{@const isActive = draft.mode === destination.editor}
				<button
					type="button"
					class={`flex h-7 items-center justify-center gap-1.5 rounded-sm px-2 text-[11px] font-semibold whitespace-nowrap transition-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-creator-blue disabled:cursor-default ${
						isActive
							? 'bg-white text-near-black shadow-xs'
							: 'text-warm-gray-500 hover:bg-white/60 hover:text-near-black disabled:opacity-40'
					}`}
					aria-pressed={isActive}
					aria-current={isActive ? 'page' : undefined}
					title={$_(destination.title)}
					disabled={!draft.ready || draft.busy || isActive}
					onclick={() => selectEditor(destination)}
				>
					<span class={`h-1.5 w-1.5 shrink-0 rounded-full ${destination.dotClass}`} aria-hidden="true"
					></span>
					<span>{$_(destination.label)}</span>
				</button>
			{/each}
		</div>
		{#if draft.error}
			<p
				role="alert"
				class={variant === 'menu'
					? 'mt-2 rounded-sm border border-rose-200 bg-white p-2 text-micro-data text-rose-600 shadow-panel'
					: 'absolute top-full right-0 z-50 mt-2 w-64 rounded-sm border border-rose-200 bg-white p-2 text-micro-data text-rose-600 shadow-panel'}
			>
				{$_('draft.save_failed')}: {draft.error}
			</p>
		{/if}
	</nav>
{/if}
