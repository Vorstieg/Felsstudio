<script>
	import {
		gradeSystems,
		getAvailableGradeSystems
	} from '$lib/components/editor/topo-properties/grades.js';
	import { _ } from 'svelte-i18n';

	let { route, grade = $bindable(), scale = $bindable(), mobile = false } = $props();
	if(!scale){
		scale = getAvailableGradeSystems(route?.type)[0]
	}

</script>

<div >
	<label class="text-ui-label block" for="gradeSystem">{$_('topo.grade')}</label>
	<div class="flex gap-1">
		<select bind:value={scale} id="gradeSystem"
		        class={mobile ? 'input-studio w-32 font-bold' : 'input-studio w-24 font-bold'}>
			{#each getAvailableGradeSystems(route?.type) as system}

				<option value={system}>{$_(`grade.system.${system}`)}</option>
			{/each}
		</select>

		<select bind:value={grade} class="input-studio min-w-0 flex-1">
			<option value="">-</option>
			{#each gradeSystems[scale] as gradeOption}
				<option value={gradeOption}>{gradeOption}</option>
			{/each}
		</select>
	</div>
</div>