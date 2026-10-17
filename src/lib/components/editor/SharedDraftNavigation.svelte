<script lang="ts">
	import { goto } from '$app/navigation';
	import { _ } from 'svelte-i18n';
	import { getDraftEditor } from './use-draft-editor.svelte';
	const draft = getDraftEditor();
	const destinations = [
		{ editor: 'crag', route: 'crags/editor', label: 'ui.crag_studio' },
		{ editor: '2d', route: 'topos/2d/editor', label: 'ui.2d_studio' },
		{ editor: '3d', route: 'topos/3d/editor', label: 'ui.3d_studio' }
	];
</script>

{#if draft}
	<nav aria-label={$_('draft.editors')} class="relative">
		<select
			aria-label={$_('draft.editors')}
			class="max-w-36 rounded-sm border border-black/15 bg-white px-2 py-1.5 text-ui-label text-near-black disabled:opacity-50"
			value={draft.mode}
			disabled={!draft.ready || draft.busy}
			onchange={(event) => {
				const destination = destinations.find((item) => item.editor === event.currentTarget.value);
				event.currentTarget.value = draft.mode;
				if (destination && destination.editor !== draft.mode)
					void goto(draft.href(destination.route));
			}}
		>
			{#each destinations as destination}
				<option value={destination.editor} disabled={draft.mode === destination.editor}>
					{$_(destination.label)}
				</option>
			{/each}
		</select>
		{#if draft.error}
			<p
				role="alert"
				class="mt-2 rounded-sm border border-rose-200 bg-white p-2 text-micro-data text-rose-600 shadow-panel"
			>
				{$_('draft.save_failed')}: {draft.error}
			</p>
		{/if}
	</nav>
{/if}
