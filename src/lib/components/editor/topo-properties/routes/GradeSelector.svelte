<script lang="ts">
	import type { Grade, Route } from '@vorstieg/fels-types/types';
	import {
		gradeSystems,
		getAvailableGradeSystems,
		type GradeSystem
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
	let selectedScale = $state<GradeSystem | ''>('');

	$effect(() => {
		void route;
		void grade?.scale;
		selectedScale = '';
	});

	let effectiveScale = $derived.by((): GradeSystem | '' => {
		if (selectedScale && availableGradeSystems.includes(selectedScale)) {
			return selectedScale;
		}
		const storedScale = grade?.scale as GradeSystem | undefined;
		if (storedScale && availableGradeSystems.includes(storedScale)) {
			return storedScale;
		}
		return availableGradeSystems[0] || '';
	});
	let availableGrades = $derived(
		effectiveScale ? (gradeSystems[effectiveScale] as readonly string[]) : []
	);
	let effectiveGrade = $derived(
		grade?.value && availableGrades.includes(grade.value) ? grade.value : ''
	);
</script>

<div>
	<label class="text-ui-label block" for="gradeSystem">{$_('topo.grade')}</label>
	<div class="flex gap-1">
		<select
			value={effectiveScale}
			onchange={(event) => {
				const nextScale = event.currentTarget.value as GradeSystem;
				selectedScale = nextScale;
				const nextOptions = gradeSystems[nextScale] as readonly string[] | undefined;
				if (grade?.value && nextOptions?.includes(grade.value)) {
					const nextGrade = createGrade(grade.value, nextScale);
					grade = nextGrade ?? undefined;
					onFieldChange?.('grade', nextGrade);
				}
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
				const nextGrade = createGrade(event.currentTarget.value, effectiveScale);
				grade = nextGrade ?? undefined;
				onFieldChange?.('grade', nextGrade);
			}}
			class="input-studio min-w-0 flex-1"
		>
			<option value="">-</option>
			{#each availableGrades as gradeOption}
				<option value={gradeOption}>{gradeOption}</option>
			{/each}
		</select>
	</div>
</div>
