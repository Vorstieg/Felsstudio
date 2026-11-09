<script lang="ts">
	import ProcessingStepOptions from './ProcessingStepOptions.svelte';
	import { processingOptionsForRun } from '$lib/assets/js/processing-options';
	import { onMount, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { importProcessingResult } from '$lib/assets/js/import-processing-result';
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import { _ } from 'svelte-i18n';
	import { authState } from '$lib/api/auth.svelte';
	import {
		listCaptures,
		getCapture,
		createCapture,
		uploadCaptureFile,
		downloadCaptureFile,
		deleteCapture,
		listProcessing,
		getProcessingControls,
		type ProcessingControls,
		type ProcessingOptions,
		startProcessing,
		restartProcessing,
		type ProcessingStep,
		cancelProcessing,
		deleteProcessing,
		type Capture,
		type ProcessingRun,
		type ReconstructionEngine
	} from '$lib/api/processing';
	let {
		mode,
		scopedEntryPath = ''
	}: { mode: 'captures' | 'processing'; scopedEntryPath?: string } = $props();
	let restoredSelection = false;
	function workspaceHref(path: string) {
		const query = new URLSearchParams(page.url.search);
		if (selected) query.set('capture', selected);
		else query.delete('capture');
		const entry = scopedEntryPath
			? `/${scopedEntryPath.split('/').map(encodeURIComponent).join('/')}`
			: '';
		return `${base}/felslager/${path}${entry}${query.size ? `?${query}` : ''}`;
	}
	let entryPath = $state('');
	let name = $state('');
	let selected = $state('');
	let search = $state('');
	function size(bytes: number) {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
		if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
		return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
	}
	let captures = $state<Capture[]>([]);
	let detail = $state<Capture | null>(null);
	let jobs = $state<ProcessingRun[]>([]);
	let visibleCaptures = $derived(
		captures.filter((capture) =>
			`${capture.name} ${capture.entryPath}`.toLowerCase().includes(search.toLowerCase())
		)
	);
	let visibleJobs = $derived(selected ? jobs.filter((job) => job.captureId === selected) : jobs);
	let files = $state<File[]>([]);
	let uploaded = $state(0);
	let busy = $state(false);
	let error = $state('');
	let engine = $state<ReconstructionEngine>('odm');
	let detection = $state(false);
	let controls = $state<ProcessingControls | null>(null);
	let options = $state<ProcessingOptions>({});
	let restartOptions = $state<Record<string, ProcessingOptions>>({});
	let optionsForm = $state<{ validate: () => boolean }>();
	let restartForms = $state<Record<string, { validate: () => boolean } | undefined>>({});
	let restartSteps = $state<Record<string, ProcessingStep>>({});
	let restartEngines = $state<Record<string, ReconstructionEngine>>({});
	let restartDetection = $state<Record<string, boolean>>({});
	function reconstructionStep(job: ProcessingRun) {
		return ['preparing', 'reconstructing'].includes(
			restartSteps[job.id] || job.availableStartSteps?.[0] || ''
		);
	}

	const stages = new Set([
		'queued',
		'starting',
		'preparing',
		'uploading_to_odm',
		'reconstructing',
		'downloading',
		'detecting',
		'positioning',
		'finalizing',
		'completed',
		'failed',
		'cancelled',
		'cancelling'
	]);
	let skipExisting = $state(true);
	let timer: ReturnType<typeof setTimeout>;
	let disposed = false;
	let generation = 0;
	let user = $derived(authState.user?.id);
	$effect(() => {
		const identity = user;
		const scope = scopedEntryPath;
		untrack(() => {
			generation++;
			entryPath = scope;
			files = [];
			name = '';
			uploaded = 0;
			clearTimeout(timer);
			captures = [];
			jobs = [];
			detail = null;
			selected = '';
			restoredSelection = false;
			if (identity) void refresh();
		});
	});
	async function refresh() {
		clearTimeout(timer);
		const current = generation;
		try {
			const [library, runs, metadata] = await Promise.all([
				listCaptures(entryPath.trim()),
				listProcessing(entryPath.trim()),
				controls || getProcessingControls()
			]);
			if (disposed || current !== generation) return;
			controls = metadata;
			captures = library;
			jobs = runs;
			for (const job of runs) {
				if (!job.availableStartSteps?.includes(restartSteps[job.id])) delete restartSteps[job.id];
			}
			if (!restoredSelection) {
				restoredSelection = true;
				const id = page.url.searchParams.get('capture');
				if (id && library.some((capture) => capture.id === id)) {
					const capture = await getCapture(id);
					if (disposed || current !== generation) return;
					selected = id;
					detail = capture;
				}
			}
		} catch (cause) {
			if (current === generation) error = String(cause instanceof Error ? cause.message : cause);
		}
		if (!disposed && current === generation) timer = setTimeout(() => void refresh(), 4000);
	}
	async function act(action: () => Promise<void>) {
		if (!authState.requireAuth()) return;
		busy = true;
		error = '';
		try {
			await action();
		} catch (cause) {
			error = cause instanceof Error ? cause.message : String(cause);
		} finally {
			busy = false;
			if (!disposed && authState.user) await refresh();
		}
	}
	async function choose(id: string) {
		selected = id;
		detail = null;
		files = [];
		name = '';
		uploaded = 0;
		if (id)
			await act(async () => {
				detail = await getCapture(id);
			});
	}
	function selectFiles(event: Event & { currentTarget: HTMLInputElement }) {
		files = Array.from(event.currentTarget.files || []);
		uploaded = 0;
		event.currentTarget.value = '';
	}
	async function upload() {
		await act(async () => {
			if (!selected) {
				const capture = await createCapture(entryPath.trim(), name.trim());
				selected = capture.id;
				detail = capture;
			}
			const capture = await getCapture(selected);
			const existing = new Set(capture.files?.map((file) => file.path));
			for (let index = uploaded; index < files.length; index++) {
				if (disposed) return;
				const file = files[index];
				const path = file.webkitRelativePath || file.name;
				if (!skipExisting || !existing.has(path)) await uploadCaptureFile(selected, path, file);
				uploaded = index + 1;
			}
			detail = await getCapture(selected);
			files = [];
			uploaded = 0;
		});
	}
	async function run(captureId = selected) {
		if (!controls || !optionsForm?.validate()) return;
		await act(async () => {
			await startProcessing(
				captureId,
				engine,
				detection,
				name.trim() || undefined,
				undefined,
				processingOptionsForRun(controls!, options, {}, 'preparing', engine)
			);
		});
	}
	async function importRun(id: string) {
		await act(async () => {
			const result = await importProcessingResult(id, page.url.searchParams.get('draft'));
			await goto(`${base}/topos/3d/editor?draft=${encodeURIComponent(result.id)}`);
		});
	}
	async function download(path: string) {
		await act(async () => {
			const blob = await downloadCaptureFile(selected, path);
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = path.split('/').pop()!;
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
		});
	}
	onMount(() => {
		void authState.refresh();
		return () => {
			disposed = true;
			generation++;
			clearTimeout(timer);
		};
	});
</script>

<div class="processing-studio reconstruction">
	<header class="studio-header">
		<h1>{$_('processing.captures_title')}</h1>
		{#if entryPath}<dl class="crag-context">
				<dt>{$_('processing.entry_path')}</dt>
				<dd>{entryPath}</dd>
			</dl>{/if}
	</header>
	{#if !authState.user}
		<div class="signed-out">
			<h2>{$_('processing.captures_title')}</h2>
			<p>{$_('processing.captures_description')}</p>
			<button class="reconstruction-primary" onclick={() => authState.requireAuth()}
				>{$_('bolt_reconstruction.sign_in')}</button
			>
		</div>
	{:else}
		<div class="studio-layout">
			<aside class="capture-library" aria-label={$_('processing.library')}>
				<div class="library-heading">
					<h2>{$_('processing.library')}</h2>
					<span>{captures.length}</span>
				</div>
				<button
					class="new-capture"
					disabled={busy}
					onclick={() => {
						void choose('');
						if (mode === 'processing') void goto(workspaceHref('captures'));
					}}
					><i class="fa-solid fa-plus" aria-hidden="true"></i>{$_('processing.new_capture')}</button
				>
				<label class="library-search"
					><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input
						bind:value={search}
						placeholder={$_('processing.search')}
						aria-label={$_('processing.search')}
					/></label
				>
				<div class="capture-list">
					{#each visibleCaptures as capture}
						{@const latest = jobs.find((job) => job.captureId === capture.id)}
						<button
							class="capture-item"
							class:active={selected === capture.id}
							aria-pressed={selected === capture.id}
							disabled={busy}
							onclick={() => void choose(capture.id)}
						>
							<span class="capture-icon"
								><i class="fa-regular fa-images" aria-hidden="true"></i></span
							>
							<span class="capture-copy"
								><strong>{capture.name}</strong><span
									>{capture.uploadedCount || 0}
									{$_('processing.files')} · {size(capture.totalBytes)}</span
								>{#if latest}<span class="capture-status" data-status={latest.status}
										>{$_(
											`bolt_reconstruction.status_${latest.cancelRequested ? 'cancelling' : latest.status}`
										)}</span
									>{/if}</span
							>
						</button>
					{:else}<p class="library-empty">{$_('processing.no_captures')}</p>{/each}
				</div>
			</aside>
			<main class="capture-workspace">
				<div class="workspace-heading">
					<span class="eyebrow">{$_('processing.capture')}</span>
					<h2>
						{detail?.name || $_(mode === 'captures' ? 'processing.new_capture' : 'processing.runs')}
					</h2>
					<p>
						{$_(mode === 'captures' ? 'processing.captures_description' : 'processing.description')}
					</p>
				</div>
				<nav class="workspace-tabs" aria-label={$_('processing.title')}>
					<a
						aria-current={mode === 'captures' ? 'page' : undefined}
						data-sveltekit-noscroll
						href={workspaceHref('captures')}>{$_('processing.originals')}</a
					>
					<a
						aria-current={mode === 'processing' ? 'page' : undefined}
						aria-label={$_('processing.title')}
						data-sveltekit-noscroll
						href={workspaceHref('reconstruct')}
						>{$_('processing.title')}<span>{visibleJobs.length}</span></a
					>
				</nav>
				{#if error}<p role="alert" class="workspace-error">{error}</p>{/if}
				{#if mode === 'captures'}
					<section class="reconstruction-panel mt-6 space-y-4 bg-white p-6">
						{#if !scopedEntryPath && !selected}<label class="block text-ui-label"
								>{$_('processing.entry_path')}<input
									class="reconstruction-input mt-2 w-full"
									bind:value={entryPath}
									disabled={busy}
								/></label
							>{/if}
						{#if !selected}<label class="block text-ui-label"
								>{$_('bolt_reconstruction.name')}<input
									class="reconstruction-input mt-2 w-full"
									bind:value={name}
									disabled={busy}
								/></label
							>{/if}
						<div class="upload-zone" class:compact-upload={!!detail?.files?.length}>
							<i class="fa-solid fa-arrow-up-from-bracket" aria-hidden="true"></i>
							<h3>{$_('processing.add_media')}</h3>
							<p>{$_('processing.media')}</p>
							<div class="upload-choices">
								<label class="file-choice"
									>{$_('processing.browse_files')}<input
										type="file"
										multiple
										onchange={selectFiles}
										disabled={busy}
										aria-label={$_('processing.media')}
									/></label
								>
								<label class="file-choice secondary-choice"
									>{$_('bolt_reconstruction.folder')}<input
										type="file"
										multiple
										webkitdirectory
										onchange={selectFiles}
										disabled={busy}
										aria-label={$_('bolt_reconstruction.folder')}
									/></label
								>
							</div>
						</div>
						{#if files.length}<div class="selection-summary">
								<span>{files.length} {$_('processing.files')}</span><span
									>{size(files.reduce((total, file) => total + file.size, 0))}</span
								>
							</div>{/if}

						{#if files.length}
							<label class="block text-body-text"
								><input type="checkbox" bind:checked={skipExisting} disabled={busy} />
								{$_('processing.skip_existing')}</label
							>
							<p class="text-micro-data" aria-live="polite">
								{uploaded}/{files.length}
								{$_('processing.files')}
							</p>
							<button
								class="reconstruction-primary"
								disabled={busy ||
									!files.length ||
									(!selected && (!entryPath.trim() || !name.trim()))}
								onclick={upload}>{$_('processing.upload')}</button
							>
						{/if}
						{#if detail}
							<div class="section-heading">
								<h2 class="text-section-title">{$_('processing.originals')}</h2>
								<span
									>{detail.uploadedCount || 0}
									{$_('processing.files')} · {size(detail.totalBytes)}</span
								>
							</div>
							<ul class="file-list text-body-text">
								{#each detail.files || [] as file}<li>
										<button class="underline" disabled={busy} onclick={() => download(file.path)}
											><i class="fa-regular fa-file" aria-hidden="true"></i><span>{file.path}</span
											><span class="file-size">{size(file.bytes)}</span><i
												class="fa-solid fa-arrow-down"
												aria-hidden="true"
											></i></button
										>
									</li>{/each}
							</ul>
							<button
								class="text-body-text text-rose-700 underline"
								disabled={busy || !!detail.activeJobIds?.length}
								onclick={() => {
									if (confirm($_('processing.delete_capture_confirm')))
										void act(async () => {
											await deleteCapture(selected);
											selected = '';
											detail = null;
										});
								}}>{$_('processing.delete_capture')}</button
							>
						{/if}
					</section>
				{/if}

				{#if mode === 'processing'}
					<section class="reconstruction-panel mt-6 bg-white p-6">
						<h2 class="text-section-title">{$_('processing.runs')}</h2>
						{#if !visibleJobs.length}<p class="py-4 text-body-text">
								{$_('bolt_reconstruction.no_jobs')}
							</p>{/if}
						{#each visibleJobs as job (job.id)}
							<article class="run-card space-y-2" data-status={job.status}>
								<h3 class="text-ui-label">{job.name}</h3>
								<p class="text-micro-data">
									{job.entryPath} · {job.engine} · {$_(
										`bolt_reconstruction.status_${job.cancelRequested ? 'cancelling' : job.status}`
									)}
								</p>
								{#if job.runBoltDetection}
									<p class="text-micro-data">
										{$_('processing.detection')} · {$_(
											`processing.placement_${job.boltPlacementMethod || 'triangle'}`
										)}
									</p>
								{/if}
								<p class="text-body-text" aria-live="polite">
									{stages.has(job.stage) ? $_(`processing.stage_${job.stage}`) : job.stage} · {job.progress}%
									{#if job.status === 'processing' && !job.cancelRequested && job.stageCurrent !== undefined && job.stageTotal !== undefined}
										· {job.stageCurrent} / {job.stageTotal}
									{/if}
								</p>
								{#if job.status === 'processing'}<progress
										aria-label={$_('processing.progress')}
										class="h-2 w-full accent-creator-blue"
										value={job.progress}
										max="100"
									></progress>{/if}
								{#if job.error}<p class="text-body-text text-rose-700">{job.error}</p>{/if}
								{#if job.sourceProcessingId}
									<p class="text-micro-data text-warm-gray-500">
										{$_('processing.restart_origin')} · {$_(
											`processing.stage_${job.startStep || 'preparing'}`
										)}
									</p>
								{/if}
								{#if ['completed', 'failed', 'cancelled'].includes(job.status)}
									<details class="advanced space-y-2">
										<summary>{$_('processing.advanced')}</summary>
										<label class="block text-ui-label">
											{$_('processing.restart_step')}
											<select
												class="reconstruction-input mt-2 w-full"
												value={restartSteps[job.id] || job.availableStartSteps?.[0] || ''}
												disabled={busy || !job.availableStartSteps?.length}
												onchange={(event) =>
													(restartSteps[job.id] = event.currentTarget.value as ProcessingStep)}
											>
												{#each job.availableStartSteps || [] as step}
													<option value={step}>{$_(`processing.stage_${step}`)}</option>
												{/each}
											</select>
										</label>
										{#if reconstructionStep(job)}
											<label class="block text-ui-label">
												{$_('bolt_reconstruction.engine')}
												<select
													class="reconstruction-input mt-2 w-full"
													value={restartEngines[job.id] || job.engine}
													disabled={busy || !job.availableStartSteps?.length}
													onchange={(event) =>
														(restartEngines[job.id] = event.currentTarget
															.value as ReconstructionEngine)}
												>
													<option value="odm">ODM</option>
													<option value="meshroom">Meshroom</option>
													<option value="realityscan">RealityScan</option>
												</select>
											</label>
											<label class="block text-body-text">
												<input
													type="checkbox"
													checked={restartDetection[job.id] ?? job.runBoltDetection}
													disabled={busy || !job.availableStartSteps?.length}
													onchange={(event) =>
														(restartDetection[job.id] = event.currentTarget.checked)}
												/>
												{$_('processing.detection')}
											</label>
										{:else if job.availableStartSteps?.length}
											<p class="text-body-text text-warm-gray-500">
												{$_('processing.restart_detection_required')}
											</p>
										{/if}

										{#if controls}
											<ProcessingStepOptions
												{controls}
												bind:this={restartForms[job.id]}
												values={restartOptions[job.id] || {}}
												source={job.options || {
													positioning: { method: job.boltPlacementMethod || 'triangle' }
												}}
												fromStep={restartSteps[job.id] ||
													job.availableStartSteps?.[0] ||
													'preparing'}
												engine={reconstructionStep(job)
													? restartEngines[job.id] || job.engine
													: job.engine}
												detection={reconstructionStep(job)
													? (restartDetection[job.id] ?? job.runBoltDetection)
													: true}
												disabled={busy || !job.availableStartSteps?.length}
												onchange={(values) => (restartOptions[job.id] = values)}
											/>
										{/if}

										<p class="text-body-text text-warm-gray-500">
											{$_(
												job.availableStartSteps?.length
													? 'processing.restart_hint'
													: 'processing.restart_unavailable'
											)}
										</p>
										<button
											class="reconstruction-primary"
											disabled={busy || !job.availableStartSteps?.length}
											onclick={() => {
												if (!controls || !restartForms[job.id]?.validate()) return;
												void act(async () => {
													await restartProcessing(job.id, {
														fromStep: restartSteps[job.id] || job.availableStartSteps![0],
														...(reconstructionStep(job)
															? {
																	engine: restartEngines[job.id] || job.engine,
																	runBoltDetection: restartDetection[job.id] ?? job.runBoltDetection
																}
															: {}),
														options: processingOptionsForRun(
															controls!,
															restartOptions[job.id] || {},
															job.options,
															restartSteps[job.id] || job.availableStartSteps![0],
															reconstructionStep(job)
																? restartEngines[job.id] || job.engine
																: job.engine
														)
													});
												});
											}}>{$_('processing.restart')}</button
										>
									</details>
								{/if}
								<div class="flex flex-wrap gap-2">
									{#if ['queued', 'processing'].includes(job.status)}
										<button
											class="reconstruction-secondary"
											disabled={busy || job.cancelRequested}
											onclick={() =>
												act(async () => {
													await cancelProcessing(job.id);
												})}>{$_('bolt_reconstruction.cancel')}</button
										>
									{:else}
										<button
											class="reconstruction-secondary"
											disabled={busy}
											onclick={() => {
												if (confirm($_('processing.delete_run_confirm')))
													void act(async () => {
														const { preserveProcessingImports } =
															await import('$lib/assets/js/processing-assets');
														await preserveProcessingImports(job.id);
														await deleteProcessing(job.id);
													});
											}}>{$_('processing.delete_run')}</button
										>
									{/if}
									{#if job.status === 'completed'}<button
											class="reconstruction-primary"
											disabled={busy}
											onclick={() => importRun(job.id)}>{$_('processing.import')}</button
										>{/if}
								</div>
							</article>
						{/each}
					</section>
				{/if}
			</main>
			<aside class="processing-inspector" aria-label={$_('processing.start')}>
				<section class="reconstruction-panel mt-6 space-y-4 bg-white p-6">
					<h2 class="text-section-title">{$_('processing.reconstruct')}</h2>
					<div class="source-summary">
						<i class="fa-solid fa-layer-group" aria-hidden="true"></i>
						<div>
							<span class="text-ui-label">{$_('processing.capture')}</span>
							<p>{detail?.name || $_('processing.select_capture')}</p>
						</div>
					</div>
					<label class="block text-ui-label"
						>{$_('bolt_reconstruction.engine')}<select
							class="reconstruction-input mt-2 w-full"
							bind:value={engine}
							disabled={busy}
							><option value="odm">ODM</option><option value="meshroom">Meshroom</option><option
								value="realityscan">RealityScan</option
							></select
						></label
					>
					<label class="block text-body-text"
						><input type="checkbox" bind:checked={detection} disabled={busy} />
						{$_('processing.detection')}</label
					>
					{#if controls}
						<ProcessingStepOptions
							{controls}
							bind:this={optionsForm}
							values={options}
							{engine}
							{detection}
							disabled={busy}
							onchange={(values) => (options = values)}
						/>
					{/if}

					<p class="text-body-text text-warm-gray-500">{$_('processing.run_hint')}</p>
					<button
						class="reconstruction-primary"
						disabled={busy || !controls || !selected || !!files.length}
						onclick={() => run()}>{$_('processing.start')}</button
					>
				</section>
			</aside>
		</div>
	{/if}
</div>

<style>
	.processing-studio {
		height: 100%;
		overflow: auto;
		background: #f6f5f4;
		color: #191817;
		font-family: var(--font-sans);
	}
	.studio-header {
		min-height: 68px;
		display: flex;
		align-items: center;
		gap: 24px;
		padding: 16px 24px;
		border-bottom: 1px solid #dedbd7;
		background: white;
	}
	.studio-header h1 {
		font-size: 16px;
		font-weight: 700;
	}
	.crag-context {
		margin-left: auto;
		text-align: right;
		font-size: 12px;
	}
	.crag-context dt {
		color: #615d59;
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.crag-context dd {
		overflow-wrap: anywhere;
	}
	.studio-layout {
		display: grid;
		grid-template-columns: 250px minmax(0, 1fr) 310px;
		min-height: calc(100% - 69px);
	}
	.capture-library {
		padding: 24px 16px;
		border-right: 1px solid #dedbd7;
	}
	.library-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 20px;
		font-size: 13px;
		font-weight: 600;
	}
	.library-heading > span {
		color: #615d59;
		font-size: 11px;
	}
	.new-capture {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		width: 100%;
		min-height: 40px;
		background: white;
		border: 1px solid #c9c5c0;
		font-size: 12px;
		font-weight: 600;
	}
	.new-capture:hover {
		border-color: #0075de;
		color: #0075de;
	}
	.library-search {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 0;
		margin: 16px 0 8px;
		border-bottom: 1px solid #dedbd7;
		color: #a39e98;
		font-size: 12px;
	}
	.library-search input {
		width: 100%;
		min-width: 0;
		background: transparent;
		color: #191817;
		outline-offset: 4px;
	}
	.capture-item {
		width: 100%;
		display: flex;
		gap: 12px;
		padding: 16px 12px;
		text-align: left;
		border: 1px solid transparent;
		border-left: 2px solid transparent;
	}
	.capture-item:hover {
		background: #eeece9;
	}
	.capture-item.active {
		background: white;
		border-color: #dedbd7;
		border-left-color: #0075de;
	}
	.capture-icon {
		display: grid;
		place-items: center;
		width: 32px;
		height: 36px;
		flex-shrink: 0;
		background: #eeece9;
		color: #615d59;
	}
	.capture-copy {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 5px;
	}
	.capture-copy strong {
		overflow-wrap: anywhere;
		font-size: 13px;
		font-weight: 600;
	}
	.capture-copy > span {
		font-size: 11px;
		color: #615d59;
	}
	.capture-copy .capture-status {
		color: #0075de;
	}
	.capture-copy .capture-status[data-status='completed'] {
		color: #327052;
	}
	.capture-copy .capture-status[data-status='failed'] {
		color: #be123c;
	}
	.library-empty {
		margin-top: 24px;
		color: #615d59;
		font-size: 12px;
		line-height: 1.7;
	}
	.capture-workspace {
		min-width: 0;
		padding: 32px clamp(20px, 3vw, 48px);
		background: white;
	}
	.eyebrow {
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #615d59;
	}
	.workspace-heading h2 {
		margin: 8px 0;
		font-size: 28px;
		font-weight: 700;
		letter-spacing: -0.8px;
		overflow-wrap: anywhere;
	}
	.workspace-heading p {
		color: #615d59;
		font-size: 13px;
		line-height: 1.6;
	}
	.workspace-tabs {
		display: flex;
		gap: 24px;
		margin-top: 28px;
		border-bottom: 1px solid #dedbd7;
	}
	.workspace-tabs a {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 0;
		margin-bottom: -1px;
		border-bottom: 2px solid transparent;
		color: #615d59;
		font-size: 12px;
		font-weight: 600;
	}
	.workspace-tabs a[aria-current='page'] {
		color: #191817;
		border-color: #0075de;
	}
	.workspace-tabs span {
		font-size: 10px;
		background: #eeece9;
		padding: 2px 5px;
	}
	.reconstruction-panel {
		border: 0 !important;
		padding: 24px 0 !important;
		margin-top: 0 !important;
	}
	.processing-inspector {
		padding: 8px 24px 24px;
		border-left: 1px solid #dedbd7;
	}
	.processing-inspector .reconstruction-panel {
		background: transparent;
	}
	.processing-inspector .reconstruction-primary {
		width: 100%;
	}
	.source-summary {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px 0;
		border-bottom: 1px solid #dedbd7;
		margin-bottom: 24px;
	}
	.source-summary > i {
		color: #a39e98;
	}
	.source-summary .text-ui-label {
		font-size: 10px;
		color: #615d59;
	}
	.source-summary p {
		font-size: 13px;
		font-weight: 600;
		overflow-wrap: anywhere;
		margin-top: 4px;
	}
	.upload-zone {
		padding: 32px 16px;
		text-align: center;
		border: 1px dashed #c9c5c0;
		background: #faf9f8;
	}
	.compact-upload {
		padding: 20px 16px;
	}
	.compact-upload > i {
		display: none;
	}
	.upload-zone > i {
		font-size: 24px;
		color: #a39e98;
		margin-bottom: 16px;
	}
	.upload-zone h3 {
		font-size: 15px;
		font-weight: 600;
	}
	.upload-zone p {
		color: #615d59;
		margin-top: 8px;
		font-size: 12px;
	}
	.upload-choices {
		display: flex;
		justify-content: center;
		gap: 8px;
		margin-top: 24px;
		flex-wrap: wrap;
	}
	.file-choice {
		position: relative;
		overflow: hidden;
		padding: 10px 16px;
		background: #191817;
		color: white;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
	}
	.file-choice input {
		position: absolute;
		inset: 0;
		opacity: 0;
		width: 100%;
		height: 100%;
		cursor: pointer;
	}
	.file-choice:focus-within {
		outline: 2px solid #0075de;
		outline-offset: 3px;
	}
	.secondary-choice {
		background: white;
		color: #191817;
		border: 1px solid #c9c5c0;
	}
	.selection-summary,
	.section-heading {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 12px;
		font-size: 11px;
		color: #615d59;
	}
	.section-heading {
		padding-top: 24px;
		border-top: 1px solid #dedbd7;
	}
	.reconstruction .section-heading h2 {
		font-size: 15px;
		color: #191817;
	}
	.file-list {
		list-style: none;
		padding: 0;
		max-height: 320px;
		overflow-y: auto;
	}
	.file-list li {
		border-bottom: 1px solid #eeece9;
	}
	.file-list button {
		display: flex;
		width: 100%;
		align-items: center;
		gap: 12px;
		padding: 12px 4px;
		text-decoration: none;
		text-align: left;
		font-size: 12px;
	}
	.file-list button:hover {
		color: #0075de;
	}
	.file-list button > span:first-of-type {
		overflow-wrap: anywhere;
		min-width: 0;
	}
	.file-list i {
		color: #a39e98;
		font-size: 11px;
	}
	.file-size {
		margin-left: auto;
		color: #615d59;
		font-size: 10px;
		white-space: nowrap;
	}
	.run-card {
		margin-top: 16px;
		padding: 20px;
		border: 1px solid #dedbd7;
		border-left: 3px solid #a39e98;
	}
	.run-card[data-status='processing'],
	.run-card[data-status='queued'] {
		border-left-color: #0075de;
	}
	.run-card[data-status='completed'] {
		border-left-color: #327052;
	}
	.run-card[data-status='failed'] {
		border-left-color: #be123c;
	}
	.run-card progress {
		display: block;
		width: 100%;
		height: 4px;
		border: 0;
		border-radius: 0;
		appearance: none;
		background: #eeece9;
		color: #0075de;
	}
	.run-card progress::-webkit-progress-bar {
		background: #eeece9;
	}
	.run-card progress::-webkit-progress-value {
		background: #0075de;
	}
	.run-card progress::-moz-progress-bar {
		background: #0075de;
	}
	.advanced {
		padding: 12px;
		border: 1px solid #dedbd7;
		background: #f6f5f4;
	}
	.advanced summary {
		cursor: pointer;
		font-size: 12px;
		font-weight: 600;
	}
	.advanced[open] summary {
		margin-bottom: 16px;
	}
	.workspace-error {
		margin-top: 20px;
		border-left: 3px solid #be123c;
		background: #fff1f2;
		padding: 12px;
		font-size: 13px;
		color: #9f1239;
	}
	.signed-out {
		max-width: 480px;
		margin: 80px auto;
		padding: 24px;
	}
	.signed-out h2 {
		font-size: 28px;
		font-weight: 700;
	}
	.signed-out p {
		margin: 16px 0 24px;
		color: #615d59;
	}
	@media (min-width: 1500px) {
		.studio-layout {
			grid-template-columns: 280px minmax(0, 1fr) 340px;
		}
	}
	@media (max-width: 1100px) {
		.studio-layout {
			grid-template-columns: 210px minmax(0, 1fr);
		}
		.processing-inspector {
			grid-column: 2;
			border-top: 1px solid #dedbd7;
			padding: 0 24px 24px;
		}
		.capture-library {
			grid-row: 1 / 3;
		}
	}
	@media (max-width: 640px) {
		.studio-header {
			gap: 12px;
			padding: 16px;
			flex-wrap: wrap;
		}
		.crag-context {
			width: 100%;
			text-align: left;
		}
		.studio-layout {
			display: flex;
			flex-direction: column;
		}
		.capture-library {
			border-right: 0;
			border-bottom: 1px solid #dedbd7;
			padding: 16px;
		}
		.capture-list {
			max-height: 200px;
			overflow-y: auto;
		}
		.library-heading {
			margin-bottom: 12px;
		}
		.capture-workspace {
			padding: 24px 16px;
		}
		.processing-inspector {
			border-left: 0;
			padding: 0 16px 24px;
		}
	}

	.reconstruction .text-section-title {
		font-size: 22px;
		font-weight: 700;
		letter-spacing: -0.25px;
	}
	.reconstruction .text-ui-label {
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.125px;
	}
	.reconstruction .text-body-text {
		font-size: 14px;
		font-weight: 400;
	}
	.reconstruction .text-micro-data {
		font-size: 11px;
		font-weight: 500;
	}
	.reconstruction-panel {
		border: 1px solid rgba(0, 0, 0, 0.1);
		border-radius: 0;
	}
	.reconstruction-input {
		border: 1px solid rgba(0, 0, 0, 0.1);
		border-radius: 2px;
		background: rgba(0, 0, 0, 0.05);
		padding: 8px;
		color: rgba(0, 0, 0, 0.95);
		font: 400 13px var(--font-sans);
		letter-spacing: normal;
		text-transform: none;
	}
	.reconstruction-primary,
	.reconstruction-secondary {
		min-height: 40px;
		padding: 8px 16px;
		border-radius: 2px;
		font-size: 13px;
		font-weight: 600;
	}
	.reconstruction-primary {
		background: var(--color-creator-blue);
		color: white;
	}
	.reconstruction-primary:hover:not(:disabled) {
		background: var(--color-creator-blue-active);
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
	}
	.reconstruction-secondary {
		border: 1px solid rgba(0, 0, 0, 0.1);
		background: var(--color-warm-white);
	}
	.reconstruction-secondary:hover {
		background: rgba(0, 0, 0, 0.05);
	}
	.reconstruction-input:focus-visible,
	.reconstruction button:focus-visible,
	.reconstruction a:focus-visible {
		outline: 2px solid var(--color-creator-blue);
		outline-offset: 2px;
	}
	.reconstruction :disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
</style>
