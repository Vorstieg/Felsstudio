<script module lang="ts">
	import { resize } from '$lib/assets/js/resize.ts';
</script>

<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';

	type Tab = { id: string; label: string; icon?: string; count?: number };
	type Props = {
		title?: string;
		subtitle?: string;
		tabs?: Tab[];
		activeTab?: string;
		onTabChange?: (_tab: string) => void;
		width?: string;
		shadow?: boolean;
		visualSuperseded?: boolean;
		footer?: Snippet;
		headerActions?: Snippet;
		children?: Snippet<[{ mobile: boolean }]>;
	};

	let {
		title = $_('editor.properties'),
		subtitle = '',
		tabs = [],
		activeTab = $bindable(''),
		onTabChange = (tab: string) => (activeTab = tab),
		width = '20rem',
		shadow = true,
		visualSuperseded = false,
		footer,
		headerActions,
		children
	}: Props = $props();

	// Resolve the initial layout from the browser width so desktop does not
	// briefly render the mobile bottom-sheet variant during hydration.
	let isDesktop = $state(typeof window !== 'undefined' && window.innerWidth > 1024);
	let useTwoColumnDesktopTabs = $derived(
		tabs.length > 3 || tabs.reduce((total, tab) => total + tab.label.length, 0) > 28
	);

	onMount(() => {
		const updateLayout = () => (isDesktop = window.innerWidth > 1024);
		updateLayout();
		window.addEventListener('resize', updateLayout);
		return () => window.removeEventListener('resize', updateLayout);
	});
</script>

{#snippet panelHeader(mobile = false)}
	{#if title || subtitle || headerActions}
		<div
			class={`flex shrink-0 items-center justify-between gap-2 ${
				mobile ? 'px-4 pb-2' : 'px-3 pb-2.5'
			}`}
		>
			<div class="min-w-0">
				{#if title}
					<h2 class="text-ui-label text-near-black truncate">{title}</h2>
				{/if}
				{#if subtitle}
					<p class="text-micro-data text-warm-gray-400 truncate">{subtitle}</p>
				{/if}
			</div>
			{#if headerActions}
				<div class="flex shrink-0 items-center gap-1">
					{@render headerActions()}
				</div>
			{/if}
		</div>
	{/if}
{/snippet}

{#snippet tabBar(mobile = false)}
	{#if tabs.length}
		<div
			class="mx-3 mb-2 shrink-0 gap-0.5 rounded-sm border border-black/10 bg-black/5 p-0.5 {!mobile &&
			useTwoColumnDesktopTabs
				? 'grid grid-cols-2'
				: 'flex'}"
		>
			{#each tabs as tab, index}
				<button
					type="button"
					class="flex min-w-0 items-center justify-center rounded-sm whitespace-nowrap transition-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-creator-blue {mobile ||
					useTwoColumnDesktopTabs
						? 'flex-1'
						: 'flex-auto'} {!mobile && useTwoColumnDesktopTabs && tabs.length === 3 && index === 0
						? 'col-span-2'
						: ''} {mobile
						? 'px-2 py-2.5 text-ui-label'
						: useTwoColumnDesktopTabs
							? 'px-2 py-1.5 text-ui-label'
							: tabs.length >= 3
								? 'px-1.5 py-1.5 text-[10px] font-bold tracking-[0.04em] uppercase'
								: 'px-2 py-1.5 text-ui-label'} {activeTab === tab.id
						? mobile
							? 'bg-creator-blue text-white'
							: 'bg-white text-near-black shadow-sm'
						: 'text-warm-gray-500 hover:bg-black/5'}"
					onclick={() => onTabChange(tab.id)}
					title={tab.label}
					aria-label={tab.label}
					aria-pressed={activeTab === tab.id}
				>
					{#if tab.icon}<i
							class="fa-solid {tab.icon} shrink-0 {mobile
								? ''
								: !useTwoColumnDesktopTabs && tabs.length >= 3
									? 'mr-1'
									: 'mr-1.5'}"
							aria-hidden="true"
						></i>{/if}
					{#if !mobile}<span class="truncate">{tab.label}</span>{/if}
					{#if tab.count !== undefined}
						<span
							class={`ml-1 shrink-0 text-micro-data ${
								activeTab === tab.id && mobile ? 'text-white/90' : 'text-warm-gray-500'
							}`}>{tab.count}</span
						>
					{/if}
				</button>
			{/each}
		</div>
	{/if}
{/snippet}

{#if isDesktop}
	<div class="fixed top-16 right-2 z-50 flex max-h-[calc(100vh-4.75rem)] flex-col" style:width>
		<div class="panel flex flex-1 flex-col overflow-hidden pt-3 {shadow ? 'shadow-panel' : ''}">
			{@render panelHeader(false)}
			{@render tabBar(false)}
			<div class="custom-scrollbar flex-1 overflow-y-auto bg-transparent p-3 pt-1">
				{@render children?.({ mobile: false })}
			</div>
		</div>
		{#if footer}
			<div class="panel mt-2 border-black/10 bg-white p-2 shadow-xs">
				{@render footer()}
			</div>
		{/if}
	</div>
{:else}
	<div class="details-mobile pointer-events-none fixed inset-0 z-[60]">
		<div
			use:resize
			class="pointer-events-auto fixed right-0 bottom-0 left-0 z-[60] flex flex-col overflow-hidden rounded-t-sm border-t border-black/10 bg-white shadow-panel {visualSuperseded
				? 'invisible'
				: ''}"
			role="dialog"
			aria-label={title}
		>
			<div class="grabber flex w-full shrink-0 justify-center py-2.5">
				<span class="h-1.5 w-12 rounded-sm bg-warm-gray-200"></span>
			</div>
			{@render panelHeader(true)}
			{@render tabBar(true)}
			<div
				class="custom-scrollbar flex-1 overflow-y-auto p-4 pt-1 pb-[max(1rem,env(safe-area-inset-bottom))]"
			>
				{@render children?.({ mobile: true })}
			</div>
			{#if footer}
				<div class="border-t border-black/10 bg-white p-2">{@render footer()}</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	/* SSR cannot know the viewport, so prevent its mobile fallback from
	   covering the desktop editor before hydration completes. */
	@media (min-width: 1025px) {
		.details-mobile {
			display: none;
		}
	}
</style>
