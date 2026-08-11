<script>
	import { provideTopoEditorSession } from '$lib/state/topo-session.svelte.js';
	import PitchComponent from './PitchComponent.svelte';

	let { pitch, onFieldChange = null } = $props();
	provideTopoEditorSession({ topo: { scale: 1, fixPoints: [] } });
</script>

<PitchComponent {pitch} {onFieldChange} />
