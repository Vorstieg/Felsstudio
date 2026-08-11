<script>
	import { getTopo2DEditorState } from '$lib/state/topo-2d-editor-state.svelte.js';
	const editorState = getTopo2DEditorState();
	let topo = $derived(editorState.topo);
	import { isTouchDevice } from '$lib/assets/js/mobile-utils.js';
	import { _ } from 'svelte-i18n';

	let fileInput = $state(null);
	let cameraInput = $state(null);
	let urlInput = $state('');
	let showUrlInput = $state(false);
	let isDragging = $state(false);
	let hasEstablishedCanvas = $state(false);
	$effect(() => {
		if (topo.image2D) hasEstablishedCanvas = true;
	});

	/**
	 * The topo canvas is a stable coordinate system. A replacement image must not
	 * redefine it, otherwise every existing route and outline appears stretched.
	 */
	function setBackgroundImage(imageData, imageAspectRatio) {
		const update = (document) => {
			const hasCanvasAspectRatio =
				Number.isFinite(document.canvasAspectRatio) && document.canvasAspectRatio > 0;
			const hasBackground = Boolean(document.image2D);
			const hasAnnotations = [
				document.routes,
				document.outlines,
				document.fixPoints,
				document.textLabels
			].some((items) => Array.isArray(items) && items.length > 0);

			if (!hasBackground && !hasAnnotations && !hasEstablishedCanvas) {
				// A first image may define a genuinely blank topo's canvas.
				document.canvasAspectRatio = imageAspectRatio;
			} else if (!hasCanvasAspectRatio) {
				const legacyAspectRatio = Number(document.imageAspectRatio);
				document.canvasAspectRatio =
					hasBackground && Number.isFinite(legacyAspectRatio) && legacyAspectRatio > 0
						? legacyAspectRatio
						: imageAspectRatio;
			}

			// This remains metadata about the image itself; only canvasAspectRatio is stable.
			document.imageAspectRatio = imageAspectRatio;
			if (!document.backgroundFit) document.backgroundFit = 'contain';
			document.image2D = imageData;
			return true;
		};
		editorState.commit('Update background image', update);
		hasEstablishedCanvas = true;
	}

	function handleFileSelect(event) {
		const file = event.target.files?.[0];
		if (!file) return;
		loadImageFile(file);
		event.target.value = '';
	}

	function loadImageFile(file) {
		if (!file.type.startsWith('image/')) {
			alert($_('ui.select_image_file'));
			return;
		}

		const reader = new FileReader();
		reader.onload = (e) => {
			const img = new Image();
			img.onload = () => {
				setBackgroundImage(e.target.result, img.width / img.height);
			};
			img.src = e.target.result;
		};
		reader.readAsDataURL(file);
	}

	function handleUrlLoad() {
		if (!urlInput.trim()) return;

		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => {
			const canvas = document.createElement('canvas');
			canvas.width = img.width;
			canvas.height = img.height;
			const ctx = canvas.getContext('2d');
			ctx.drawImage(img, 0, 0);
			setBackgroundImage(canvas.toDataURL(), img.width / img.height);
			showUrlInput = false;
			urlInput = '';
		};
		img.onerror = () => {
			alert($_('ui.image_load_error'));
		};
		img.src = urlInput;
	}

	function handleDrop(event) {
		event.preventDefault();
		isDragging = false;
		const file = event.dataTransfer.files?.[0];
		if (file) loadImageFile(file);
	}

	function handleDragOver(event) {
		event.preventDefault();
		isDragging = true;
	}

	function handleDragLeave() {
		isDragging = false;
	}

	function removeImage() {
		editorState.updateNestedPath('image2D', null);
		showUrlInput = false;
	}

	async function handleCameraCapture() {
		if (isTouchDevice()) {
			cameraInput?.click();
			return;
		}

		// Desktop: Use webcam modal (restored logic)
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: 'environment' }
			});

			const video = document.createElement('video');
			video.srcObject = stream;
			video.play();

			// Create a simple modal for camera preview
			const modal = document.createElement('div');
			modal.style.cssText =
				'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;';

			video.style.cssText = 'max-width:90%;max-height:80%;';
			modal.appendChild(video);

			const captureBtn = document.createElement('button');
			captureBtn.textContent = $_('ui.capture_photo');
			captureBtn.style.cssText = 'margin-top:20px;padding:10px 20px;font-size:16px;';
			captureBtn.onclick = () => {
				const canvas = document.createElement('canvas');
				canvas.width = video.videoWidth;
				canvas.height = video.videoHeight;
				canvas.getContext('2d').drawImage(video, 0, 0);
				setBackgroundImage(canvas.toDataURL(), canvas.width / canvas.height);
				stream.getTracks().forEach((track) => track.stop());
				document.body.removeChild(modal);
			};
			modal.appendChild(captureBtn);

			const cancelBtn = document.createElement('button');
			cancelBtn.textContent = $_('ui.cancel');
			cancelBtn.style.cssText = 'margin-top:10px;padding:10px 20px;';
			cancelBtn.onclick = () => {
				stream.getTracks().forEach((track) => track.stop());
				document.body.removeChild(modal);
			};
			modal.appendChild(cancelBtn);

			document.body.appendChild(modal);
		} catch (err) {
			alert($_('ui.camera_access_failed') + ': ' + err.message);
		}
	}
</script>

{#if topo.image2D}
	<div class="panel p-2.5 mb-2 shadow-sm border border-black/15">
		<div class="flex items-center justify-between mb-2">
			<h4 class="text-ui-label text-near-black !m-0">{$_('ui.background_image')}</h4>
			<button
				class="text-rose-600 hover:text-rose-700 text-micro-data font-bold uppercase transition-none"
				onclick={removeImage}
			>
				<i class="fa-solid fa-trash-can mr-1"></i>
				{$_('ui.remove')}
			</button>
		</div>
		<div class="relative group">
			<img
				src={topo.image2D}
				alt="Topo background"
				class="w-full rounded-sm border border-black/10"
			/>
			<div
				class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-none flex items-center justify-center pointer-events-none"
			>
				<span class="text-white text-micro-data font-bold uppercase"
					>{$_('ui.background_image')}</span
				>
			</div>
		</div>
		<div class="mt-2 space-y-1.5">
			<div class="flex gap-1.5">
				<button
					class="btn-primary flex-1 !bg-white !text-near-black border border-black/15 hover:!bg-black/5"
					onclick={() => fileInput?.click()}
				>
					<i class="fa-solid fa-arrow-right-arrow-left mr-2 opacity-60"></i>{$_('ui.replace_image')}
				</button>
				<button
					class="btn-primary !bg-white !text-near-black border border-black/15 hover:!bg-black/5"
					onclick={() => (showUrlInput = !showUrlInput)}
					aria-label={$_('ui.load_url')}
				>
					<i class="fa-solid fa-link opacity-60"></i>
				</button>
				<button
					class="btn-primary !bg-white !text-near-black border border-black/15 hover:!bg-black/5"
					onclick={handleCameraCapture}
					aria-label={$_('ui.camera')}
				>
					<i class="fa-solid fa-camera opacity-60"></i>
				</button>
			</div>
			<div class="flex items-center justify-between gap-2">
				<label for="background-fit" class="text-micro-data text-warm-gray-500"
					>{$_('ui.background_fit')}</label
				>
				<select
					id="background-fit"
					class="input-studio !w-auto !py-1 text-micro-data"
					value={topo.backgroundFit ?? 'contain'}
					onchange={(event) => {
						editorState.updateNestedPath('backgroundFit', event.currentTarget.value);
					}}
				>
					<option value="contain">{$_('ui.fit_contain')}</option>
					<option value="cover">{$_('ui.fit_cover')}</option>
				</select>
			</div>
			{#if showUrlInput}
				<div class="flex flex-col gap-1.5 pt-1">
					<input
						type="text"
						bind:value={urlInput}
						placeholder={$_('ui.image_url_placeholder')}
						class="input-studio w-full"
					/>
					<button class="btn-primary w-full" onclick={handleUrlLoad}>{$_('ui.load')}</button>
				</div>
			{/if}
		</div>
	</div>
{:else}
	<div class="panel p-2.5 mb-2 shadow-sm border border-black/15 bg-white">
		<h4 class="text-ui-label text-near-black mb-2.5">{$_('ui.load_background')}</h4>

		<div
			class="border border-dashed rounded-sm p-4 text-center transition-none {isDragging
				? 'border-creator-blue bg-creator-blue/5'
				: 'border-black/15 bg-black/5'}"
			ondrop={handleDrop}
			ondragover={handleDragOver}
			ondragleave={handleDragLeave}
			role="region"
			aria-label={$_('ui.drag_drop_image')}
		>
			<i class="fa-solid fa-image text-2xl text-warm-gray-300 mb-2"></i>
			<p class="text-micro-data text-warm-gray-500 mb-3">{$_('ui.drag_drop_image')}</p>

			<div class="flex flex-col gap-1.5">
				<button
					class="btn-primary !bg-white !text-near-black border border-black/15 hover:!bg-black/5"
					onclick={() => fileInput?.click()}
				>
					<i class="fa-solid fa-folder-open mr-2 opacity-60"></i>{$_('ui.select_file')}
				</button>

				<button
					class="btn-primary !bg-white !text-near-black border border-black/15 hover:!bg-black/5"
					onclick={() => (showUrlInput = !showUrlInput)}
				>
					<i class="fa-solid fa-link mr-2 opacity-60"></i>{$_('ui.load_url')}
				</button>

				<button
					class="btn-primary !bg-white !text-near-black border border-black/15 hover:!bg-black/5"
					onclick={handleCameraCapture}
				>
					<i class="fa-solid fa-camera mr-2 opacity-60"></i>{$_('ui.camera')}
				</button>
			</div>

			{#if showUrlInput}
				<div class="mt-3 flex flex-col gap-1.5 pt-2 border-t border-black/10">
					<input
						type="text"
						bind:value={urlInput}
						placeholder={$_('ui.image_url_placeholder')}
						class="input-studio w-full"
					/>
					<button class="btn-primary w-full" onclick={handleUrlLoad}>
						{$_('ui.load')}
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

<input type="file" bind:this={fileInput} onchange={handleFileSelect} accept="image/*" hidden />

<input
	type="file"
	bind:this={cameraInput}
	onchange={handleFileSelect}
	accept="image/*"
	capture="environment"
	hidden
/>
