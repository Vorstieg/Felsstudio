<script lang="ts">
	import { authState } from '$lib/api/auth.svelte.ts';
	import { _ } from 'svelte-i18n';

	let email = $state('');
	let password = $state('');

	function open(node: HTMLDialogElement) {
		node.showModal();
		node.querySelector('input')?.focus();
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		await authState.login(email, password);
		password = '';
	}
</script>

{#if authState.showPrompt}
	<dialog
		use:open
		class="auth-modal panel w-full max-w-sm p-0 shadow-modal"
		aria-labelledby="auth-title"
		oncancel={() => authState.dismiss()}
	>
		<div class="p-4 border-b border-black/15">
			<h2 id="auth-title" class="text-section-title">{$_('auth.title')}</h2>
			<p class="text-micro-data mt-1">{$_('auth.description')}</p>
		</div>

		<form class="p-4 flex flex-col gap-3" onsubmit={handleSubmit}>
			<div>
				<label class="label-studio" for="auth-email">{$_('auth.email')}</label>
				<input
					id="auth-email"
					type="email"
					class="input-studio w-full"
					bind:value={email}
					autocomplete="username"
					required
				/>
			</div>

			<div>
				<label class="label-studio" for="auth-password">{$_('auth.password')}</label>
				<input
					id="auth-password"
					type="password"
					class="input-studio w-full"
					bind:value={password}
					autocomplete="current-password"
					required
				/>
			</div>

			{#if authState.error}
				<p role="alert" class="text-micro-data text-rose-600">{authState.error}</p>
			{/if}

			<div class="flex gap-2 mt-1">
				<button type="submit" class="btn-primary flex-1" disabled={authState.busy}>
					{$_(authState.busy ? 'auth.working' : 'auth.login')}
				</button>
				<button
					type="button"
					class="flex-1 px-3 py-1.5 rounded-sm border border-black/15 text-[12px] font-medium text-near-black hover:bg-black/5 transition-none"
					onclick={() => authState.dismiss()}
				>
					{$_('auth.cancel')}
				</button>
			</div>
			<p class="text-micro-data">{$_('auth.local_notice')}</p>
		</form>
	</dialog>
{/if}

<style>
	.auth-modal {
		margin: auto;
	}
	.auth-modal::backdrop {
		background: rgb(0 0 0 / 30%);
		backdrop-filter: blur(2px);
	}
</style>
