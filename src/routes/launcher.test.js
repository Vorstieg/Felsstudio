import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { locale } from 'svelte-i18n';

const mocks = vi.hoisted(() => ({
	goto: vi.fn(),
	loadDrafts: vi.fn(async () => {})
}));

vi.mock('$app/navigation', () => ({ goto: mocks.goto }));
vi.mock('$app/paths', () => ({ base: '' }));
vi.mock('$lib/state/drafts.svelte.ts', () => ({
	draftsState: {
		drafts: [],
		load: mocks.loadDrafts,
		get: vi.fn(),
		delete: vi.fn()
	}
}));

import { authState } from '$lib/api/auth.svelte.ts';
import LauncherPage from './+page.svelte';

beforeEach(() => {
	mocks.goto.mockReset();
	mocks.loadDrafts.mockClear();
	authState.user = null;
	locale.set('en');
});

afterEach(() => {
	cleanup();
	authState.user = null;
});

describe('launcher page', () => {
	it('keeps all four studios visible and hides Captures and Review Inbox when logged out', () => {
		render(LauncherPage);

		const primary = screen.getByRole('region', { name: 'Select Environment' });
		expect(within(primary).getByRole('button', { name: /Map Editor/i })).toBeInTheDocument();
		expect(within(primary).getByRole('button', { name: /3D Studio/i })).toBeInTheDocument();
		expect(within(primary).getByRole('button', { name: /Topo Studio/i })).toBeInTheDocument();
		expect(within(primary).getByRole('button', { name: /Felslager Studio/i })).toBeInTheDocument();

		expect(screen.queryByRole('region', { name: 'Workflows' })).not.toBeInTheDocument();
		expect(screen.queryByRole('link', { name: /Captures/i })).not.toBeInTheDocument();
		expect(screen.queryByRole('link', { name: /Review Inbox/i })).not.toBeInTheDocument();
	});

	it('shows Captures and Review Inbox in Workflows when logged in', async () => {
		render(LauncherPage);
		expect(screen.queryByRole('region', { name: 'Workflows' })).not.toBeInTheDocument();

		authState.user = { id: 'admin', name: 'Admin', email: 'admin@example.com' };
		await tick();

		const workflows = screen.getByRole('region', { name: 'Workflows' });
		expect(within(workflows).getByRole('link', { name: /Captures/i })).toHaveAttribute(
			'href',
			'/felslager/captures'
		);
		expect(within(workflows).getByRole('link', { name: /Review Inbox/i })).toHaveAttribute(
			'href',
			'/felslager/reviews'
		);
	});
});
