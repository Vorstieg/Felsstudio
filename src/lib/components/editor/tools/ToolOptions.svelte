<script>
	import { _ } from 'svelte-i18n';

	let {
		title,
		onClose = null,
		children
	} = $props();

	function run(event, callback) {
		event?.preventDefault?.();
		event?.stopPropagation?.();
		callback?.();
	}
</script>

<div
	class="pointer-events-auto fixed bottom-16 left-2 right-2 z-101 mx-auto w-auto max-w-md rounded border border-black/15 bg-white p-2 shadow-panel md:bottom-auto md:left-2 md:right-auto md:top-25 md:mx-0 md:w-80"
	style="padding-bottom: max(0.5rem, env(safe-area-inset-bottom));"
>
	<div class="flex items-center justify-between gap-2 border-b border-black/10 px-1 pb-2">
		<h2 class="min-w-0 truncate text-ui-label text-near-black">{title}</h2>
		{#if onClose}
			<button
				type="button"
				class="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-warm-gray-500 hover:bg-black/5"
				onclick={(event) => run(event, onClose)}
				title={$_('ui.close')}
				aria-label={$_('ui.close')}
			>
				<i class="fa-solid fa-xmark text-sm"></i>
			</button>
		{/if}
	</div>

	<div class="flex flex-col gap-3 px-1 py-3">
		{@render children?.()}
	</div>
</div>
