<script lang="ts">
	import type { ReviewAction } from '$lib/assets/js/review-package';
	let { actions }: { actions: ReviewAction[] } = $props();
</script>

{#if actions.length}
	<ul class="m-0 list-none! divide-y divide-black/10 p-0!" aria-label="Affected files">
		{#each actions as action}
			<li class="grid grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-3 py-3">
				<span class="text-ui-label pt-0.5">{action.action}</span>
				<div class="min-w-0 text-xs wrap-anywhere">
					<span>{action.path}</span>
					{#if action.destination}
						<div class="mt-1 flex items-baseline gap-2 text-warm-gray-500">
							<i class="fa-solid fa-arrow-right" aria-hidden="true"></i><span
								>{action.destination}</span
							>
						</div>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
{:else}
	<p class="text-warm-gray-500">No pending file changes.</p>
{/if}
