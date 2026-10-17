import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
	save: vi.fn(),
	get: vi.fn(),
	load: vi.fn(),
	loadSource: vi.fn(),
	callback: null,
	goto: vi.fn()
}));
vi.mock('$lib/state/drafts.svelte', () => ({
	draftsState: { save: mocks.save, get: mocks.get, load: mocks.load, drafts: [] }
}));
vi.mock('$lib/assets/js/load-crag-editor-entry', () => ({ loadCragEditorEntry: mocks.loadSource }));
vi.mock('$app/navigation', () => ({
	beforeNavigate: (callback) => {
		mocks.callback = callback;
	},
	goto: mocks.goto
}));
vi.mock('$app/paths', () => ({ base: '' }));
import { createDraft, draftNode } from '$lib/state/shared-draft';
import AutosaveHarness from './AutosaveHarness.svelte';

beforeEach(() => {
	vi.clearAllMocks();
	mocks.save.mockResolvedValue(undefined);
	mocks.get.mockResolvedValue(null);
	mocks.load.mockResolvedValue(undefined);
	window.history.replaceState(null, '', '/');
});
const ready = async (view) => waitFor(() => expect(view.getByTestId('save')).toBeEnabled());
function navigate() {
	const cancel = vi.fn();
	mocks.callback({
		willUnload: false,
		to: { url: new URL('http://localhost/next') },
		type: 'link',
		cancel
	});
	return cancel;
}

describe('one draft lifecycle', () => {
	it.each(['2d', '3d', 'crag'])(
		'creates and flushes %s through the same save operation',
		async (mode) => {
			const view = render(AutosaveHarness, { props: { mode } });
			await ready(view);
			const id = view.getByTestId('draft-id').textContent;
			expect(id).toBeTruthy();
			expect(view.getByTestId('node-id').textContent).toBeTruthy();
			expect(new URL(window.location.href).searchParams.get('draft')).toBe(id);
			await fireEvent.click(view.getByTestId('save'));
			await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
			expect(mocks.save.mock.calls[1][0].id).toBe(id);
		}
	);
	it('restores an explicit draft without loading production or creating another record', async () => {
		const stored = createDraft('2d');
		draftNode(stored).topo = { routes: [], description: 'Saved' };
		mocks.get.mockResolvedValue(stored);
		window.history.replaceState(null, '', `/?draft=${stored.id}`);
		const view = render(AutosaveHarness, { props: { entryPath: 'country/wall' } });
		await ready(view);
		expect(view.getByLabelText('Description')).toHaveValue('Saved');
		expect(mocks.loadSource).not.toHaveBeenCalled();
		expect(mocks.save).not.toHaveBeenCalled();
	});
	it('loads a production workspace once before creating its local draft', async () => {
		const source = createDraft('crag');
		mocks.loadSource.mockResolvedValue({
			workspace: source.workspace,
			activeWorkspaceEntryPath: 'new-crag',
			activeMetadataTarget: 'new-crag'
		});
		const view = render(AutosaveHarness, { props: { entryPath: 'country/wall' } });
		await ready(view);
		expect(mocks.loadSource).toHaveBeenCalledWith('country/wall');
		expect(mocks.save).toHaveBeenCalledOnce();
	});
	it('persists the editor save snapshot, retaining fields the editor does not expose', async () => {
		const stored = createDraft('2d');
		draftNode(stored).topo = { routes: [], custom: { retained: true } };
		mocks.get.mockResolvedValue(stored);
		window.history.replaceState(null, '', `/?draft=${stored.id}`);
		const view = render(AutosaveHarness);
		await ready(view);
		await fireEvent.click(view.getByTestId('save'));
		await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
		expect(draftNode(mocks.save.mock.calls[0][0]).topo).toMatchObject({
			custom: { retained: true },
			routes: []
		});
	});
	it('builds the next editor URL from the current crag selection', async () => {
		const stored = createDraft('crag');
		const child = structuredClone(stored.workspace);
		child.clientId = 'selected-child';
		child.path = 'new-crag';
		child.entry.properties.id = 'child';
		stored.workspace.childEntries.push(child);
		mocks.get.mockResolvedValue(stored);
		window.history.replaceState(null, '', `/?draft=${stored.id}`);
		const view = render(AutosaveHarness, { props: { mode: 'crag' } });
		await ready(view);
		await fireEvent.click(view.getByTestId('select-child'));
		await fireEvent.click(view.getByTestId('switch'));
		expect(window.location.hash).toContain('node=selected-child');
	});
	it('waits for the draft commit before continuing navigation', async () => {
		const view = render(AutosaveHarness);
		await ready(view);
		let finish;
		mocks.save.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				})
		);
		expect(navigate()).toHaveBeenCalledOnce();
		expect(mocks.goto).not.toHaveBeenCalled();
		finish();
		await waitFor(() =>
			expect(mocks.goto).toHaveBeenCalledWith(new URL('http://localhost/next'), {
				replaceState: false
			})
		);
	});
	it('keeps unsaved input and blocks navigation when storage fails', async () => {
		const view = render(AutosaveHarness);
		await ready(view);
		await fireEvent.input(view.getByLabelText('Description'), {
			target: { value: 'Keep this edit' }
		});
		mocks.save.mockRejectedValueOnce(new Error('Storage full'));
		navigate();
		await waitFor(() => expect(view.getByRole('alert')).toHaveTextContent('Storage full'));
		expect(view.getByLabelText('Description')).toHaveValue('Keep this edit');
		expect(mocks.goto).not.toHaveBeenCalled();
	});
});
