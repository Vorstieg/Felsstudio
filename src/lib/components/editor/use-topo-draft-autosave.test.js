import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	save: vi.fn(),
	load: vi.fn(),
	getById: vi.fn(),
	getLatest: vi.fn()
}));

vi.mock('$lib/state/drafts.svelte.js', () => ({
	draftsState: mocks,
	isBlankTopoSession: (session) => !session?.topo?.routes?.length && !session?.glbBlob
}));

import AutosaveHarness from './AutosaveHarness.svelte';

describe('useTopoDraftAutosave', () => {
	beforeEach(() => {
		mocks.save.mockReset().mockResolvedValue('draft-1');
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
});
