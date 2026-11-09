import { render, fireEvent } from '@testing-library/svelte';
import { beforeEach, expect, it, vi } from 'vitest';
import { init, addMessages } from 'svelte-i18n';
import controls from '../../../tests/fixtures/processing-options.json';
import type { ProcessingControls } from '$lib/api/processing';
import ProcessingStepOptions from './ProcessingStepOptions.svelte';
beforeEach(() => {
	addMessages('en', { processing: { placement: 'Bolt placement method' } });
	init({ fallbackLocale: 'en', initialLocale: 'en' });
});
it('shows engine-supported overrides and conditional multiview controls with inherited values', async () => {
	const props = {
		controls: controls as ProcessingControls,
		engine: 'odm' as const,
		onchange: vi.fn(),
		source: { positioning: { method: 'multiview', minViews: 7 } }
	};
	const view = render(ProcessingStepOptions, props);
	expect(view.getByLabelText('Maximum mesh vertices')).toBeTruthy();
	expect(view.queryByLabelText('Texture resolution')).toBeNull();
	expect((view.getByLabelText('Minimum supporting views') as HTMLInputElement).value).toBe('7');
	await view.rerender({
		...props,
		engine: 'meshroom',
		values: { positioning: { method: 'triangle' } }
	});
	expect(view.queryByLabelText('Maximum mesh vertices')).toBeNull();
	expect(view.getByLabelText('Texture resolution')).toBeTruthy();
	expect(view.queryByLabelText('Minimum supporting views')).toBeNull();
});
it('honors bounds, nullable resets and capture-relative exclusions', async () => {
	const onchange = vi.fn();
	const view = render(ProcessingStepOptions, {
		controls: controls as ProcessingControls,
		engine: 'odm',
		onchange
	});
	const interval = view.getByLabelText('Video sampling interval') as HTMLInputElement;
	await fireEvent.input(interval, { target: { value: '0.01' } });
	expect(interval.checkValidity()).toBe(false);
	const end = view.getByLabelText('Video end') as HTMLInputElement;
	await fireEvent.input(end, { target: { value: '' } });
	expect(onchange).toHaveBeenLastCalledWith({ preparing: { videoEndSeconds: null } });
	const paths = view.getByLabelText('Excluded files') as HTMLTextAreaElement;
	await fireEvent.input(paths, { target: { value: '../escape.jpg' } });
	expect(paths.checkValidity()).toBe(false);
	await fireEvent.input(paths, { target: { value: 'flight/skip.jpg\nflight/skip.srt' } });
	expect(paths.checkValidity()).toBe(true);
});
it('hides earlier steps when reusing their outputs', () => {
	const view = render(ProcessingStepOptions, {
		controls: controls as ProcessingControls,
		engine: 'odm',
		fromStep: 'positioning',
		onchange: vi.fn()
	});
	expect(view.queryByLabelText('Video sampling interval')).toBeNull();
	expect(view.queryByLabelText('Reconstruction quality')).toBeNull();
	expect(view.queryByLabelText('Minimum confidence')).toBeNull();
	expect(view.getByLabelText('Bolt placement method')).toBeTruthy();
});
