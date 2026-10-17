<script lang="ts">
	import { authState } from '$lib/api/auth.svelte.ts';
	import { _ } from 'svelte-i18n';
</script>

{#if authState.user}
	<div class="flex items-center gap-2 text-[12px]" role="group" aria-label={$_('auth.account')}>
		<span class="max-w-24 truncate md:max-w-40" title={authState.user.email}>
			{authState.user.name || authState.user.email}
		</span>
		<button
			type="button"
			class="text-warm-gray-500 hover:text-near-black disabled:opacity-40"
			disabled={authState.busy}
			onclick={() => void authState.logout()}>{$_('auth.logout')}</button
		>
		{#if authState.error && !authState.showPrompt}
			<span role="alert" class="text-rose-600">{authState.error}</span>
		{/if}
	</div>
{/if}
