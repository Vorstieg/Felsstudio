<script>
	import { _ } from 'svelte-i18n';

	/**
	 * Inline save status indicator.
	 * States: 'idle' | 'saving' | 'success' | 'error'
	 */
	let { status = 'idle', errorMessage = '' } = $props();
</script>

{#if status !== 'idle'}
	<div class="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-sm save-status {status === 'saving' || status === 'success' ? 'bg-black/5 text-warm-gray-400' : ''} {status === 'error' ? 'bg-rose-50 text-rose-600 border border-rose-200' : ''}">
		{#if status === 'saving'}
			<i class="fa-solid fa-spinner fa-spin text-[9px]"></i>
			<span class="text-[9px] font-bold uppercase tracking-tighter">{$_('save.saving')}</span>
		{:else if status === 'success'}
			<i class="fa-solid fa-cloud-check text-[9px]"></i>
			<span class="text-[9px] font-bold uppercase tracking-tighter">{$_('save.saved')}</span>
		{:else if status === 'error'}
			<i class="fa-solid fa-circle-exclamation text-[9px]"></i>
			<span class="text-[9px] font-bold uppercase tracking-tighter" title={errorMessage}>
				{errorMessage || $_('save.failed')}
			</span>
		{/if}
	</div>
{/if}

<style>
	.save-status {
		animation: save-fade-in 0.15s ease-out;
	}
	@keyframes save-fade-in {
		from { opacity: 0; }
		to { opacity: 1; }
	}
</style>
