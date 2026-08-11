<script>
	import { provideTopo2DEditorState } from '$lib/state/topo-2d-editor-state.svelte.js';
	import PitchComponent from './PitchComponent.svelte';

	let { pitch, onFieldChange = null } = $props();
	provideTopo2DEditorState({ topo: { scale: 1, fixPoints: [] } });
</script>

<PitchComponent {pitch} {onFieldChange} />
