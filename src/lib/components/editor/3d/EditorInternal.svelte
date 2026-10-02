<script lang="ts">
	import { useTask, useThrelte } from '@threlte/core';
	import { Float32BufferAttribute, Mesh, Vector3 } from 'three';
	import type { Group } from 'three';
	import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
	import { onMount } from 'svelte';

	type Point2 = [number, number];
	type Props = {
		loadedGltfScene: Group | null;
		element: HTMLDivElement;
		selectedIndicesMap: Map<string, Set<number>>;
	};
	let { loadedGltfScene, element, selectedIndicesMap = $bindable() }: Props = $props();

	const { autoRenderTask, camera, scene, size } = useThrelte();

	// --- CSS Renderer ---
	let cssRenderer: CSS2DRenderer | null = null;
	onMount(() => {
		cssRenderer = new CSS2DRenderer({ element });
		cssRenderer.setSize($size.width, $size.height);
	});

	$effect(() => {
		if (cssRenderer) cssRenderer.setSize($size.width, $size.height);
	});

	useTask(
		() => {
			scene.updateMatrixWorld();
		},
		{ before: autoRenderTask }
	);

	useTask(
		() => {
			if (cssRenderer && camera.current) {
				cssRenderer.render(scene, camera.current);
			}
		},
		{ after: autoRenderTask, autoInvalidate: false }
	);

	// --- Interaction Delegation ---
	// This allows the parent component to call 3D logic
	export function previewLassoCut(points: Point2[]): void {
		if (!loadedGltfScene || points.length < 3) return;

		const cam = camera.current;
		const bounds = element.getBoundingClientRect();
		if (!cam || bounds.width <= 0 || bounds.height <= 0) return;

		const ndcPoly: Point2[] = points.map(([x, y]) => [
			((x - bounds.left) / bounds.width) * 2 - 1,
			-((y - bounds.top) / bounds.height) * 2 + 1
		]);

		const isPointInNdcPoly = (nx: number, ny: number) => {
			let inside = false;
			for (let i = 0, j = ndcPoly.length - 1; i < ndcPoly.length; j = i++) {
				if (
					ndcPoly[i][1] > ny !== ndcPoly[j][1] > ny &&
					nx <
						((ndcPoly[j][0] - ndcPoly[i][0]) * (ny - ndcPoly[i][1])) /
							(ndcPoly[j][1] - ndcPoly[i][1]) +
							ndcPoly[i][0]
				)
					inside = !inside;
			}
			return inside;
		};

		const v = new Vector3();
		const vNDC = new Vector3();
		loadedGltfScene.updateMatrixWorld(true);

		loadedGltfScene.traverse((child) => {
			if (child instanceof Mesh && child.geometry) {
				const geo = child.geometry;
				const pos = geo.attributes.position;
				if (!pos) return;
				if (!geo.attributes.color) {
					geo.setAttribute(
						'color',
						new Float32BufferAttribute(new Float32Array(pos.count * 3).fill(1), 3)
					);
				}
				const colors = geo.attributes.color;

				if (!geo.attributes.originalColor) geo.setAttribute('originalColor', colors.clone());
				const origAttr = geo.attributes.originalColor;
				if (origAttr) {
					for (let i = 0; i < colors.count; i++)
						colors.setXYZ(i, origAttr.getX(i), origAttr.getY(i), origAttr.getZ(i));
				}

				if (child.material) {
					const mats = Array.isArray(child.material) ? child.material : [child.material];
					mats.forEach((m) => {
						if ('vertexColors' in m) m.vertexColors = true;
						m.needsUpdate = true;
					});
				}
				if (!selectedIndicesMap.has(child.uuid)) selectedIndicesMap.set(child.uuid, new Set());
				const selection = selectedIndicesMap.get(child.uuid)!;
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
