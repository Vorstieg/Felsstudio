import { beforeEach, describe, expect, it, vi } from 'vitest';
import { init } from 'svelte-i18n';
import { authState } from './auth.svelte.ts';

init({ initialLocale: 'en', fallbackLocale: 'en' });
const authUrl = (
	import.meta.env.VITE_FELSLAGER_URL || 'https://lager.felsverzeichnis.at/api/fs'
).replace(/\/fs\/?$/, '/auth');
const user = { id: '1', name: 'Editor', email: 'editor@example.test' };
const response = (data, ok = true) => ({ ok, json: async () => data });
const session = () => response({ user, session: { id: 'session' } });

describe('authState', () => {
	beforeEach(() => {
		authState.dismiss();
		authState.user = null;
		authState.busy = false;
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(session()));
	});

	it('validates the server session before resuming a queued save', async () => {
		const callback = vi.fn();
		expect(authState.requireAuth(callback)).toBe(false);
		await authState.login(user.email, 'long-password');
		expect(fetch).toHaveBeenNthCalledWith(1, `${authUrl}/sign-in/email`, {
			credentials: 'include',
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email: user.email, password: 'long-password' })
		});
		expect(fetch).toHaveBeenNthCalledWith(2, `${authUrl}/get-session`, { credentials: 'include' });
		expect(callback).toHaveBeenCalledOnce();
		expect(authState.requireAuth()).toBe(true);
	});

	it('does not resume saves after invalid login or a missing session', async () => {
		const callback = vi.fn();
		authState.requireAuth(callback);
		fetch.mockResolvedValueOnce(response({ message: 'Invalid password' }, false));
		await authState.login(user.email, 'wrong');
		expect(callback).not.toHaveBeenCalled();
		expect(authState.error).toBe('Invalid password');
		fetch.mockResolvedValueOnce(response({ user })).mockResolvedValueOnce(response(null));
		await authState.login(user.email, 'long-password');
		expect(callback).not.toHaveBeenCalled();
		expect(authState.showPrompt).toBe(true);
	});

	it.each([401, 403])('never replays a partial save after a %s rejection', async (status) => {
		const callback = vi.fn();
		authState.requireAuth(callback);
		authState.handleRejection(status);
		await authState.login(user.email, 'long-password');
		expect(callback).not.toHaveBeenCalled();
	});

	it('preserves a forbidden session without prompting for another login', async () => {
		await authState.refresh();
		authState.handleRejection(403);
		expect(authState.user.id).toBe('1');
		expect(authState.showPrompt).toBe(false);
		expect(authState.error).toBeTruthy();
	});

	it('preserves identity if logout fails and clears it after successful logout', async () => {
		await authState.refresh();
		fetch.mockRejectedValueOnce(new Error('Offline'));
		await authState.logout();
		expect(authState.user.id).toBe('1');
		await authState.logout();
		expect(fetch).toHaveBeenLastCalledWith(`${authUrl}/sign-out`, {
			credentials: 'include',
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: '{}'
		});
		expect(authState.user).toBeNull();
	});

	it('ignores a stale refresh after a server session rejection', async () => {
		let resolve;
		fetch.mockReturnValue(
			new Promise((done) => {
				resolve = done;
			})
		);
		const refreshing = authState.refresh();
		authState.handleRejection(401);
		resolve(session());
		await refreshing;
		expect(authState.user).toBeNull();
	});
});
