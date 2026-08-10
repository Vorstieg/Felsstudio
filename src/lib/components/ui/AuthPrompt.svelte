<script>
	import { authState } from '$lib/api/auth.svelte.js';
	import { _ } from 'svelte-i18n';

	let user = $state('');
	let pass = $state('');

	function handleSubmit(e) {
		e.preventDefault();
		authState.login(user, pass);
	}

	function handleDismiss() {
		authState.dismiss();
	}

	function handleKeydown(e) {
		if (e.key === 'Escape') handleDismiss();
	}
</script>

{#if authState.showPrompt}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="fixed inset-0 z-[9999] flex items-center justify-center"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		onkeydown={handleKeydown}
	>
		<!-- Backdrop -->
		<button
			type="button"
			class="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
			aria-label={$_('auth.cancel')}
			onclick={handleDismiss}
		></button>

		<!-- Modal -->
		<div class="auth-modal panel relative z-10 w-full max-w-sm mx-4 shadow-modal">
			<div class="p-4 border-b border-black/15">
				<h2 class="text-section-title">{$_('auth.title')}</h2>
				<p class="text-micro-data mt-1">{$_('auth.description')}</p>
			</div>

			<form class="p-4 flex flex-col gap-3" onsubmit={handleSubmit}>
				<div>
					<label class="label-studio" for="auth-user">{$_('auth.username')}</label>
					<input
						id="auth-user"
						type="text"
						class="input-studio w-full"
						bind:value={user}
						autocomplete="username"
						placeholder={$_('auth.username_placeholder')}
					/>
				</div>

				<div>
					<label class="label-studio" for="auth-pass">{$_('auth.password')}</label>
					<input
						id="auth-pass"
						type="password"
						class="input-studio w-full"
						bind:value={pass}
						autocomplete="current-password"
						placeholder="••••••••"
					/>
				</div>

				{#if authState.error}
					<div class="rounded-sm bg-rose-50 border border-rose-200 px-3 py-2">
						<p class="text-micro-data text-rose-600">{authState.error}</p>
					</div>
				{/if}

				<div class="flex gap-2 mt-1">
					<button type="submit" class="btn-primary flex-1">
						{$_('auth.login')}
					</button>
					<button
						type="button"
						class="flex-1 px-3 py-1.5 rounded-sm border border-black/15 text-[12px] font-medium text-near-black hover:bg-black/5 transition-none"
						onclick={handleDismiss}
					>
						{$_('auth.cancel')}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	.auth-modal {
		animation: auth-fade-in 0.15s ease-out;
	}

	@keyframes auth-fade-in {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
