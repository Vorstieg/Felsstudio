import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';

export type Identity = { id: string; name: string; email: string };
type AuthState = {
	user: Identity | null;
	showPrompt: boolean;
	error: string | null;
	busy: boolean;
	refresh(): Promise<void>;
	requireAuth(callback?: (() => void | Promise<void>) | null): boolean;
	login(email: string, password: string): Promise<void>;
	logout(): Promise<void>;
	dismiss(): void;
	handleRejection(status: number): void;
};
const AUTH_URL = (
	import.meta.env.VITE_FELSLAGER_URL || 'https://lager.felsverzeichnis.at/api/fs'
).replace(/\/fs\/?$/, '/auth');
const message = (key: string) => get(_)(`auth.${key}`);
let refreshGeneration = 0;
let pendingCallback: (() => void | Promise<void>) | null = null;

async function request<T>(path: string, body?: unknown): Promise<T> {
	const response = await fetch(`${AUTH_URL}/${path}`, {
		credentials: 'include',
		...(body === undefined
			? {}
			: {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body)
				})
	});
	const data = await response.json();
	if (!response.ok) throw new Error(data.message || message('network_error'));
	return data as T;
}

export const authState = $state<AuthState>({
	user: null,
	showPrompt: false,
	error: null,
	busy: false,
	async refresh() {
		const generation = ++refreshGeneration;
		try {
			const session = await request<{ user: Identity } | null>('get-session');
			if (generation !== refreshGeneration) return;
			this.user = session?.user ?? null;
			this.error = null;
		} catch {
			if (generation !== refreshGeneration) return;
			this.user = null;
			this.error = message('network_error');
		}
	},
	requireAuth(callback = null) {
		if (this.user) return true;
		pendingCallback = callback;
		this.error = null;
		this.showPrompt = true;
		return false;
	},
	async login(email, password) {
		if (this.busy) return;
		this.busy = true;
		this.error = null;
		try {
			await request('sign-in/email', { email, password });
			await this.refresh();
			if (!this.user) throw new Error(this.error || message('login_failed'));
			const callback = pendingCallback;
			this.dismiss();
			if (callback) await callback();
		} catch (error) {
			this.error = error instanceof Error ? error.message : message('login_failed');
		} finally {
			this.busy = false;
		}
	},
	async logout() {
		if (this.busy) return;
		this.busy = true;
		try {
			await request('sign-out', {});
			++refreshGeneration;
			this.user = null;
			this.dismiss();
		} catch (error) {
			this.error = error instanceof Error ? error.message : message('network_error');
		} finally {
			this.busy = false;
		}
	},
	dismiss() {
		this.showPrompt = false;
		this.error = null;
		pendingCallback = null;
	},
	handleRejection(status) {
		// A rejected mutation may have partially completed; never replay it after login.
		pendingCallback = null;
		if (status === 401) {
			++refreshGeneration;
			this.user = null;
			this.error = message('session_expired');
			this.showPrompt = true;
		} else if (status === 403) {
			this.error = message('save_forbidden');
		}
	}
});
