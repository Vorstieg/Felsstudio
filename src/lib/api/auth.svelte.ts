/**
 * Reactive auth state for lazy authentication.
 * The auth prompt only appears when a write operation is attempted without stored credentials.
 */
import { hasCredentials, setCredentials, clearCredentials } from '$lib/api/felslager.ts';

type AuthState = {
	showPrompt: boolean;
	error: string | null;
	_pendingCallback: (() => void) | null;
	requireAuth(onAuthenticated?: (() => void) | null): boolean;
	login(user: string, pass: string): void;
	dismiss(): void;
	logout(): void;
};

export const authState = $state<AuthState>({
	showPrompt: false,
	error: null,

	_pendingCallback: null,

	/**
	 * Check if credentials exist. If not, show the auth prompt.
	 * Returns true if authenticated, false if prompt was shown.
	 */
	requireAuth(onAuthenticated = null) {
		if (hasCredentials()) return true;
		this._pendingCallback = onAuthenticated;
		this.error = null;
		this.showPrompt = true;
		return false;
	},

	/**
	 * Called when user submits credentials from the prompt.
	 */
	login(user, pass) {
		if (!user || !pass) {
			clearCredentials();
			this.error = 'Username and password are required.';
			return;
		}
		setCredentials(user, pass);
		this.showPrompt = false;
		this.error = null;
		if (this._pendingCallback) {
			const cb = this._pendingCallback;
			this._pendingCallback = null;
			cb();
		}
	},

	/**
	 * Dismiss the auth prompt without logging in.
	 */
	dismiss() {
		this.showPrompt = false;
		this.error = null;
		this._pendingCallback = null;
	},

	/**
	 * Log out: clear stored credentials.
	 */
	logout() {
		clearCredentials();
		this.showPrompt = false;
		this.error = null;
		this._pendingCallback = null;
	}
});
