import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { Box3, Vector3 } from 'three';

/**
 * Creates a GLTFLoader configured for all GLB/GLTF files used by the app.
 * Some exported models use EXT_meshopt_compression, which requires the decoder
 * to be registered before parsing or loading begins.
 */
export function createGltfLoader() {
	const loader = new GLTFLoader();
	loader.setMeshoptDecoder(MeshoptDecoder);
	return loader;
}

/**
 * Loads a GLB into the editor state and centers the model around the origin.
 *
 * @param {File | Blob} file
 * @returns {Promise<import('three').Group>}
 */
export async function loadGlbIntoEditorState(file, session) {
	if (!session) throw new Error('A topo editor session is required to load a GLB');
	const loader = createGltfLoader();
	const buffer = await file.arrayBuffer();
	session.setModelFile(file);

	return new Promise((resolve, reject) => {
		loader.parse(
			buffer,
			'',
			(gltf) => {
				const box = new Box3().setFromObject(gltf.scene);
				if (!box.isEmpty()) {
					const center = new Vector3();
					box.getCenter(center);
					session.topo.modelOffset = center.negate().toArray();
				}
				resolve(gltf.scene);
			},
			reject
		);
	});
}
