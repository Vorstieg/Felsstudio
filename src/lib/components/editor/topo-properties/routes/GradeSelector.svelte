<script>
	import {
		gradeSystems,
		getAvailableGradeSystems
	} from '$lib/components/editor/topo-properties/routes/grades.js';
	import { _ } from 'svelte-i18n';

	let {
		route,
		grade = $bindable(),
		scale = $bindable(),
		onFieldChange = null
	} = $props();
	let availableGradeSystems = $derived(getAvailableGradeSystems(route?.type));
	let effectiveScale = $derived(scale || availableGradeSystems[0] || '');
</script>

<div>
	<label class="text-ui-label block" for="gradeSystem">{$_('topo.grade')}</label>
	<div class="flex gap-1">
		<select
			value={effectiveScale}
			onchange={(event) => {
				scale = event.currentTarget.value;
				onFieldChange?.('_gradeScale', scale);
			}}
			id="gradeSystem"
			class='input-studio w-24 font-bold'
		>
			{#each availableGradeSystems as system}
				<option value={system}>{$_(`grade.system.${system}`)}</option>
			{/each}
		</select>

		<select
			value={grade}
			onchange={(event) => {
				grade = event.currentTarget.value;
				onFieldChange?.('grade', grade);
			}}
			class="input-studio min-w-0 flex-1"
		>
			<option value="">-</option>
			{#each gradeSystems[effectiveScale] || [] as gradeOption}
				<option value={gradeOption}>{gradeOption}</option>
			{/each}
		</select>
	</div>
</div>
