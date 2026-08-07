import { beforeEach, describe, expect, it, vi } from 'vitest';

const credentials = vi.hoisted(() => ({
	has: vi.fn(),
	set: vi.fn(),
	clear: vi.fn()
}));

vi.mock('$lib/api/felslager.js', () => ({
	hasCredentials: credentials.has,
	setCredentials: credentials.set,
	clearCredentials: credentials.clear
}));

import { authState } from './auth.svelte.js';

describe('authState', () => {
	beforeEach(() => {
		credentials.has.mockReset().mockReturnValue(false);
		credentials.set.mockReset();
		credentials.clear.mockReset();
		authState.showPrompt = false;
		authState.error = null;
		authState._pendingCallback = null;
	});

	it('allows authenticated actions without showing the prompt', () => {
		credentials.has.mockReturnValue(true);
		expect(authState.requireAuth()).toBe(true);
		expect(authState.showPrompt).toBe(false);
	});

	it('queues unauthenticated actions and retries them after login', () => {
		const callback = vi.fn();
		expect(authState.requireAuth(callback)).toBe(false);
		expect(authState.showPrompt).toBe(true);

		authState.login('alice', 'secret');
		expect(credentials.set).toHaveBeenCalledWith('alice', 'secret');
		expect(callback).toHaveBeenCalledOnce();
		expect(authState.showPrompt).toBe(false);
	});

	it('rejects incomplete credentials and clears a pending callback', () => {
		authState.requireAuth(vi.fn());
		authState.login('', 'secret');
		expect(credentials.clear).toHaveBeenCalledOnce();
		expect(authState.error).toBe('Username and password are required.');
		expect(authState.showPrompt).toBe(true);
	});

	it('dismisses and logs out by clearing all transient auth state', () => {
		authState.requireAuth(vi.fn());
		authState.dismiss();
		expect(authState.showPrompt).toBe(false);
		expect(authState.error).toBeNull();

		authState.login('alice', 'secret');
		authState.logout();
		expect(credentials.clear).toHaveBeenCalled();
		expect(authState._pendingCallback).toBeNull();
	});
});
