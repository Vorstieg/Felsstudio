import { expect, it } from 'vitest';
import { createGltfLoader } from './gltf-loader.ts';

it('reuses the Draco worker pool across independent model loaders', () => {
	const uploadLoader = createGltfLoader();
	const viewLoader = createGltfLoader();
	expect(uploadLoader).not.toBe(viewLoader);
	expect(uploadLoader.dracoLoader).toBeTruthy();
	expect(viewLoader.dracoLoader).toBe(uploadLoader.dracoLoader);
});
