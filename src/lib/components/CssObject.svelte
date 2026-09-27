<script lang="ts">
	import { T, useThrelte, useTask } from '@threlte/core';
	import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
	import { Vector3 } from 'three';
	import type { Snippet } from 'svelte';

	type Props = {
		position: [number, number, number] | Vector3;
		pointerEvents?: boolean;
		scaleWithZoom?: boolean;
		referenceDistance?: number;
		children?: Snippet<[{ ref?: CSS2DObject }?]>;
	};
	let {
		position,
		pointerEvents = false,
		scaleWithZoom = false,
		referenceDistance = 15,
		children
	}: Props = $props();

	let element = $state<HTMLDivElement | undefined>();
	let innerElement = $state<HTMLDivElement | undefined>();
	let cssObject = $state<CSS2DObject | undefined>();

	const { camera } = useThrelte();
	const vec = new Vector3();

	useTask(() => {
		if (scaleWithZoom && innerElement && cssObject && camera.current) {
			cssObject.getWorldPosition(vec);
			const distance = camera.current.position.distanceTo(vec);
			// Prevent division by zero or infinite scaling near 0
			// Standard perspective projection: scale is inversely proportional to distance.
			// If distance = referenceDistance, scale = 1.
			// If distance = 2 * referenceDistance, scale = 0.5.
			let scale = referenceDistance / Math.max(0.1, distance);

			// Clamp scale to reasonable limits to avoid disappearance or huge elements
			scale = Math.max(0.1, Math.min(5, scale));

			innerElement.style.transform = `scale(${scale})`;
		}
	});
</script>

<div
	bind:this={element}
	style:pointer-events={pointerEvents ? 'auto' : 'none'}
	style:position="absolute"
	style:user-select="none"
	style:will-change="transform"
>
	<div bind:this={innerElement} style:transition="transform 0.1s linear">
		{@render children?.()}
	</div>
</div>

{#if element !== undefined}
	<T
		is={CSS2DObject}
		args={[element]}
		bind:ref={cssObject}
		position={position instanceof Vector3 ? position.toArray() : position}
	>
		{#snippet children({ ref })}
			{@render children?.({ ref })}
		{/snippet}
	</T>
{/if}
