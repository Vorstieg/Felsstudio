<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { base } from '$app/paths';
	import ReviewFileList from '$lib/components/editor/ReviewFileList.svelte';
	import { goto } from '$app/navigation';
	import { authState } from '$lib/api/auth.svelte';
	import SessionInfo from '$lib/components/ui/SessionInfo.svelte';
	import { listReviews, downloadReview, deleteReview, type Review } from '$lib/api/reviews';
	import { openReviewPackage } from '$lib/assets/js/review-package';
	import { createDraftResources } from '$lib/state/shared-draft';
	import { draftsState } from '$lib/state/drafts.svelte';
	let reviews = $state<Review[]>([]);
	let busy = $state(false);
	let error = $state('');
	let selected = $state<Review | null>(null);
	let generation = 0;
	$effect(() => {
		const user = authState.user;
		const request = ++generation;
		reviews = [];
		selected = null;
		if (user) {
			void refresh(request);
		}
	});
	async function refresh(request = generation) {
		busy = true;
		error = '';
		try {
			const result = await listReviews();
			if (request === generation) reviews = result;
		} catch (cause) {
			if (request === generation) error = cause instanceof Error ? cause.message : String(cause);
		} finally {
			if (request === generation) busy = false;
		}
	}
	async function open(review: Review) {
		busy = true;
		error = '';
		const resources = createDraftResources();
		try {
			const draft = resources.restore(
				await openReviewPackage(await downloadReview(review.id), review.id)
			);
			await draftsState.save(draft);
			const route = (
				{ crag: 'crags/editor', '2d': 'topos/2d/editor', '3d': 'topos/3d/editor' } as const
			)[draft.lastEditor];
			await goto(`${base}/${route}?draft=${encodeURIComponent(draft.id)}`);
		} catch (cause) {
			error = cause instanceof Error ? cause.message : String(cause);
		} finally {
			resources.release();
			busy = false;
		}
	}
	async function remove(review: Review) {
		if (!window.confirm($_('editor.delete_review', { values: { name: review.name } }))) return;
		busy = true;
		error = '';
		try {
			await deleteReview(review.id);
			selected = null;
			await refresh();
		} catch (cause) {
			error = cause instanceof Error ? cause.message : String(cause);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>{$_('editor.review_inbox_felslager')}</title></svelte:head>
<main
	class="h-full overflow-auto bg-warm-white font-sans text-[13px] leading-normal text-near-black"
>
	<header class="border-b border-black/15 bg-white">
		<div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 p-4">
			<div class="flex flex-col gap-1">
				<p class="text-ui-label text-warm-gray-500">Felslager</p>
				<h1 class="text-section-title wrap-anywhere">{$_('editor.review_inbox')}</h1>
			</div>
			<SessionInfo />
		</div>
	</header>
	<div class="mx-auto flex max-w-6xl flex-col gap-4 p-4">
		{#if !authState.user}
			<section
				class="panel min-w-0 overflow-hidden flex min-h-40 flex-col items-center justify-center gap-3 p-4 text-center"
				aria-label={$_('editor.reviewer_sign_in')}
			>
				<span
					class="flex h-10 w-10 items-center justify-center rounded-sm border border-black/10 bg-warm-white text-lg text-warm-gray-500"
					><i class="fa-solid fa-inbox" aria-hidden="true"></i></span
				>
				<div class="flex flex-col gap-2">
					<h2 class="text-section-title wrap-anywhere">{$_('editor.ready_for_review')}</h2>
					<p class="text-warm-gray-500">
						{$_('editor.sign_in_to_inspect_and_publish_submissions')}
					</p>
				</div>
				<button
					class="btn-pill gap-2 whitespace-nowrap disabled:cursor-default disabled:opacity-40 focus-visible:outline-2! focus-visible:outline-offset-2! focus-visible:outline-creator-blue!"
					onclick={() => authState.requireAuth()}
					>{$_('editor.sign_in')}<i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button
				>
			</section>
		{:else}
			{#if error}<p
					role="alert"
					class="rounded-sm border border-rose-200 bg-rose-50 p-3 text-xs text-rose-600 wrap-anywhere"
				>
					{error}
				</p>{/if}
			<div class="grid items-start gap-4 md:grid-cols-2">
				<section
					class="panel min-w-0 overflow-hidden"
					aria-labelledby="review-submissions-title"
					aria-busy={busy}
				>
					<div
						class="flex flex-wrap items-center justify-between gap-2 border-b border-black/10 p-3"
					>
						<div class="flex items-center gap-2">
							<h2 id="review-submissions-title" class="text-ui-label">
								{$_('editor.submissions')}
							</h2>
						</div>
					</div>
					{#if busy && !reviews.length}
						<div class="flex min-h-40 flex-col items-center justify-center gap-3 p-4 text-center">
							<span
								class="flex h-10 w-10 items-center justify-center rounded-sm border border-black/10 bg-warm-white text-lg text-warm-gray-500"
								><i class="fa-solid fa-circle-notch animate-spin" aria-hidden="true"></i></span
							>
							<p role="status" class="text-warm-gray-500">{$_('editor.loading_submissions')}</p>
						</div>
					{:else if !reviews.length}
						<div class="flex min-h-40 flex-col items-center justify-center gap-3 p-4 text-center">
							<span
								class="flex h-10 w-10 items-center justify-center rounded-sm border border-black/10 bg-warm-white text-lg text-warm-gray-500"
								><i class="fa-solid fa-inbox" aria-hidden="true"></i></span
							>
							<div class="flex flex-col gap-2">
								<p class="font-semibold">{$_('editor.all_caught_up')}</p>
								<p class="text-warm-gray-500">{$_('editor.no_submissions_to_review_yet')}</p>
							</div>
						</div>
					{:else}
						<ul class="m-0 list-none! p-2!">
							{#each reviews as review}
								<li>
									<button
										class="flex w-full flex-col gap-2 rounded-sm border border-transparent p-3 text-left hover:bg-black/5 aria-pressed:border-black/15 aria-pressed:bg-black/5 focus-visible:outline-2! focus-visible:outline-offset-2! focus-visible:outline-creator-blue!"
										aria-label={review.name}
										aria-pressed={selected?.id === review.id}
										onclick={() => (selected = review)}
									>
										<span class="min-w-0 text-body-text wrap-anywhere">{review.name}</span>
										<span class="flex flex-wrap gap-x-4 gap-y-1 text-micro-data"
											><time datetime={review.created}
												>{new Date(review.created).toLocaleString()}</time
											><span
												>{$_('editor.file_action_count', {
													values: { count: review.actions.length }
												})}</span
											></span
										>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</section>
				<section class="panel min-w-0 overflow-hidden" aria-label={$_('editor.submission_details')}>
					{#if selected}
						<div
							class="flex flex-wrap items-center justify-between gap-2 border-b border-black/10 p-3"
						>
							<div class="flex min-w-0 flex-col gap-2">
								<p class="text-ui-label text-warm-gray-500">{$_('editor.submission')}</p>
								<h2 class="text-section-title wrap-anywhere">{selected.name}</h2>
							</div>
						</div>
						<div class="px-3 pb-3">
							<div class="flex flex-wrap gap-x-4 gap-y-2 py-3 text-micro-data">
								<time datetime={selected.created}
									>{new Date(selected.created).toLocaleString()}</time
								><span
									>{$_('editor.file_action_count', {
										values: { count: selected.actions.length }
									})}</span
								>
							</div>
							<h3 class="text-ui-label">{$_('editor.affected_files')}</h3>
							<ReviewFileList actions={selected.actions} />
						</div>
						<footer
							class="flex flex-wrap items-center gap-2 border-t border-black/10 bg-warm-white p-3"
						>
							<button
								class="btn-pill gap-2 whitespace-nowrap disabled:cursor-default disabled:opacity-40 focus-visible:outline-2! focus-visible:outline-offset-2! focus-visible:outline-creator-blue!"
								onclick={() => selected && open(selected)}
								disabled={busy}
								>{$_('editor.open_in_editor')}<i
									class="fa-solid fa-arrow-up-right-from-square"
									aria-hidden="true"
								></i></button
							>
							<button
								class="rounded-sm px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-40 focus-visible:outline-2! focus-visible:outline-offset-2! focus-visible:outline-creator-blue!"
								onclick={() => selected && remove(selected)}
								disabled={busy}>{$_('editor.delete')}</button
							>
						</footer>
					{:else}
						<div class="flex min-h-40 flex-col items-center justify-center gap-3 p-4 text-center">
							<span
								class="flex h-10 w-10 items-center justify-center rounded-sm border border-black/10 bg-warm-white text-lg text-warm-gray-500"
								><i class="fa-solid fa-file-lines" aria-hidden="true"></i></span
							>
							<div class="flex flex-col gap-2">
								<h2 class="text-section-title wrap-anywhere">{$_('editor.select_a_submission')}</h2>
								<p class="text-warm-gray-500">
									{$_('editor.inspect_its_files_then_open_a_separate_draft_in_the_editor')}
								</p>
							</div>
						</div>
					{/if}
				</section>
			</div>
		{/if}
	</div>
</main>
