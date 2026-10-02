<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import {
		createTopo2DEditorState,
		provideTopo2DEditorState
	} from '$lib/state/topo-2d-editor-state.svelte.ts';
	import PitchComponent from './PitchComponent.svelte';

	type PitchProps = ComponentProps<typeof PitchComponent>;
	let {
		pitch,
		onFieldChange = () => {}
	}: { pitch: PitchProps['pitch']; onFieldChange?: PitchProps['onFieldChange'] } = $props();
	provideTopo2DEditorState(createTopo2DEditorState());
</script>

<PitchComponent {pitch} {onFieldChange} />
