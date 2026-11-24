<script lang="ts">
	import { _ } from 'svelte-i18n';

	type Props = {
		open: boolean;
		title: string;
		message?: string;
		confirmLabel?: string;
		cancelLabel?: string;
		destructive?: boolean;
		inputLabel?: string;
		inputValue?: string;
		onConfirm: (_value: string) => void | Promise<void>;
		onCancel: () => void;
	};

	let {
		open = false,
		title,
		message = '',
		confirmLabel = '',
		cancelLabel = '',
		destructive = false,
		inputLabel = '',
		inputValue = $bindable(''),
		onConfirm,
		onCancel
	}: Props = $props();

	let busy = $state(false);

	function mountDialog(node: HTMLDialogElement) {
		if (!node.open) node.showModal();
		const focusTarget = inputLabel
			? node.querySelector<HTMLElement>('input')
			: node.querySelector<HTMLElement>('button[data-primary]');
		focusTarget?.focus();
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		busy = true;
		try {
			await onConfirm(inputValue);
		} finally {
			busy = false;
		}
	}
</script>

{#if open}
	<dialog
		use:mountDialog
		class="confirm-modal panel w-[calc(100vw-2rem)] max-w-sm p-0 shadow-modal"
		aria-labelledby="confirm-modal-title"
		oncancel={(event) => {
			event.preventDefault();
			if (!busy) onCancel();
		}}
	>
		<div class="border-b border-black/10 p-4">
			<h2 id="confirm-modal-title" class="text-section-title">{title}</h2>
			{#if message}
				<p class="text-body-text text-warm-gray-500 mt-1.5">{message}</p>
			{/if}
		</div>

		<form class="flex flex-col gap-4 p-4" onsubmit={handleSubmit}>
			{#if inputLabel}
				<div>
					<label class="label-studio" for="confirm-modal-input">{inputLabel}</label>
					<input
						id="confirm-modal-input"
						type="text"
						class="input-studio w-full"
						bind:value={inputValue}
						required
					/>
				</div>
			{/if}

			<div class="flex justify-end gap-2">
				<button type="button" class="btn-secondary" disabled={busy} onclick={onCancel}>
					{cancelLabel || $_('auth.cancel')}
				</button>
				<button
					type="submit"
					data-primary
					disabled={busy || (Boolean(inputLabel) && !inputValue.trim())}
					class={destructive
						? 'flex cursor-pointer items-center justify-center rounded-sm bg-rose-600 px-3 py-1.5 text-[12px] font-medium text-white shadow-sm transition-none hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600'
						: 'btn-primary'}
				>
					{confirmLabel || $_('editor.confirm')}
				</button>
			</div>
		</form>
	</dialog>
{/if}

<style>
	.confirm-modal {
		margin: auto;
	}
	.confirm-modal::backdrop {
		background: rgb(0 0 0 / 30%);
		backdrop-filter: blur(2px);
	}
</style>
