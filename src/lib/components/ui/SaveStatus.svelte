<script>
	import { _ } from 'svelte-i18n';

	/**
	 * Inline save status indicator.
	 * States: 'idle' | 'saving' | 'success' | 'error'
	 */
	let { status = 'idle', errorMessage = '' } = $props();
</script>

{#if status !== 'idle'}
	<div
		class="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm save-status sm:h-auto sm:w-auto sm:gap-1.5 sm:px-2 sm:py-1 {status ===
			'saving' || status === 'success'
			? 'bg-black/5 text-warm-gray-400'
			: ''} {status === 'error' ? 'bg-rose-50 text-rose-600 border border-rose-200' : ''}"
		role="status"
		aria-live="polite"
		aria-label={status === 'saving'
			? $_('save.saving')
			: status === 'success'
				? $_('save.saved')
				: errorMessage || $_('save.failed')}
		title={status === 'error' ? errorMessage || $_('save.failed') : undefined}
	>
		{#if status === 'saving'}
			<i class="fa-solid fa-spinner fa-spin text-[9px]"></i>
			<span class="hidden text-[9px] font-bold uppercase tracking-tighter sm:inline"
				>{$_('save.saving')}</span
			>
		{:else if status === 'success'}
			<i class="fa-solid fa-floppy-disk text-[9px]"></i>
			<span class="hidden text-[9px] font-bold uppercase tracking-tighter sm:inline"
				>{$_('save.saved')}</span
			>
		{:else if status === 'error'}
			<i class="fa-solid fa-circle-exclamation text-[9px]"></i>
			<span
				class="hidden text-[9px] font-bold uppercase tracking-tighter sm:inline"
				title={errorMessage}
			>
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
