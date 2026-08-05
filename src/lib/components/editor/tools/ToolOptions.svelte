<script>
	import { _ } from 'svelte-i18n';
	import { onMount } from 'svelte';

	let {
		title,
		open = true,
		onClose = null,
		children
	} = $props();

	let panel = $state();
	let trigger = $state();

	onMount(() => {
		const handleKeyDown = (event) => {
			if (event.key === 'Escape' && open) {
				close(event);
			}
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	});

	function close(event) {
		event?.preventDefault?.();
		event?.stopPropagation?.();
		onClose?.();
		requestAnimationFrame(() => trigger?.focus?.());
	}

	function observeOptionsSurface(node) {
		const updateHeight = () => {
			document.documentElement.style.setProperty('--mobile-tool-options-height', `${node.offsetHeight}px`);
		};
		const observer = new ResizeObserver(updateHeight);
		observer.observe(node);
		updateHeight();
		return () => {
			observer.disconnect();
			document.documentElement.style.removeProperty('--mobile-tool-options-height');
		};
	}

	$effect(() => {
		if (open) {
			trigger = document.activeElement;
			setTimeout(() => panel?.querySelector('button, input, select, textarea')?.focus());
		}
	});

</script>

{#if open}
	<div use:observeOptionsSurface bind:this={panel} role="dialog" aria-modal="false" aria-label={title} tabindex="-1"
		class="tool-options-surface pointer-events-auto fixed left-0 right-0 z-101 mx-auto flex w-full max-w-none flex-col overflow-hidden rounded-t-lg border-x-0 border-b-0 border-black/15 bg-white p-2 shadow-panel md:bottom-auto md:left-2 md:right-auto md:top-[4.5rem] md:mx-0 md:w-80 md:max-w-md md:rounded md:border"
		style="padding-bottom: max(0.5rem, env(safe-area-inset-bottom));"
	>
	<div class="flex shrink-0 items-center justify-between gap-2 border-b border-black/10 px-1 pb-2">
		<h2 class="min-w-0 truncate text-ui-label text-near-black">{title}</h2>
		{#if onClose}
			<button
				type="button"
				class="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-warm-gray-500 hover:bg-black/5"
				onclick={close}
				title={$_('ui.close')}
				aria-label={$_('ui.close')}
			>
				<i class="fa-solid fa-xmark text-sm"></i>
			</button>
		{/if}
	</div>

	<div class="flex min-h-0 flex-col gap-3 overflow-y-auto px-1 py-3 custom-scrollbar">
		{@render children?.()}
	</div>
</div>
{/if}

<style>
	.tool-options-surface {
		bottom: calc(var(--mobile-tool-dock-height, 7.5rem) + max(0.75rem, env(safe-area-inset-bottom)));
		max-height: min(
			70dvh,
			calc(100dvh - var(--mobile-tool-dock-height, 7.5rem) - env(safe-area-inset-bottom) - 1rem)
		);
	}

	@media (min-width: 1025px) {
		.tool-options-surface {
			bottom: auto;
			max-height: calc(100dvh - 5rem);
		}
	}

</style>
