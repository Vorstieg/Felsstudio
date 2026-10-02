<script lang="ts">
	import type { Grade, Route } from '@vorstieg/fels-types/types';
	import {
		gradeSystems,
		getAvailableGradeSystems
	} from '$lib/components/editor/topo-properties/routes/grades.ts';
	import { createGrade } from '$lib/assets/js/topo-utils.ts';
	import { _ } from 'svelte-i18n';

	type Props = {
		route: Pick<Route, 'type'>;
		grade?: Grade;
		onFieldChange?: ((_field: string, _value: unknown) => void) | null;
	};
	let { route, grade = $bindable(), onFieldChange = null }: Props = $props();
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
				if (effectiveGrade)
					onFieldChange?.('grade', createGrade(effectiveGrade, event.currentTarget.value));
			}}
			id="gradeSystem"
			class="input-studio w-24 font-bold"
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
			{#each gradeSystems[effectiveScale as keyof typeof gradeSystems] || [] as gradeOption}
				<option value={gradeOption}>{gradeOption}</option>
			{/each}
		</select>
	</div>
</div>
