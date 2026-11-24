<script lang="ts">
	import { _ } from 'svelte-i18n';
	import type { Snippet } from 'svelte';

	let {
		title,
		open = true,
		onClose = null,
		children
	}: {
		title: string;
		open?: boolean;
		onClose?: (() => void) | null;
		children?: Snippet;
	} = $props();

	let panel = $state<HTMLDivElement | undefined>();
	let trigger = $state<HTMLElement | null>();

	function close(event: MouseEvent) {
		event?.preventDefault?.();
		event?.stopPropagation?.();
		onClose?.();
		requestAnimationFrame(() => trigger?.focus?.());
	}

	function observeOptionsSurface(node: HTMLDivElement) {
		const updateHeight = () => {
			document.documentElement.style.setProperty(
				'--mobile-tool-options-height',
				`${node.offsetHeight}px`
			);
		};
		const observer = new ResizeObserver(updateHeight);
		observer.observe(node);
		updateHeight();
		return {
			destroy() {
				observer.disconnect();
				document.documentElement.style.removeProperty('--mobile-tool-options-height');
			}
		};
	}

	$effect(() => {
		if (open) {
			trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
			setTimeout(() => panel?.querySelector<HTMLElement>('button, input, select, textarea')?.focus());
		}
	});
</script>

{#if open}
	<div
		use:observeOptionsSurface
		bind:this={panel}
		role="dialog"
		aria-modal="false"
		aria-label={title}
		tabindex="-1"
		class="tool-options-surface pointer-events-auto fixed right-0 left-0 z-50 mx-auto flex w-full max-w-none flex-col overflow-hidden rounded-t-sm border border-x-0 border-b-0 border-black/15 bg-white p-2 shadow-panel md:right-auto md:bottom-auto md:left-2 md:mx-0 md:w-80 md:max-w-md md:rounded-sm md:border min-[1025px]:z-101"
		style="padding-bottom: max(0.5rem, env(safe-area-inset-bottom));"
	>
		<div class="flex shrink-0 items-center justify-between gap-2 border-b border-black/10 px-1 pb-2">
			<h2 class="text-ui-label min-w-0 truncate text-near-black">{title}</h2>
			{#if onClose}
				<button
					type="button"
					class="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-warm-gray-500 transition-none hover:bg-black/5 hover:text-near-black focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-creator-blue"
					onclick={close}
					title={$_('ui.close')}
					aria-label={$_('ui.close')}
				>
					<i class="fa-solid fa-xmark text-sm" aria-hidden="true"></i>
				</button>
			{/if}
		</div>

		<div class="custom-scrollbar flex min-h-0 flex-col gap-3 overflow-y-auto px-1 py-3">
			{@render children?.()}
		</div>
	</div>
{/if}

<style>
	.tool-options-surface {
		bottom: calc(
			var(--info-panel-height, 0px) + var(--mobile-tool-dock-height, 7.5rem) +
				max(0.75rem, env(safe-area-inset-bottom))
		);
		max-height: min(
			70dvh,
			max(
				0px,
				calc(
					100dvh - var(--info-panel-height, 0px) - var(--mobile-tool-dock-height, 7.5rem) -
						env(safe-area-inset-bottom) - 1rem
				)
			)
		);
		transition: var(--info-panel-transition, none);
		visibility: var(--mobile-toolbar-visibility, visible);
	}

	@media (min-width: 1025px) {
		.tool-options-surface {
			top: var(--tool-options-top, 4.25rem);
			bottom: auto;
			max-height: calc(100dvh - var(--tool-options-top, 4.25rem) - 0.75rem);
		}
	}
</style>
