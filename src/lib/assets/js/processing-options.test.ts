import { expect, it } from 'vitest';
import metadata from '../../../../tests/fixtures/processing-options.json';
import type { ProcessingControls } from '$lib/api/processing';
import { processingOptionsForRun } from './processing-options';
const controls = metadata as ProcessingControls;
it('omits edits to reused steps when restarting from positioning', () => {
	expect(
		processingOptionsForRun(
			controls,
			{
				preparing: { videoFrameIntervalSeconds: 2 },
				detecting: { confidence: 0.1 },
				positioning: { method: 'multiview' }
			},
			{},
			'positioning',
			'odm'
		)
	).toEqual({ positioning: { method: 'multiview' } });
});
it('clears inherited overrides unsupported by the new engine and retains matching overrides', () => {
	const source = { reconstructing: { maxMeshVertices: 1000000, textureResolution: null } };
	expect(
		processingOptionsForRun(
			controls,
			{ reconstructing: { textureResolution: 8192, quality: 'detailed' } },
			source,
			'reconstructing',
			'meshroom'
		)
	).toEqual({
		reconstructing: { maxMeshVertices: null, textureResolution: 8192, quality: 'detailed' }
	});
	expect(
		processingOptionsForRun(
			controls,
			{ reconstructing: { textureResolution: 8192 } },
			source,
			'reconstructing',
			'realityscan'
		)
	).toEqual({ reconstructing: { maxMeshVertices: null } });
});
it('keeps explicit null resets and leaves untouched source settings to server inheritance', () => {
	expect(
		processingOptionsForRun(
			controls,
			{ preparing: { videoEndSeconds: null } },
			{ preparing: { videoEndSeconds: 30 } },
			'preparing',
			'odm'
		)
	).toEqual({ preparing: { videoEndSeconds: null } });
});
