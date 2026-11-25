<script lang="ts">
	import { base } from '$app/paths';
	import { _ } from 'svelte-i18n';
	import ReviewFileList from './ReviewFileList.svelte';
	import type { ReviewSubmissionPreview, SubmissionCheck } from './review-submission-summary';

	let {
		open = false,
		loading = false,
		submitting = false,
		submitted = false,
		preview = null,
		error = '',
		onConfirm,
		onCancel,
		onDiscardTrack
	}: {
		open?: boolean;
		loading?: boolean;
		submitting?: boolean;
		submitted?: boolean;
		preview?: ReviewSubmissionPreview | null;
		error?: string;
		onConfirm: () => void;
		onCancel: () => void;
		onDiscardTrack?: (() => void) | null;
	} = $props();

	function handleWindowKeydown(event: KeyboardEvent) {
		if (!open) return;
		if (event.key === 'Escape' && !submitting) {
			event.preventDefault();
			event.stopPropagation();
			onCancel();
		}
	}

	function stopModalKeys(node: HTMLElement) {
		const stop = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') event.stopPropagation();
		};
		node.addEventListener('keydown', stop);
		return { destroy: () => node.removeEventListener('keydown', stop) };
	}

	function portal(node: HTMLElement) {
		if (typeof document !== 'undefined') {
			document.body.appendChild(node);
			node.querySelector<HTMLElement>('[role="dialog"]')?.focus();
		}
		return {
			destroy() {
				node.remove();
			}
		};
	}

	function checkText(check: SubmissionCheck): string {
		if (check.messageKey) {
			return $_(check.messageKey, check.messageValues ? { values: check.messageValues } : undefined);
		}
		return check.rawMessage || '';
	}

	let mediaCount = $derived((preview?.imagesCount || 0) + (preview?.modelsCount || 0));
	let filesOpen = $state(false);

	$effect(() => {
		if (!open) filesOpen = false;
	});
</script>

<svelte:window onkeydown={handleWindowKeydown} />

{#if open}
	<div
		use:portal
		class="fixed inset-0 z-[200] flex items-center justify-center bg-black/35 p-3 font-sans text-[13px] leading-normal text-near-black sm:p-4"
		role="presentation"
		onclick={(event) => {
			if (event.target === event.currentTarget && !submitting) onCancel();
		}}
	>
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="review-submit-modal-title"
			tabindex="-1"
			use:stopModalKeys
			class="panel flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden bg-white shadow-modal focus:outline-none"
		>
			{#if submitted}
				<header class="flex items-start justify-between gap-3 border-b border-black/10 bg-warm-white/60 px-4 py-3">
					<div class="flex items-center gap-2.5">
						<span
							class="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-creator-blue/10 text-creator-blue"
						>
							<i class="fa-solid fa-circle-check text-base" aria-hidden="true"></i>
						</span>
						<div>
							<h2 id="review-submit-modal-title" class="text-sm font-bold text-near-black">
								{$_('editor.review_modal_submitted_title')}
							</h2>
							{#if preview?.draftName}
								<p class="text-micro-data text-warm-gray-500">{preview.draftName}</p>
							{/if}
						</div>
					</div>
					<button
						type="button"
						class="tool-btn h-7 w-7 shrink-0"
						aria-label={$_('editor.dismiss_review_message')}
						onclick={onCancel}
					>
						<i class="fa-solid fa-xmark" aria-hidden="true"></i>
					</button>
				</header>

				<div class="flex flex-col gap-3 overflow-y-auto p-4">
					<p
						role="status"
						class="flex items-start gap-2 rounded-sm border border-creator-blue/20 bg-creator-blue/5 p-3 text-xs font-medium text-near-black"
					>
						<i class="fa-solid fa-paper-plane mt-0.5 text-creator-blue" aria-hidden="true"></i>
						<span>{$_('editor.submitted_for_review')}</span>
					</p>
					<p class="text-xs leading-relaxed text-warm-gray-500">
						{$_('editor.review_modal_submitted_next_steps')}
					</p>
					{#if preview}
						<div class="flex flex-wrap gap-2 text-micro-data text-warm-gray-500">
							<span class="rounded-sm border border-black/10 bg-warm-white px-2 py-1">
								{$_('editor.file_action_count', { values: { count: preview.actions.length } })}
							</span>
							{#if preview.entryPath}
								<span
									class="max-w-full truncate rounded-sm border border-black/10 bg-warm-white px-2 py-1 font-mono"
								>
									{preview.entryPath}
								</span>
							{/if}
						</div>
					{/if}
				</div>

				<footer class="flex flex-wrap items-center justify-between gap-2 border-t border-black/10 bg-warm-white/60 px-4 py-3">
					<a
						class="inline-flex items-center gap-1.5 text-xs font-medium text-creator-blue hover:underline"
						href={`${base}/felslager/reviews`}
					>
						{$_('editor.review_inbox')}
						<i class="fa-solid fa-arrow-right text-[10px]" aria-hidden="true"></i>
					</a>
					<button
						type="button"
						class="btn-pill h-8 px-4 py-1 text-xs"
						onclick={onCancel}
					>
						{$_('editor.review_modal_continue_editing')}
					</button>
				</footer>
			{:else}
				<header class="flex items-start justify-between gap-3 border-b border-black/10 bg-warm-white/60 px-4 py-3">
					<div class="min-w-0">
						<h2 id="review-submit-modal-title" class="text-sm font-bold text-near-black">
							{$_('editor.review_modal_title')}
						</h2>
						{#if preview?.draftName || preview?.entryPath}
							<p class="mt-0.5 truncate text-micro-data text-warm-gray-500">
								{preview.draftName || $_('ui.unnamed_topo')}
								{#if preview.entryPath}
									<span class="mx-1 text-warm-gray-300">·</span>
									<span class="font-mono">{preview.entryPath}</span>
								{/if}
							</p>
						{/if}
					</div>
					<button
						type="button"
						class="tool-btn h-7 w-7 shrink-0"
						aria-label={$_('ui.cancel')}
						disabled={submitting}
						onclick={onCancel}
					>
						<i class="fa-solid fa-xmark" aria-hidden="true"></i>
					</button>
				</header>

				<div class="flex flex-col gap-3 overflow-y-auto p-4">
					{#if loading}
						<div class="flex items-center justify-center gap-2 py-8 text-xs text-warm-gray-500">
							<i class="fa-solid fa-circle-notch animate-spin text-creator-blue" aria-hidden="true"
							></i>
							<span>{$_('editor.review_modal_preparing')}</span>
						</div>
					{:else if preview}
						<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
							<div class="rounded-sm border border-black/10 bg-warm-white p-2.5">
								<p class="text-micro-data text-warm-gray-500">{$_('editor.review_summary_entries')}</p>
								<p class="mt-0.5 text-lg font-bold text-near-black">{preview.entriesCount}</p>
							</div>
							<div class="rounded-sm border border-black/10 bg-warm-white p-2.5">
								<p class="text-micro-data text-warm-gray-500">{$_('editor.review_summary_routes')}</p>
								<p class="mt-0.5 text-lg font-bold text-near-black">{preview.routesCount}</p>
							</div>
							<div class="rounded-sm border border-black/10 bg-warm-white p-2.5">
								<p class="text-micro-data text-warm-gray-500">{$_('editor.review_summary_tracks')}</p>
								<p class="mt-0.5 text-lg font-bold text-near-black">{preview.tracksCount}</p>
							</div>
							<div class="rounded-sm border border-black/10 bg-warm-white p-2.5">
								<p class="text-micro-data text-warm-gray-500">{$_('editor.review_summary_media')}</p>
								<p class="mt-0.5 text-lg font-bold text-near-black">{mediaCount}</p>
							</div>
						</div>

						{#if preview.checks.length > 0}
							<div class="flex flex-col gap-2">
								{#each preview.checks as check (check.id)}
									<div
										role={check.level === 'error' ? 'alert' : 'status'}
										class={`flex flex-col gap-2 rounded-sm border p-2.5 text-xs ${
											check.level === 'error'
												? 'border-rose-200 bg-rose-50 text-rose-700'
												: check.level === 'warning'
													? 'border-amber-200 bg-amber-50 text-amber-800'
													: 'border-creator-blue/20 bg-creator-blue/5 text-near-black'
										}`}
									>
										<div class="flex items-start gap-2">
											<i
												class={`fa-solid mt-0.5 shrink-0 ${
													check.level === 'error'
														? 'fa-circle-exclamation text-rose-600'
														: check.level === 'warning'
															? 'fa-triangle-exclamation text-amber-600'
															: 'fa-circle-info text-creator-blue'
												}`}
												aria-hidden="true"
											></i>
											<span class="min-w-0 flex-1 wrap-anywhere">{checkText(check)}</span>
										</div>
										{#if check.action === 'discard-track' && onDiscardTrack}
											<div class="flex flex-wrap items-center gap-2 pl-5">
												<button
													type="button"
													class="rounded-sm border border-rose-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50"
													onclick={onDiscardTrack}
												>
													{$_('editor.review_discard_incomplete_track')}
												</button>
												<button
													type="button"
													class="rounded-sm border border-black/15 bg-white px-2.5 py-1 text-[11px] font-medium text-near-black hover:bg-black/5"
													onclick={onCancel}
												>
													{$_('editor.review_back_to_editor')}
												</button>
											</div>
										{/if}
									</div>
								{/each}
							</div>
						{/if}

						{#if preview.actions.length > 0}
							<details
								class="rounded-sm border border-black/10 bg-warm-white/50"
								bind:open={filesOpen}
							>
								<summary
									class="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-warm-gray-500 hover:text-near-black"
								>
									{$_('editor.affected_files')} ({preview.actions.length})
								</summary>
								<div class="max-h-44 overflow-y-auto border-t border-black/10 bg-white px-3">
									<ReviewFileList actions={preview.actions} />
								</div>
							</details>
						{/if}

						{#if error}
							<p
								role="alert"
								class="rounded-sm border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700 wrap-anywhere"
							>
								{error}
							</p>
						{/if}

						<p class="text-micro-data leading-relaxed text-warm-gray-500">
							{$_('editor.review_modal_rights_note')}
						</p>
					{:else if error}
						<p
							role="alert"
							class="rounded-sm border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700 wrap-anywhere"
						>
							{error}
						</p>
					{/if}
				</div>

				<footer class="flex items-center justify-end gap-2 border-t border-black/10 bg-warm-white/60 px-4 py-3">
					<button
						type="button"
						class="rounded-sm border border-black/15 bg-white px-3 py-1.5 text-xs font-medium text-near-black hover:bg-black/5 disabled:opacity-40"
						disabled={submitting}
						onclick={onCancel}
					>
						{$_('ui.cancel')}
					</button>
					<button
						type="button"
						class="btn-pill h-8 gap-2 px-4 py-1 text-xs disabled:cursor-default disabled:opacity-40"
						disabled={loading || submitting || !preview?.canSubmit}
						onclick={onConfirm}
					>
						<i
							class={submitting ? 'fa-solid fa-circle-notch animate-spin' : 'fa-solid fa-paper-plane'}
							aria-hidden="true"
						></i>
						{submitting ? $_('editor.submitting') : $_('editor.review_modal_confirm_submit')}
					</button>
				</footer>
			{/if}
		</div>
	</div>
{/if}
