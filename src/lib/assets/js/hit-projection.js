import * as THREE from 'three';

/**
 * Parses the RealityCapture registration.csv format
 * #name,tx,ty,tz,R00,R01,R02,R10,R11,R12,R20,R21,R22,f,px,py,k1,k2,t2,t1,k3,k4
 */
export function parseRegistrationCsv(csvText) {
	const cameras = {};
	const lines = csvText.split('\n');
	let header = [];

	for (const line of lines) {
		if (!line.trim()) continue;
		if (line.startsWith('#')) {
			header = line
				.substring(1)
				.split(',')
				.map((h) => h.trim());
			continue;
		}

		const values = line.split(',');
		const row = {};
		header.forEach((h, i) => (row[h] = values[i]));

		// Extract frame index from name (e.g., DJI_0071_frame000000.png)
		const match = row.name.match(/frame(\d+)/);
		if (!match) continue;
		const frameIndex = parseInt(match[1]);

		// Camera extrinsic matrix (World to Camera)
		const R = new THREE.Matrix3().set(
			parseFloat(row.R00),
			parseFloat(row.R01),
			parseFloat(row.R02),
			parseFloat(row.R10),
			parseFloat(row.R11),
			parseFloat(row.R12),
			parseFloat(row.R20),
			parseFloat(row.R21),
			parseFloat(row.R22)
		);
		const t = new THREE.Vector3(parseFloat(row.tx), parseFloat(row.ty), parseFloat(row.tz));

		// Camera center in world space: C = -R^T * t
		const Rt = R.clone().transpose();
		const center = t.clone().applyMatrix3(Rt).multiplyScalar(-1);

		cameras[frameIndex] = {
			name: row.name,
			R: R,
			Rt: Rt,
			t: t,
			center: center,
			f: parseFloat(row.f),
			px: parseFloat(row.px),
			py: parseFloat(row.py),
			dist: [
				parseFloat(row.k1),
				parseFloat(row.k2),
				parseFloat(row.t1),
				parseFloat(row.t2),
				parseFloat(row.k3)
			]
		};
	}
	return cameras;
}

/**
 * Projects 2D detections to 3D hits using raycasting on the mesh.
 * This function should be called within a context where the GLTF model is available.
 */
export function projectHits(detections, cameras, gltfScene, options = {}) {
	const { maxEdgeDist = 1.0, minConfidence = 0.2 } = options;

	const hits = [];
	const raycaster = new THREE.Raycaster();

	// Create a mesh-only group for raycasting if needed
	const meshes = [];
	const originalSides = new Map();
	gltfScene.traverse((child) => {
		if (child.isMesh) {
			meshes.push(child);
			if (child.material) {
				originalSides.set(child, child.material.side);
				child.material.side = THREE.DoubleSide; // Ensure we hit backfaces if normals are flipped
			}
		}
	});

	// Detect format: { "v0_f000084": [...] } or { frames: [{ frame_index: 84, detections: [...] }] }
	let frameEntries = [];
	if (detections.frames) {
		frameEntries = detections.frames.map((f) => [f.frame_index, f.detections]);
	} else {
		frameEntries = Object.entries(detections)
			.map(([key, dets]) => {
				const match = key.match(/f(\d+)/);
				return match ? [parseInt(match[1]), dets] : null;
			})
			.filter((e) => e !== null);
	}

	for (const [frameIndex, frameDets] of frameEntries) {
		const cam = cameras[frameIndex];
		if (!cam) continue;

		for (const det of frameDets) {
			const conf = det.confidence !== undefined ? det.confidence : 1.0;
			if (conf < minConfidence) continue;

			const [x1, y1, x2, y2] = det.bbox_xyxy;
			const px = (x1 + x2) / 2;
			const py = (y1 + y2) / 2;

			// Simple edge distance (normalized to principal point)
			// RealityCapture uses principal point in pixels.
			// We'll just use the raw distance for now.
			const dx = (px - cam.px) / cam.f;
			const dy = (py - cam.py) / cam.f;
			const edgeDist = Math.sqrt(dx * dx + dy * dy);
			if (edgeDist > maxEdgeDist) continue;

			// Ray direction in camera space: [(px - cx)/f, (py - cy)/f, 1]
			// Note: Camera space is usually -Z forward in Three.js, but standard CV is +Z forward.
			// RealityCapture/AliceVision use +Z forward.
			const dirCam = new THREE.Vector3(
				(px - cam.px) / cam.f,
				(py - cam.py) / cam.f,
				1.0
			).normalize();

			// Rotate to world space: D = R^T * d_cam
			const dirWorld = dirCam.applyMatrix3(cam.Rt).normalize();

			raycaster.set(cam.center, dirWorld);
			const intersects = raycaster.intersectObjects(meshes, true);

			if (intersects.length > 0) {
				const hit = intersects[0];
				hits.push({
					pos: hit.point.toArray(),
					cam_pos: cam.center.toArray(),
					conf: conf,
					edge_dist: edgeDist,
					img: cam.name,
					uv: [px, py],
					normal_dot: Math.abs(dirWorld.dot(hit.face.normal)),
					class: det.class_name || 'bolt',
					norm: hit.face.normal.toArray(),
					cam_dist: hit.distance
				});
			}
		}
	}

	return hits;
}
