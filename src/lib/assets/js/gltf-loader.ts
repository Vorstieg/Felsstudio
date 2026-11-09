import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { base } from '$app/paths';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { Box3, Group, Vector3 } from 'three';

type TopoModelSession = {
	setModelFile(file: File | Blob): void;
	ui: { modelOffset: [number, number, number] };
};

// Share the bounded worker pool across uploads and model views for this page's lifetime.
let draco: DRACOLoader | undefined;

export function createGltfLoader(): GLTFLoader {
	const loader = new GLTFLoader();
	loader.setMeshoptDecoder(MeshoptDecoder);
	draco ??= new DRACOLoader().setDecoderPath(`${base}/draco/`);
	loader.setDRACOLoader(draco);
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
					session.ui.modelOffset = center.negate().toArray() as [number, number, number];
				}
				resolve(gltf.scene);
			},
			reject
		);
	});
}
