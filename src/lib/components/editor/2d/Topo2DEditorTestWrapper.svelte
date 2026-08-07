<script>
	import { createTopoEditorSession, provideTopoEditorSession } from '$lib/state/topo-session.svelte.js';
	import Topo2DEditor from './Topo2DEditor.svelte';

	let { topo } = $props();
	const session = createTopoEditorSession();
	// svelte-ignore state_referenced_locally
	session.loadSession({ topo });
	provideTopoEditorSession(session);

	let activeTool = $state('select');
	let drawingTarget = $state(null);
	let hasPendingChanges = $state(false);
</script>

<Topo2DEditor bind:activeTool bind:drawingTarget bind:hasPendingChanges />
