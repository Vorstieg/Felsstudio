<script>
	import {
		createTopoEditorSession,
		provideTopoEditorSession
	} from '$lib/state/topo-session.svelte.js';
	import { createTopo2DEditorState } from '$lib/state/topo-2d-editor-state.svelte.js';
	import Topo2DEditor from './Topo2DEditor.svelte';

	let { topo } = $props();
	const session = createTopoEditorSession();
	// svelte-ignore state_referenced_locally
	session.loadSession({ topo });
	provideTopoEditorSession(session);
	const editorState = createTopo2DEditorState({
		getTopo: () => session.topo,
		setTopo: (next) => (session.topo = next),
		ui: session.ui
	});
</script>

<Topo2DEditor {editorState} />
