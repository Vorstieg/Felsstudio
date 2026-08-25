<script>
	import { _ } from 'svelte-i18n';
	import {
		wallAzimuthForDirection,
		wallDirectionForAzimuth,
		wallDirections
	} from '$lib/assets/js/wall-directions.js';

	let { id = 'wall-azimuth', azimuth = 0, onChange } = $props();

	function update(directionId) {
		const nextAzimuth = wallAzimuthForDirection(directionId);
		if (nextAzimuth != null) onChange?.(nextAzimuth);
	}
</script>

<select
	{id}
	value={wallDirectionForAzimuth(azimuth).id}
	onchange={(event) => update(event.currentTarget.value)}
	class="input-studio w-full appearance-none"
>
	{#each wallDirections as direction}
		<option value={direction.id}>{direction.id} — {$_(`directions.${direction.id}`)}</option>
	{/each}
</select>
