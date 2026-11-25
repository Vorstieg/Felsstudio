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
		ui: { crag_studio: 'Map Editor', '2d_studio': 'Topo Studio', '3d_studio': '3D Studio' },
		editor: { studio_tab_crag: 'Map Editor', studio_tab_2d: 'Topo', studio_tab_3d: '3D Topo' }
	});
	init({ fallbackLocale: 'en', initialLocale: 'en' });
});
it('only renders controller state and routes editor selection through it', async () => {
	const onNavigate = vi.fn();
	const draft = {
		mode: '2d',
		ready: true,
		busy: false,
		error: 'Storage full',
		href: (route) => `/${route}?draft=one`
	};
	mocks.draft = draft;
	const view = render(SharedDraftNavigation, { onNavigate });
	const activeTab = view.getByRole('button', { name: 'Topo' });
	const targetTab = view.getByRole('button', { name: '3D Topo' });
	expect(activeTab).toBeDisabled();
	expect(activeTab).toHaveAttribute('aria-current', 'page');
	expect(targetTab).not.toBeDisabled();
	await fireEvent.click(targetTab);
	expect(onNavigate).toHaveBeenCalledOnce();
	expect(goto).toHaveBeenCalledWith('/topos/3d/editor?draft=one');
	expect(view.getByRole('alert')).toHaveTextContent('Storage full');
});
