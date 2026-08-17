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
		const textboxes = screen.getAllByRole('textbox');
		await user.clear(textboxes[0]);
		await user.type(textboxes[0], '18');
		await user.clear(textboxes[1]);
		await user.type(textboxes[1], '6');
		await user.selectOptions(selects[2], selects[2].options[1].value);

		expect(onFieldChange).toHaveBeenCalledWith('grade', expect.any(String));
		expect(onFieldChange).toHaveBeenCalledWith('_gradeScale', expect.any(String));
		expect(onFieldChange).toHaveBeenCalledWith('length', '18');
		expect(onFieldChange).toHaveBeenCalledWith('boltAmount', '6');
		expect(onFieldChange).toHaveBeenCalledWith('lineStyle', expect.any(String));
		expect(pitch).toEqual(createPitch());
	});
});
