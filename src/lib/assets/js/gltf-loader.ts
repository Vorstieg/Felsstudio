import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { Box3, Group, Vector3 } from 'three';

type TopoModelSession = {
	setModelFile(file: File | Blob): void;
	topo: {
		modelOffset?: number[];
	};
};

export function createGltfLoader(): GLTFLoader {
	const loader = new GLTFLoader();
	loader.setMeshoptDecoder(MeshoptDecoder);
	return loader;
}

export async function loadGlbIntoEditorState(
	file: File | Blob,
	session: TopoModelSession
): Promise<Group> {
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
