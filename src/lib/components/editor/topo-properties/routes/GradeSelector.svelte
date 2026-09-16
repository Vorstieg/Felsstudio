<script>
	import {
		gradeSystems,
		getAvailableGradeSystems
	} from '$lib/components/editor/topo-properties/routes/grades.js';
	import { createGrade } from '$lib/assets/js/topo-utils.js';
	import { _ } from 'svelte-i18n';

	let {
		route,
		grade = $bindable(),
		onFieldChange = null
	} = $props();
	let availableGradeSystems = $derived(getAvailableGradeSystems(route?.type));
	let effectiveScale = $derived(grade?.scale || availableGradeSystems[0] || '');
	let effectiveGrade = $derived(grade?.value || '');
</script>

<div>
	<label class="text-ui-label block" for="gradeSystem">{$_('topo.grade')}</label>
	<div class="flex gap-1">
		<select
			value={effectiveScale}
			onchange={(event) => {
				if (effectiveGrade) onFieldChange?.('grade', createGrade(effectiveGrade, event.currentTarget.value));
			}}
			id="gradeSystem"
			class='input-studio w-24 font-bold'
		>
			{#each availableGradeSystems as system}
				<option value={system}>{$_(`grade.system.${system}`)}</option>
			{/each}
		</select>

		<select
			value={effectiveGrade}
			onchange={(event) => {
				grade = createGrade(event.currentTarget.value, effectiveScale);
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
