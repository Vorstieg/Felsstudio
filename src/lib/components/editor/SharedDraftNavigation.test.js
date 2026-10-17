import { render, fireEvent } from '@testing-library/svelte';
import { beforeEach, expect, it, vi } from 'vitest';
import { init, addMessages } from 'svelte-i18n';
const mocks = vi.hoisted(() => ({ goto: vi.fn(), draft: undefined }));
const { goto } = mocks;
vi.mock('./use-draft-editor.svelte', () => ({ getDraftEditor: () => mocks.draft }));
vi.mock('$app/navigation', () => ({ goto: mocks.goto }));
import SharedDraftNavigation from './SharedDraftNavigation.svelte';
beforeEach(() => {
	goto.mockReset();
	addMessages('en', {
		draft: { editors: 'Draft editors', save_failed: 'Could not save draft' },
		ui: { crag_studio: 'Crag', '2d_studio': '2D', '3d_studio': '3D' }
	});
	init({ fallbackLocale: 'en', initialLocale: 'en' });
});
it('only renders controller state and routes editor selection through it', async () => {
	const draft = {
		mode: '2d',
		ready: true,
		busy: false,
		error: 'Storage full',
		href: (route) => `/${route}?draft=one&node=two`
	};
	mocks.draft = draft;
	const view = render(SharedDraftNavigation);
	expect(view.getByRole('combobox')).toHaveValue('2d');
	await fireEvent.change(view.getByRole('combobox'), { target: { value: '3d' } });
	expect(goto).toHaveBeenCalledWith('/topos/3d/editor?draft=one&node=two');
	expect(view.getByRole('alert')).toHaveTextContent('Storage full');
	expect(view.getByRole('option', { name: '2D', exact: true })).toBeDisabled();
	expect(view.getByRole('combobox')).toHaveValue('2d');
});
