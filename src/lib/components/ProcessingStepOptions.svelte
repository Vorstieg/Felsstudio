<script lang="ts">
	import { _ } from 'svelte-i18n';
	import type {
		ProcessingControls,
		ProcessingOptions,
		ProcessingStep,
		ReconstructionEngine,
		OptionValue,
		ProcessingControl
	} from '$lib/api/processing';
	import { processingSteps } from '$lib/assets/js/processing-options';
	let {
		controls,
		values = {},
		source = {},
		fromStep = 'preparing',
		engine,
		detection = true,
		disabled = false,
		onchange
	}: {
		controls: ProcessingControls;
		values?: ProcessingOptions;
		source?: ProcessingOptions;
		fromStep?: ProcessingStep;
		engine: ReconstructionEngine;
		detection?: boolean;
		disabled?: boolean;
		onchange: (_values: ProcessingOptions) => void;
	} = $props();
	let form: HTMLDivElement;
	const value = (step: ProcessingStep, key: string, control: ProcessingControl) =>
		values[step]?.[key] ?? source[step]?.[key] ?? control.default;
	// Null is an explicit request to restore the preset, rather than inherit the source override.
	const current = (step: ProcessingStep, key: string, control: ProcessingControl) =>
		values[step]?.[key] !== undefined
			? values[step]![key]
			: source[step]?.[key] !== undefined
				? source[step]![key]
				: control.default;
	function change(step: ProcessingStep, key: string, next: OptionValue) {
		onchange({ ...values, [step]: { ...values[step], [key]: next } });
	}
	function visible(step: ProcessingStep, control: ProcessingControl) {
		return (
			(!control.engines || control.engines.includes(engine)) &&
			(!control.when ||
				Object.entries(control.when).every(
					([key, expected]) => value(step, key, controls[step][key]) === expected
				))
		);
	}
	export function validate() {
		for (const input of form.querySelectorAll<
			HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
		>('input, textarea, select')) {
			if (!input.checkValidity()) {
				const details = input.closest('details');
				if (details) details.open = true;
				input.reportValidity();
				return false;
			}
		}
		return true;
	}
	function endMinimum() {
		const start = Number(
			current('preparing', 'videoStartSeconds', controls.preparing.videoStartSeconds)
		);
		return start + 0.001;
	}
</script>

{#snippet field(step: ProcessingStep, key: string, control: ProcessingControl)}
	<label class="block space-y-1 text-body-text">
		<span class="text-ui-label"
			>{key === 'method' ? $_('processing.placement') : control.label}{control.unit
				? ` (${control.unit})`
				: ''}</span
		>
		{#if control.enum}
			<select
				aria-label={key === 'method' ? $_('processing.placement') : control.label}
				class="reconstruction-input w-full"
				{disabled}
				value={current(step, key, control) ?? ''}
				onchange={(event) =>
					change(
						step,
						key,
						event.currentTarget.value === ''
							? null
							: control.type === 'integer'
								? Number(event.currentTarget.value)
								: event.currentTarget.value
					)}
			>
				{#if control.nullable}<option value="">{$_('processing.use_default')}</option>{/if}
				{#each control.enum as option}
					<option value={option}
						>{key === 'method'
							? $_(`processing.placement_${option}`)
							: option}{control.experimentalValues?.includes(option) && key !== 'method'
							? ` · ${$_('processing.experimental')}`
							: ''}{control.advancedValues?.includes(option)
							? ` · ${$_('processing.advanced')}`
							: ''}</option
					>
				{/each}
			</select>
		{:else if control.type === 'array'}
			<textarea
				aria-label={control.label}
				class="reconstruction-input w-full"
				rows="3"
				{disabled}
				value={(current(step, key, control) as string[]).join('\n')}
				oninput={(event) => {
					const paths = event.currentTarget.value
						.split('\n')
						.map((path) => path.trim())
						.filter(Boolean);
					const invalid = paths.some(
						(path) =>
							path.startsWith('/') ||
							path.includes('\\') ||
							path.split('/').some((part) => !part || part === '.' || part === '..')
					);
					event.currentTarget.setCustomValidity(invalid ? $_('processing.invalid_paths') : '');
					change(step, key, paths);
				}}
			></textarea>
		{:else}
			<input
				aria-label={control.label}
				class="reconstruction-input w-full"
				type="number"
				{disabled}
				required={!control.nullable}
				min={key === 'videoEndSeconds' ? endMinimum() : control.minimum}
				max={control.maximum}
				step={control.type === 'integer' ? 1 : 'any'}
				placeholder={control.nullable ? $_('processing.use_default') : ''}
				value={current(step, key, control) as number | null}
				oninput={(event) =>
					change(
						step,
						key,
						event.currentTarget.value === '' ? null : event.currentTarget.valueAsNumber
					)}
			/>
		{/if}
		{#if control.description}<span class="block text-micro-data text-warm-gray-500"
				>{control.description}</span
			>{/if}
	</label>
{/snippet}

<div bind:this={form} class="space-y-4">
	{#each processingSteps.slice(processingSteps.indexOf(fromStep)) as step}
		{#if detection || !['detecting', 'positioning'].includes(step)}
			<fieldset class="space-y-3 rounded-lg border border-black/10 p-3" {disabled}>
				<legend class="px-1 text-ui-label">{$_(`processing.stage_${step}`)}</legend>
				{#each Object.entries(controls[step]).filter(([, control]) => !control.advanced) as [key, control]}
					{#if visible(step, control)}{@render field(step, key, control)}{/if}
				{/each}
				{#if Object.values(controls[step]).some((control) => control.advanced && visible(step, control))}
					<details class="space-y-3">
						<summary class="cursor-pointer text-ui-label">{$_('processing.advanced')}</summary>
						{#each Object.entries(controls[step]).filter(([, control]) => control.advanced) as [key, control]}
							{#if visible(step, control)}{@render field(step, key, control)}{/if}
						{/each}
					</details>
				{/if}
			</fieldset>
		{/if}
	{/each}
</div>

<style>
	.reconstruction-input {
		border: 1px solid rgba(0, 0, 0, 0.1);
		border-radius: 8px;
		background: rgba(0, 0, 0, 0.05);
		padding: 8px;
		color: rgba(0, 0, 0, 0.95);
		font: 400 13px var(--font-sans);
		text-transform: none;
	}
	.reconstruction-input:focus-visible {
		outline: 2px solid #0075de;
		outline-offset: 2px;
	}
	.reconstruction-input:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	textarea {
		resize: vertical;
	}
</style>
