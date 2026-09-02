import { render, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	save: vi.fn(),
	load: vi.fn(),
	getById: vi.fn(),
	getLatest: vi.fn(),
	getLatestForSource: vi.fn()
}));

vi.mock('$lib/state/drafts.svelte.js', () => ({
	draftsState: mocks,
	isBlankTopoSession: (session) => !session?.topo?.routes?.length && !session?.glbBlob
}));

import AutosaveHarness from './AutosaveHarness.svelte';

describe('useTopoDraftAutosave', () => {
	beforeEach(() => {
		mocks.save.mockReset().mockResolvedValue('draft-1');
		mocks.load.mockReset();
		mocks.getById.mockReset().mockResolvedValue(null);
		mocks.getLatest.mockReset().mockResolvedValue(null);
		mocks.getLatestForSource.mockReset().mockResolvedValue(null);
		window.history.replaceState(null, '', '/');
	});

	it('persists non-blank sessions and updates draft metadata', async () => {
		const view = render(AutosaveHarness);
		await view.getByTestId('save').click();
		await tick();

		expect(mocks.save).toHaveBeenCalledWith(
			expect.objectContaining({ routes: [{ id: 'route-1' }] }),
			null,
			{ selectedRouteId: 'route-1' }
		);
		expect(view.getByTestId('draft-id')).toHaveTextContent('draft-1');
		expect(view.getByTestId('last-saved')).not.toHaveTextContent('');
	});

	it('does not save a blank session', async () => {
		const view = render(AutosaveHarness, { props: { blank: true } });
		await view.getByTestId('save').click();
		await tick();

		expect(mocks.save).not.toHaveBeenCalled();
	});

	it('loads an explicit draft instead of loading from the entry path', async () => {
		const loadEntrySession = vi.fn();
		mocks.getById.mockResolvedValue({
			topo: { editorMode: '2d', routes: [{ id: 'draft-route' }] }
		});

		const view = render(AutosaveHarness, {
			props: { draftId: 'draft-from-url', entryPath: 'area/crag', loadEntrySession }
		});
		await tick();

		await waitFor(() => expect(mocks.getById).toHaveBeenCalledWith('draft-from-url'));
		expect(loadEntrySession).not.toHaveBeenCalled();
		await waitFor(() => expect(view.getByTestId('draft-id')).toHaveTextContent('draft-from-url'));
	});

	it('loads from the entry path when no explicit draft is requested', async () => {
		const loadEntrySession = vi.fn();
		mocks.getLatestForSource.mockResolvedValue({
			id: 'matching-draft',
			session: { topo: { editorMode: '2d', routes: [{ id: 'source-draft-route' }] } }
		});

		render(AutosaveHarness, {
			props: {
				entryPath: 'area/crag',
				loadEntrySession
			}
		});
		await tick();

		await waitFor(() => expect(loadEntrySession).toHaveBeenCalledWith('area/crag'));
		expect(mocks.getLatestForSource).not.toHaveBeenCalled();
	});

	it('loads from the entry path when no matching source draft exists', async () => {
		const loadEntrySession = vi.fn();
		render(AutosaveHarness, { props: { entryPath: 'area/crag', loadEntrySession } });
		await tick();

		await waitFor(() => expect(loadEntrySession).toHaveBeenCalledWith('area/crag'));
	});

	it('immediately creates a URL draft after loading an entry path, even while blank', async () => {
		const loadEntrySession = vi.fn();
		const view = render(AutosaveHarness, {
			props: { blank: true, entryPath: 'area/crag', loadEntrySession }
		});
		await tick();

		await waitFor(() => expect(mocks.save).toHaveBeenCalled());
		expect(view.getByTestId('draft-id')).toHaveTextContent('draft-1');
		expect(new URL(window.location.href).searchParams.get('draft')).toBe('draft-1');
	});
});
