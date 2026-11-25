import { describe, expect, it } from 'vitest';
import { createDraft } from '$lib/state/shared-draft';
import { summarizeReviewSubmission } from './review-submission-summary';

describe('summarizeReviewSubmission', () => {
	it('summarizes entries, routes, GPX tracks, photos, and 3D models cleanly', () => {
		const draft = createDraft('crag');
		draft.placed = true;
		draft.name = 'Roter Ofen';
		draft.workspace.path = 'europe/austria/lower-austria/wienerwald';
		draft.workspace.id = 'roter-ofen';
		draft.workspace.entry.properties.id = 'roter-ofen';
		draft.workspace.entry.properties.name = 'Roter Ofen';
		draft.workspace.entry.geometry = { type: 'Point', coordinates: [16.12, 48.04] };
		draft.workspace.topo = {
			routes: [
				{ id: 1, name: 'Sonnenriss', grade: '6a' },
				{ id: 2, name: 'Kante', grade: '6c' }
			],
			paths: {
				type: 'FeatureCollection',
				features: [
					{
						type: 'Feature',
						id: 'p1',
						geometry: {
							type: 'LineString',
							coordinates: [
								[16.1, 48.0],
								[16.12, 48.04]
							]
						},
						properties: {}
					}
				]
			}
		};
		draft.workspace.access = {
			type: 'FeatureCollection',
			version: 1,
			features: [
				{
					type: 'Feature',
					id: 'a1',
					geometry: {
						type: 'LineString',
						coordinates: [
							[16.1, 48.0],
							[16.12, 48.04]
						]
					},
					properties: { kind: 'approach' }
				}
			]
		};
		draft.workspace.pendingImages = [
			{ clientId: 'img-1', path: 'europe/austria/lower-austria/wienerwald/roter-ofen/img.png' }
		];
		draft.media[draft.workspace.clientId] = { background: new Blob(['bg']), crops: {} };
		draft.contexts[draft.workspace.clientId] = { glbBlob: new Blob(['glb']) };

		const actions = [
			{
				action: 'write',
				path: 'europe/austria/lower-austria/wienerwald/roter-ofen/roter-ofen.json'
			},
			{
				action: 'write',
				path: 'europe/austria/lower-austria/wienerwald/roter-ofen/roter-ofen-topo.json'
			}
		];

		const summary = summarizeReviewSubmission({
			draft,
			actions,
			autoFinalizedTrack: true
		});

		expect(summary).toMatchObject({
			draftName: 'Roter Ofen',
			entryPath: 'europe/austria/lower-austria/wienerwald/roter-ofen',
			entriesCount: 1,
			routesCount: 2,
			tracksCount: 2,
			imagesCount: 2,
			modelsCount: 1,
			canSubmit: true,
			autoFinalizedTrack: true
		});
		expect(summary.checks).toEqual([
			{
				id: 'track-auto-finalized',
				level: 'info',
				messageKey: 'editor.review_track_auto_finalized'
			}
		]);
	});

	it('blocks submission with a discard-track action when an active track step is incomplete', () => {
		const draft = createDraft('crag');
		draft.placed = true;
		draft.workspace.entry.properties.name = 'Roter Ofen';

		const summary = summarizeReviewSubmission({
			draft,
			actions: [{ action: 'write', path: 'new-crag/new-crag.json' }],
			trackBlockedMessage: 'Add a second point to finish the track.'
		});

		expect(summary.canSubmit).toBe(false);
		expect(summary.checks[0]).toEqual({
			id: 'active-track-blocked',
			level: 'error',
			rawMessage: 'Add a second point to finish the track.',
			action: 'discard-track'
		});
	});

	it('warns on unnamed entries and blocks when location is unplaced or hierarchy has errors', () => {
		const draft = createDraft('2d');
		draft.placed = false;

		const summary = summarizeReviewSubmission({
			draft,
			actions: [],
			hierarchyErrors: [{ key: 'new-crag', kind: 'crag', message: 'Duplicate entry ID' }]
		});

		expect(summary.canSubmit).toBe(false);
		expect(summary.checks.map((c) => c.id)).toEqual([
			'missing-location',
			'hierarchy-error-0',
			'unnamed-entry'
		]);
	});

	it('counts affected entry directories accurately when folder slugs contain dots', () => {
		const draft = createDraft('crag');
		draft.placed = true;
		draft.workspace.entry.properties.name = 'Roter Ofen';
		draft.workspace.entry.geometry = { type: 'Point', coordinates: [16.12, 48.04] };

		const summary = summarizeReviewSubmission({
			draft,
			actions: [
				{
					action: 'move',
					path: 'europe/austria/st.poelten/old-crag',
					destination: 'europe/austria/st.poelten/roter-ofen'
				},
				{
					action: 'write',
					path: 'europe/austria/st.poelten/roter-ofen/roter-ofen.json'
				},
				{
					action: 'delete',
					path: 'europe/austria/st.poelten/removed-sector'
				}
			]
		});

		expect(summary.entriesCount).toBe(2);
	});
});
