// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { restoreDraftSession, serializeDraftExtras } from './draft-serialization.js';

describe('serializeDraftExtras', () => {
	it('serializes GLB data without mutating the original extras', async () => {
		const blob = Object.assign(new Blob(['glb-data'], { type: 'model/gltf-binary' }), {
			arrayBuffer: async () => new TextEncoder().encode('glb-data').buffer
		});
		const extras = { glbBlob: blob, selectedRouteId: 'route-1' };

		const serialized = await serializeDraftExtras(extras);

		expect(serialized.glbBlob).toBeUndefined();
		expect(new TextDecoder().decode(new Uint8Array(serialized.glbArrayBuffer))).toBe('glb-data');
		expect(extras.glbBlob).toBe(blob);
	});

	it('deduplicates crop URL fetches and drops unavailable URLs', async () => {
		const fetchImpl = vi.fn(async (url) => {
			if (url === 'blob:missing') throw new Error('expired');
			return {
				arrayBuffer: async () => new ArrayBuffer(4),
				headers: { get: () => 'image/png' }
			};
		});
		const extras = {
			clustering: {
				cropsMap: {
					first: 'blob:shared',
					duplicate: 'blob:shared',
					missing: 'blob:missing',
					remote: 'https://example.test/crop.png'
				}
			}
		};

		const serialized = await serializeDraftExtras(extras, { fetchImpl });

		expect(fetchImpl).toHaveBeenCalledTimes(2);
		expect(serialized.clustering.cropsMap).toBeUndefined();
		expect(Object.keys(serialized.clustering.cropsBuffers)).toEqual(['first', 'duplicate']);
		expect(serialized.clustering.cropsBuffers.first).toEqual(
			serialized.clustering.cropsBuffers.duplicate
		);
		expect(extras.clustering.cropsMap.remote).toBe('https://example.test/crop.png');
	});
});

describe('restoreDraftSession', () => {
	it('restores GLB and crop resources from serialized buffers', () => {
		const glbBuffer = new ArrayBuffer(3);
		const cropBuffer = new ArrayBuffer(5);
		const createObjectURL = vi.fn(() => 'blob:restored-crop');
		const session = {
			glbArrayBuffer: glbBuffer,
			clustering: {
				cropsBuffers: {
					first: { buffer: cropBuffer, type: 'image/webp' }
				}
			}
		};

		const restored = restoreDraftSession(session, { createObjectURL });

		expect(restored.glbArrayBuffer).toBeUndefined();
		expect(restored.glbBlob).toBeInstanceOf(Blob);
		expect(restored.clustering.cropsBuffers).toBeUndefined();
		expect(restored.clustering.cropsMap).toEqual({ first: 'blob:restored-crop' });
		expect(createObjectURL).toHaveBeenCalledOnce();
	});
});
