<script>
	import { useTask, useThrelte } from '@threlte/core';
	import * as THREE from 'three';
	import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
	import { onMount } from 'svelte';

	let {
		loadedGltfScene,
		element,
		selectedIndicesMap = $bindable()
	} = $props();

	const { autoRenderTask, camera, scene, size } = useThrelte();

	// --- CSS Renderer ---
	let cssRenderer;
	onMount(() => {
		cssRenderer = new CSS2DRenderer({ element });
		cssRenderer.setSize($size.width, $size.height);
	});

	$effect(() => {
		if (cssRenderer) cssRenderer.setSize($size.width, $size.height);
	});

	useTask(() => {
		scene.updateMatrixWorld();
	}, { before: autoRenderTask });

	useTask(() => {
		if (cssRenderer && camera.current) {
			cssRenderer.render(scene, camera.current);
		}
	}, { after: autoRenderTask, autoInvalidate: false });

	// --- Interaction Delegation ---
	// This allows the parent component to call 3D logic
	export function previewLassoCut(points) {
		if (!loadedGltfScene || !points || points.length < 3) return;

		const cam = camera.current;
		const width = $size.width;
		const height = $size.height;

		const ndcPoly = points.map(p => [
			(p[0] / width) * 2 - 1,
			-(p[1] / height) * 2 + 1
		]);

		const isPointInNdcPoly = (nx, ny) => {
			let inside = false;
			for (let i = 0, j = ndcPoly.length - 1; i < ndcPoly.length; j = i++) {
				if (((ndcPoly[i][1] > ny) !== (ndcPoly[j][1] > ny)) &&
					(nx < (ndcPoly[j][0] - ndcPoly[i][0]) * (ny - ndcPoly[i][1]) / (ndcPoly[j][1] - ndcPoly[i][1]) + ndcPoly[i][0])) inside = !inside;
			}
			return inside;
		};

		const v = new THREE.Vector3();
		const vNDC = new THREE.Vector3();
		loadedGltfScene.updateMatrixWorld(true);

		loadedGltfScene.traverse((child) => {
			if (child.isMesh && child.geometry) {
				const geo = child.geometry;
				const pos = geo.attributes.position;
				const colors = geo.attributes.color;

				const origAttr = geo.attributes.originalColor;
				if (origAttr && colors) {
					for (let i = 0; i < colors.count; i++) colors.setXYZ(i, origAttr.getX(i), origAttr.getY(i), origAttr.getZ(i));
				}

				if (child.material) {
					const mats = Array.isArray(child.material) ? child.material : [child.material];
					mats.forEach(m => {
						m.needsUpdate = true;
					});
				}
				if (!selectedIndicesMap.has(child.uuid)) selectedIndicesMap.set(child.uuid, new Set());
				const selection = selectedIndicesMap.get(child.uuid);
				for (let i = 0; i < pos.count; i++) {
					v.fromBufferAttribute(pos, i);
					vNDC.copy(v).applyMatrix4(child.matrixWorld).project(cam);
					if (vNDC.z < -1 || vNDC.z > 1) continue;
					if (isPointInNdcPoly(vNDC.x, vNDC.y)) {
						selection.add(i);
						colors.setXYZ(i, 1.0, 0.2, 0.2);
					}
				}
				colors.needsUpdate = true;
			}
		});
	}
</script>
