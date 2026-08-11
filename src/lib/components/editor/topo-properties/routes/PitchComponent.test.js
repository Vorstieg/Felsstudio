import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { init } from 'svelte-i18n';
import { describe, expect, it, vi } from 'vitest';
import PitchComponentTestWrapper from './PitchComponentTestWrapper.svelte';

init({ initialLocale: 'en' });

function createPitch() {
	return {
		grade: '',
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
		await user.clear(screen.getAllByRole('spinbutton')[0]);
		await user.type(screen.getAllByRole('spinbutton')[0], '18');
		await user.clear(screen.getAllByRole('spinbutton')[1]);
		await user.type(screen.getAllByRole('spinbutton')[1], '6');
		await user.selectOptions(selects[2], selects[2].options[1].value);

		expect(onFieldChange).toHaveBeenCalledWith('grade', expect.any(String));
		expect(onFieldChange).toHaveBeenCalledWith('_gradeScale', expect.any(String));
		expect(onFieldChange).toHaveBeenCalledWith('length', 18);
		expect(onFieldChange).toHaveBeenCalledWith('boltAmount', 6);
		expect(onFieldChange).toHaveBeenCalledWith('lineStyle', expect.any(String));
		expect(pitch).toEqual(createPitch());
	});

	it('retains direct bound updates for uncontrolled callers', async () => {
		const user = userEvent.setup();
		const pitch = createPitch();
		render(PitchComponentTestWrapper, { pitch });

		const selects = screen.getAllByRole('combobox');
		await user.selectOptions(selects[0], selects[0].options[1].value);
		await user.selectOptions(selects[1], selects[1].options[1].value);
		await user.clear(screen.getAllByRole('spinbutton')[0]);
		await user.type(screen.getAllByRole('spinbutton')[0], '18');
		await user.selectOptions(selects[2], selects[2].options[1].value);

		expect(pitch.grade).toBe(selects[1].options[1].value);
		expect(pitch.length).toBe(18);
		expect(pitch.lineStyle).toBe(selects[2].options[1].value);
	});
});
