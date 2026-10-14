import { createCragTrackPersistence } from './create-crag-track-persistence.ts';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { addMessages, init } from 'svelte-i18n';
import en from '$lib/i18n/locales/en.json';
import CragTrackPanel from './CragTrackPanel.svelte';
import { useCragTrackEditor } from './use-crag-track-editor.svelte.ts';

const context = vi.hoisted(() => {
	URL.createObjectURL = () => 'blob:test';
	return { editor: null };
});
vi.mock('$lib/state/crag-controller-context.svelte.ts', () => ({
	getCragEditorTools: () => ({ trackEditor: context.editor })
}));

beforeEach(async () => {
	vi.stubGlobal(
		'ResizeObserver',
		class {
			observe() {}
			disconnect() {}
		}
	);
	addMessages('en', en);
	await init({ fallbackLocale: 'en', initialLocale: 'en' });
	const feature = {
		id: 'a',
		properties: { name: 'Trail', kind: 'approach' },
		geometry: {
			type: 'LineString',
			coordinates: [
				[0, 0],
				[1, 0],
				[2, 0],
				[3, 0]
			]
		}
	};
	let features = [
		feature,
		{
			id: 'b',
			properties: { name: 'Second trail', kind: 'approach' },
			geometry: {
				type: 'LineString',
				coordinates: [
					[4, 0],
					[5, 0]
				]
			}
		}
	];
	context.editor = useCragTrackEditor({
		persistence: createCragTrackPersistence({
			getWorkspaceAccess: () => ({ features }),
			replaceAccessFeatures: (next) => {
				features = next;
			}
		}),
		getMap: () => ({
			getLayer: () => ({}),
			queryRenderedFeatures: () => [{ properties: { kind: 'approach', accessFeatureId: 'b' } }]
		}),
		getActiveTool: () => 'track',
		setActiveTool: () => {}
	});
	context.editor.editTrack('a');
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('track options workflow', () => {
	it('shows trim actions for a single interior point and updates them for a range', async () => {
		render(CragTrackPanel);
		expect(screen.queryByRole('button', { name: 'Trim before point' })).not.toBeInTheDocument();
		context.editor.toggleTrackPointSelection(1);
		await tick();
		expect(screen.getByRole('button', { name: 'Trim before point' })).toBeEnabled();
		expect(screen.getByRole('button', { name: 'Trim after point' })).toBeEnabled();
		context.editor.toggleTrackPointSelection(2);
		await tick();
		expect(screen.queryByRole('button', { name: 'Trim before point' })).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Simplify selected ranges' })).toBeEnabled();
	});
	it('separates editing points from choosing how to extend the track', async () => {
		render(CragTrackPanel);
		expect(screen.queryByRole('button', { name: 'Straight lines' })).not.toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Extend track' }));
		expect(context.editor.trackDraftMode).toBe('routing');
		expect(screen.getByRole('button', { name: 'Follow paths' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Straight lines' }));
		expect(context.editor.trackDraftMode).toBe('editing');
		await fireEvent.click(screen.getByRole('button', { name: 'Edit points' }));
		expect(context.editor.trackDraftMode).toBe('select');
		expect(screen.queryByRole('button', { name: 'Straight lines' })).not.toBeInTheDocument();
	});
	it('starts Join from Track tools, previews a picked track and applies the edited result name', async () => {
		render(CragTrackPanel);
		await fireEvent.click(screen.getByText('Track tools'));
		await fireEvent.click(screen.getByRole('button', { name: 'Join tracks' }));
		expect(context.editor.operation.kind).toBe('join');
		expect(screen.queryByLabelText('Resulting track name')).not.toBeInTheDocument();
		context.editor.handleMapClick({ point: { x: 400, y: 0 } });
		await tick();
		expect(screen.getByText('Join with: Second trail')).toBeInTheDocument();
		await fireEvent.input(screen.getByLabelText('Resulting track name'), {
			target: { value: 'Joined trail' }
		});
		expect(context.editor.joinPreview.name).toBe('Joined trail');
		await fireEvent.click(screen.getByRole('button', { name: 'Join tracks' }));
		expect(context.editor.sessionActive).toBe(false);
	});
	it('cancels a join preview without discarding the current track edit', async () => {
		context.editor.startTrackJoin();
		context.editor.handleMapClick({ point: { x: 400, y: 0 } });
		render(CragTrackPanel);
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(context.editor.operation.kind).toBe('idle');
		expect(context.editor.joinPreview).toBeNull();
		expect(context.editor.sessionActive).toBe(true);
	});
	it('leaves the edit intact when the original options window is closed', async () => {
		render(CragTrackPanel);
		await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
		expect(context.editor.sessionActive).toBe(true);
	});
});
