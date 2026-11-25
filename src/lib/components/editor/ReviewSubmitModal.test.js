import { fireEvent, render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import ReviewSubmitModal from './ReviewSubmitModal.svelte';

const basePreview = {
	draftName: 'Roter Ofen',
	entryPath: 'europe/austria/lower-austria/wienerwald/roter-ofen',
	entriesCount: 1,
	routesCount: 3,
	tracksCount: 2,
	imagesCount: 1,
	modelsCount: 0,
	actions: [
		{ action: 'write', path: 'europe/austria/lower-austria/wienerwald/roter-ofen/roter-ofen.json' },
		{
			action: 'write',
			path: 'europe/austria/lower-austria/wienerwald/roter-ofen/roter-ofen-topo.json'
		}
	],
	checks: [
		{
			id: 'track-auto-finalized',
			level: 'info',
			messageKey: 'editor.review_track_auto_finalized'
		}
	],
	canSubmit: true,
	autoFinalizedTrack: true
};

describe('ReviewSubmitModal', () => {
	it('displays change summary, auto-finalized GPX notice, and submits on confirm', async () => {
		const onConfirm = vi.fn();
		const onCancel = vi.fn();
		const view = render(ReviewSubmitModal, {
			props: {
				open: true,
				preview: basePreview,
				onConfirm,
				onCancel
			}
		});

		const dialog = view.getByRole('dialog');
		expect(dialog).toBeTruthy();
		expect(document.activeElement).toBe(dialog);
		expect(view.getByText('Roter Ofen')).toBeTruthy();
		expect(view.getByText('3')).toBeTruthy();
		expect(view.getByRole('status')).toBeTruthy();

		const submitButton = view.getByRole('button', { name: /Submit now|Jetzt einreichen/i });
		expect(submitButton).toBeEnabled();
		await fireEvent.click(submitButton);
		expect(onConfirm).toHaveBeenCalledOnce();
	});

	it('disables submission on blocked track and triggers 1-click discard recovery', async () => {
		const onDiscardTrack = vi.fn();
		const view = render(ReviewSubmitModal, {
			props: {
				open: true,
				preview: {
					...basePreview,
					canSubmit: false,
					checks: [
						{
							id: 'active-track-blocked',
							level: 'error',
							rawMessage: 'Add a second point to finish the track.',
							action: 'discard-track'
						}
					]
				},
				onConfirm: vi.fn(),
				onCancel: vi.fn(),
				onDiscardTrack
			}
		});

		expect(view.getByRole('button', { name: /Submit now|Jetzt einreichen/i })).toBeDisabled();
		await fireEvent.click(
			view.getByRole('button', { name: /Discard unfinished track|Unfertigen Weg verwerfen/i })
		);
		expect(onDiscardTrack).toHaveBeenCalledOnce();
	});

	it('renders a persistent confirmation state once submitted', async () => {
		const onCancel = vi.fn();
		const view = render(ReviewSubmitModal, {
			props: {
				open: true,
				submitted: true,
				preview: basePreview,
				onConfirm: vi.fn(),
				onCancel
			}
		});

		expect(view.getByRole('status').textContent).toMatch(
			/Submitted for review\.|Zur Prüfung eingereicht\./i
		);
		await fireEvent.click(
			view.getByRole('button', { name: /Continue editing|Weiter bearbeiten/i })
		);
		expect(onCancel).toHaveBeenCalledOnce();
	});
});
