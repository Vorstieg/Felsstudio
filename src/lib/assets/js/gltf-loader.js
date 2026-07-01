import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

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
