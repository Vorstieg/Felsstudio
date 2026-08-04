import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ToolButton from './ToolButton.svelte';

const tool = {
	label: 'Select',
	title: 'Select objects',
	icon: 'fa-arrow-pointer',
	disabled: false
};

describe('ToolButton', () => {
	it('exposes its tool semantics and active state', () => {
		render(ToolButton, { tool, active: true });

		const button = screen.getByRole('button', { name: 'Select' });
		expect(button).toHaveAttribute('type', 'button');
		expect(button).toHaveAttribute('title', 'Select objects');
		expect(button).toHaveAttribute('aria-pressed', 'true');
		expect(button).toBeEnabled();
	});

	it('calls the supplied callback when the user clicks it', async () => {
		const user = userEvent.setup();
		const onclick = vi.fn();
		render(ToolButton, { tool, onclick });

		await user.click(screen.getByRole('button', { name: 'Select' }));

		expect(onclick).toHaveBeenCalledOnce();
	});

	it('does not allow interaction for disabled tools', async () => {
		const user = userEvent.setup();
		const onclick = vi.fn();
		render(ToolButton, { tool: { ...tool, disabled: true }, onclick });

		const button = screen.getByRole('button', { name: 'Select' });
		expect(button).toBeDisabled();
		await user.click(button);
		expect(onclick).not.toHaveBeenCalled();
	});
});
