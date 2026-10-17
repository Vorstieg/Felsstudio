<script lang="ts">
	import { base } from '$app/paths';
	import { _ } from 'svelte-i18n';
	import SharedDraftNavigation from './SharedDraftNavigation.svelte';
	import SaveStatus from '$lib/components/ui/SaveStatus.svelte';
	import { getDraftEditor } from './use-draft-editor.svelte';
	import { authState } from '$lib/api/auth.svelte';
	let {
		disabled = false,
		onSave,
		saveDisabled = false,
		saveStatus = 'idle',
		saveError = ''
	}: {
		disabled?: boolean;
		onSave?: () => void;
		saveDisabled?: boolean;
		saveStatus?: 'idle' | 'saving' | 'success' | 'error';
		saveError?: string;
	} = $props();
	let menu = $state<HTMLElement>();
	let menuButton = $state<HTMLButtonElement>();
	let menuOpen = $state(false);
	const closeMenu = () => menu?.hidePopover();
	function containMenuKeys(node: HTMLElement) {
		const stop = (event: KeyboardEvent) => event.stopPropagation();
		node.addEventListener('keydown', stop);
		return { destroy: () => node.removeEventListener('keydown', stop) };
	}
	const draft = getDraftEditor();
	let error = $state('');
	let message = $state('');
	$effect(() => {
		if (!message) return;
		const timeout = setTimeout(() => {
			message = '';
		}, 5000);
		return () => clearTimeout(timeout);
	});
	async function logout() {
		closeMenu();
		await authState.logout();
		if (authState.error) error = authState.error;
	}
	function showReviewPopover(node: HTMLElement) {
		node.showPopover();
	}
	async function run(publish = false) {
		if (!draft || draft.busy) return;
		if (publish && !authState.requireAuth()) return;
		error = '';
		message = '';
		try {
			if (publish) {
				const done = await draft.publishReview();
				if (done) message = 'Review published.';
			} else {
				const result = await draft.submitReview();
				if (result) {
					message = 'Submitted for review.';
				}
			}
		} catch (cause) {
			error = cause instanceof Error ? cause.message : String(cause);
		}
	}
</script>

{#if draft}
	<div
		class="relative flex flex-wrap items-center justify-end gap-2 font-sans text-xs leading-normal text-near-black"
		role="group"
		aria-label="Publishing actions"
	>
		{#if saveStatus === 'saving' || saveStatus === 'error'}<SaveStatus
				status={saveStatus}
				errorMessage={saveError}
			/>{/if}
		{#if draft.reviewId}
			<button
				class="btn-pill gap-2 whitespace-nowrap disabled:cursor-default disabled:opacity-40 focus-visible:outline-2! focus-visible:outline-offset-2! focus-visible:outline-creator-blue! h-7 px-3 py-1 text-[11px]"
				onclick={() => run(true)}
				disabled={!draft.ready || draft.busy || disabled}
			>
				<i
					class={draft.busy ? 'fa-solid fa-circle-notch animate-spin' : 'fa-solid fa-check'}
					aria-hidden="true"
				></i>
				{draft.busy
					? 'Working…'
					: draft.reviewProductionSaved
						? 'Retry review cleanup'
						: 'Publish review'}
			</button>
			{#if draft.reviewProductionSaved}<span class="sr-only" role="note"
					>Production files were saved. Retrying only removes the review and its archive.</span
				>{/if}
		{:else}
			<button
				class="btn-pill gap-2 whitespace-nowrap disabled:cursor-default disabled:opacity-40 focus-visible:outline-2! focus-visible:outline-offset-2! focus-visible:outline-creator-blue! h-7 px-3 py-1 text-[11px]"
				onclick={() => run()}
				disabled={!draft.ready || draft.busy || disabled}
				><i
					class={draft.busy ? 'fa-solid fa-circle-notch animate-spin' : 'fa-solid fa-paper-plane'}
					aria-hidden="true"
				></i>{draft.busy ? 'Submitting…' : 'Submit for review'}</button
			>
		{/if}
		<button
			type="button"
			class="tool-btn shrink-0 disabled:cursor-default disabled:opacity-40 focus-visible:outline-2! focus-visible:outline-offset-2! focus-visible:outline-creator-blue! h-7 w-7"
			aria-label="More editor actions"
			aria-expanded={menuOpen}
			popovertarget="editor-actions-menu"
			bind:this={menuButton}><i class="fa-solid fa-ellipsis" aria-hidden="true"></i></button
		>
		<section
			id="editor-actions-menu"
			class="panel fixed inset-auto top-14 right-2 m-0 w-68 max-w-[calc(100vw-1rem)] max-h-[calc(100dvh-5rem)] overflow-auto"
			aria-label="Editor actions"
			popover="auto"
			bind:this={menu}
			use:containMenuKeys
			ontoggle={(event) => {
				menuOpen = event.newState === 'open';
				if (menuOpen && menu && menuButton) {
					const bottom = menuButton.getBoundingClientRect().bottom;
					menu.style.top = `${bottom + 8}px`;
					menu.style.maxHeight = `${window.innerHeight - bottom - 24}px`;
					menu.querySelector<HTMLElement>('select')?.focus();
				}
			}}
		>
			<div class="p-2 not-first:border-t not-first:border-black/10">
				<SharedDraftNavigation />
			</div>
			<div class="p-2 not-first:border-t not-first:border-black/10">
				<a
					class="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left text-xs text-near-black hover:bg-black/5 focus-visible:outline-2! focus-visible:-outline-offset-2! focus-visible:outline-creator-blue! disabled:cursor-default disabled:opacity-40 [&>i]:w-4 [&>i]:text-center [&>i]:text-warm-gray-500"
					href={`${base}/felslager/reviews`}
					><i class="fa-solid fa-inbox" aria-hidden="true"></i>Review inbox</a
				>
				{#if !draft.reviewId && onSave}
					<button
						class="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left text-xs text-near-black hover:bg-black/5 focus-visible:outline-2! focus-visible:-outline-offset-2! focus-visible:outline-creator-blue! disabled:cursor-default disabled:opacity-40 [&>i]:w-4 [&>i]:text-center [&>i]:text-warm-gray-500"
						onclick={() => {
							closeMenu();
							onSave?.();
						}}
						disabled={!draft.ready || draft.busy || saveDisabled}
						><i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i>Publish directly to server</button
					>
				{/if}
			</div>
			<div class="p-2 not-first:border-t not-first:border-black/10">
				{#if authState.user}
					<div class="px-3 py-2 wrap-anywhere">
						<p class="text-ui-label">{authState.user.name || authState.user.email}</p>
						<p class="text-micro-data">{authState.user.email}</p>
					</div>
					<button
						class="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left text-xs text-near-black hover:bg-black/5 focus-visible:outline-2! focus-visible:-outline-offset-2! focus-visible:outline-creator-blue! disabled:cursor-default disabled:opacity-40 [&>i]:w-4 [&>i]:text-center [&>i]:text-warm-gray-500"
						onclick={logout}
						disabled={authState.busy}
						><i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i>{$_(
							'auth.logout'
						)}</button
					>
				{:else}
					<button
						class="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left text-xs text-near-black hover:bg-black/5 focus-visible:outline-2! focus-visible:-outline-offset-2! focus-visible:outline-creator-blue! disabled:cursor-default disabled:opacity-40 [&>i]:w-4 [&>i]:text-center [&>i]:text-warm-gray-500"
						onclick={() => {
							closeMenu();
							authState.requireAuth();
						}}
						><i class="fa-solid fa-arrow-right-to-bracket" aria-hidden="true"></i>{$_(
							'auth.login'
						)}</button
					>
				{/if}
			</div>
		</section>
		{#if error || message}
			<section
				class="panel fixed inset-auto top-16 right-2 z-60 m-0 w-90 max-w-[calc(100vw-1rem)] max-h-[calc(100dvh-5rem)] overflow-auto"
				aria-label="Review update"
				popover="auto"
				use:showReviewPopover
				ontoggle={(event) => {
					if (event.newState === 'closed') {
						error = '';
						message = '';
					}
				}}
			>
				<header class="flex items-center justify-between gap-3 border-b border-black/10 px-3 py-1">
					<h2 class="text-ui-label">Review update</h2>
					<button
						class="tool-btn shrink-0 disabled:cursor-default disabled:opacity-40 focus-visible:outline-2! focus-visible:outline-offset-2! focus-visible:outline-creator-blue! h-7 w-7"
						aria-label="Dismiss review message"
						onclick={() => {
							error = '';
							message = '';
						}}><i class="fa-solid fa-xmark" aria-hidden="true"></i></button
					>
				</header>
				<div class="flex flex-col gap-3 p-3">
					{#if error}<p
							role="alert"
							class="rounded-sm border border-rose-200 bg-rose-50 p-3 text-xs text-rose-600 wrap-anywhere"
						>
							{error}
						</p>{/if}
					{#if message}<p role="status" class="flex items-start gap-2">
							<i class="fa-solid fa-circle-check mt-1 text-creator-blue" aria-hidden="true"
							></i><span>{message}</span>
						</p>{/if}
				</div>
				<footer class="flex items-center justify-between gap-2 border-t border-black/10 p-3">
					<a
						class="text-xs font-medium text-creator-blue hover:underline focus-visible:outline-2! focus-visible:outline-offset-2! focus-visible:outline-creator-blue!"
						href={`${base}/felslager/reviews`}>Review inbox</a
					><i class="fa-solid fa-arrow-right text-creator-blue" aria-hidden="true"></i>
				</footer>
			</section>
		{/if}
	</div>
{/if}
