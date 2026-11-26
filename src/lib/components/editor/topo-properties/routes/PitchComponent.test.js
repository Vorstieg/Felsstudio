import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { init } from 'svelte-i18n';
import { describe, expect, it, vi } from 'vitest';
import PitchComponentTestWrapper from './PitchComponentTestWrapper.svelte';

init({ initialLocale: 'en' });

function createPitch() {
	return {
		grade: null,
		length: 12,
		boltAmount: 4,
		lineStyle: 'red',
		type: 'pitch'
	};
}

describe('PitchComponent', () => {
	it('emits controlled field changes without mutating the supplied pitch', async () => {
		const user = userEvent.setup();
		const pitch = createPitch();
		const onFieldChange = vi.fn();
		render(PitchComponentTestWrapper, { pitch, onFieldChange });

		const selects = screen.getAllByRole('combobox');
		await user.selectOptions(selects[0], selects[0].options[1].value);
		await user.selectOptions(selects[1], selects[1].options[1].value);
		const textboxes = screen.getAllByRole('textbox');
		await user.clear(textboxes[0]);
		await user.type(textboxes[0], '18');
		await user.clear(textboxes[1]);
		await user.type(textboxes[1], '6');
		await user.selectOptions(selects[2], selects[2].options[1].value);

		expect(onFieldChange).toHaveBeenCalledWith(
			'grade',
			expect.objectContaining({
				scale: expect.any(String),
				value: expect.any(String),
				standardizedValue: expect.any(String)
			})
		);
		expect(onFieldChange).toHaveBeenCalledWith('length', '18');
		expect(onFieldChange).toHaveBeenCalledWith('boltAmount', '6');
		expect(onFieldChange).toHaveBeenCalledWith('lineStyle', expect.any(String));
		expect(pitch).toEqual(createPitch());
	});

	it('leaves unknown or zero route lengths empty instead of pre-filling 0', async () => {
		const user = userEvent.setup();
		const onFieldChange = vi.fn();
		render(PitchComponentTestWrapper, {
			pitch: { grade: null, length: 0, boltAmount: undefined, lineStyle: 'red', type: 'pitch' },
			onFieldChange
		});

		const textboxes = screen.getAllByRole('textbox');
		expect(textboxes[0]).toHaveValue('');
		await user.type(textboxes[0], '24');
		await user.tab();
		expect(onFieldChange).toHaveBeenCalledWith('length', '24');
	});

	it('adapts grade systems for array-typed via-ferrata and alpine-tour routes and updates grades when switching scale', async () => {
		const user = userEvent.setup();
		const onFieldChange = vi.fn();
		const { rerender } = render(PitchComponentTestWrapper, {
			pitch: { grade: null, lineStyle: 'red', type: ['via-ferrata'] },
			onFieldChange
		});

		const selects = screen.getAllByRole('combobox');
		expect(Array.from(selects[0].options).map((option) => option.value)).toEqual([
			'schall',
			'huelser'
		]);
		expect(Array.from(selects[1].options).map((option) => option.value)).toContain('C/D');

		// Switching scale before selecting a grade updates the available grade options and saves with the new scale
		await user.selectOptions(selects[0], 'huelser');
		expect(Array.from(selects[1].options).map((option) => option.value)).toContain('K3');
		await user.selectOptions(selects[1], 'K3');
		expect(onFieldChange).toHaveBeenCalledWith('grade', {
			scale: 'huelser',
			value: 'K3',
			standardizedValue: 'K3'
		});

		await rerender({
			pitch: {
				grade: { scale: 'uiaa', value: 'V', standardizedValue: '5a' },
				lineStyle: 'red',
				type: ['via-ferrata']
			},
			onFieldChange
		});
		expect(selects[0]).toHaveValue('schall');
		expect(selects[1]).toHaveValue('');

		await rerender({
			pitch: { grade: null, lineStyle: 'red', type: ['alpine-tour'] },
			onFieldChange
		});
		expect(Array.from(selects[0].options).map((option) => option.value)).toEqual(['sac', 'uiaa']);
		expect(Array.from(selects[1].options).map((option) => option.value)).toContain('AD');
	});
});
