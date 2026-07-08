<script>
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import CragEditorPanelContent from './CragEditorPanelContent.svelte';

	// Props from CragEditorSidebar
	let {
		activeTab = $bindable('info'),
		detectedAssets = [],
		editingTrackIndex = null,
		cragTypes = [],
		availableTags = [],
		securityOptions = [],
		rockTypes = [],
		commonEquipment = [],
		selectedSectorId = $bindable(null),
		saveStatus = 'idle',
		onAddEquipmentItem = () => {},
		onRemoveEquipmentItem = () => {},
		onAddCragImages = () => {},
		onRemoveCragImage = () => {},
		onAddSector = () => {},
		onDuplicateSector = () => {},
		onRemoveSector = () => {},
		onMoveSector = () => {},
		onSetSectorGeometryType = () => {},
		onFocusSector = () => {},
		onSetHoverHighlight = () => {},
		onClearDetectedAssets = () => {},
		onAddDetectedAsset = () => {},
		onRemoveTransit = () => {},
		onRemoveParking = () => {},
		onEditTrack = () => {},
		onRemoveTrack = () => {},
		onFinalizeTrack = () => {},
		onCancelTrackEdit = () => {}
	} = $props();

	let sheetElement = $state();
	let sheetPosition = $state(0.4);
	let sheetHeight = $state(0);
	const collapsedPeekHeight = 48;
	const snapPoints = [0, 0.4, 0.9];

	let isDragging = $state(false);
	let startY = $state(0);
	let startPosition = $state(0);
	let lastDragTime = $state(0);
	let dragVelocity = $state(0);
	let hasDragged = $state(false);

	let cleanup = () => {};

	onMount(() => {
		if (!browser) return;

		// Initialize sheet
		sheetHeight = sheetElement.offsetHeight;
		updateSheetPosition(sheetPosition);

		// Add event listeners
		const handleResize = () => {
			sheetHeight = sheetElement.offsetHeight;
			updateSheetPosition(sheetPosition);
		};

		window.addEventListener('resize', handleResize);
		cleanup = () => window.removeEventListener('resize', handleResize);
	});

	function updateSheetPosition(position) {
		if (!browser || !sheetElement) return;
		sheetPosition = Math.max(0, Math.min(1, position));
		// sheetPosition is the visible/open fraction: 0 = collapsed, 1 = fully open.
		// Keep a small grab handle visible when collapsed so the sheet can be reopened.
		const hiddenOffset = Math.max(0, sheetHeight - collapsedPeekHeight);
		sheetElement.style.transform = `translateY(${hiddenOffset * (1 - sheetPosition)}px)`;
	}

	function isFormOrInteractiveElement(target) {
		return Boolean(
			target?.closest?.(
				'input, textarea, select, button, label, a, [contenteditable="true"], [data-no-sheet-drag]'
			)
		);
	}

	function handleDragStart(e) {
		if (!browser || isFormOrInteractiveElement(e.target)) return;
		e.stopPropagation();
		if (e.cancelable) e.preventDefault();
		isDragging = true;
		startY = e.touches ? e.touches[0].clientY : e.clientY;
		startPosition = sheetPosition;
		lastDragTime = Date.now();
		dragVelocity = 0;
		hasDragged = false;
		sheetElement.style.transition = 'none';
	}

	function handleDragMove(e) {
		if (!browser || !isDragging || isFormOrInteractiveElement(e.target)) return;
		const currentY = e.touches ? e.touches[0].clientY : e.clientY;
		const deltaY = startY - currentY;
		if (Math.abs(deltaY) > 4) hasDragged = true;
		const deltaPosition = deltaY / sheetHeight;
		const newPosition = startPosition + deltaPosition;
		
		// Calculate velocity
		const now = Date.now();
		const deltaTime = now - lastDragTime;
		if (deltaTime > 0) {
			dragVelocity = deltaPosition / deltaTime * 1000;
		}
		lastDragTime = now;
		
		updateSheetPosition(newPosition);
		if (e.cancelable) e.preventDefault();
	}

	function handleDragEnd(e) {
		if (!browser || !isDragging) return;
		if (e?.cancelable) e.preventDefault();
		e?.stopPropagation();
		isDragging = false;
		sheetElement.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.8, 0.4, 1)';
		
		// Find closest snap point with momentum
		let targetPosition = sheetPosition;
		if (Math.abs(dragVelocity) > 0.01) {
			targetPosition += dragVelocity * 0.1;
		}
		
		targetPosition = snapPoints.reduce((prev, curr) =>
			Math.abs(curr - targetPosition) < Math.abs(prev - targetPosition) ? curr : prev
		);
		
		updateSheetPosition(targetPosition);
	}

	function handleSheetClick(e) {
		e.stopPropagation();
	}

	function handleHandleClick(e) {
		e.stopPropagation();
		if (hasDragged) return;
		updateSheetPosition(sheetPosition > 0.45 ? 0.4 : 0.9);
	}

	// Cleanup
	$effect(() => {
		return () => {
			if (cleanup) cleanup();
		};
	});
  // Prevent background clicks from affecting the editor
  const handleBackgroundClick = (e) => {
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
  };
</script>

{#if browser}
	<div class="fixed inset-0 z-40 pointer-events-none">
		<div
			bind:this={sheetElement}
			class="fixed left-0 right-0 bottom-0 z-50 flex h-[90dvh] max-h-[90dvh] flex-col bg-white shadow-panel rounded-t-lg overflow-hidden pointer-events-auto"
			onmousedown={handleDragStart}
			onmousemove={handleDragMove}
			onmouseup={handleDragEnd}
			onmouseleave={handleDragEnd}
			ontouchstart={handleDragStart}
			ontouchmove={handleDragMove}
			ontouchend={handleDragEnd}
			onclick={handleSheetClick}
		>
			<!-- Drag handle -->
			<div
				class="w-full py-2 flex justify-center touch-none cursor-grab active:cursor-grabbing"
				onclick={handleHandleClick}
			>
				<div class="w-12 h-1.5 bg-warm-gray-300 rounded-full"></div>
			</div>
			
			<CragEditorPanelContent
				bind:activeTab
				bind:selectedSectorId
				{detectedAssets}
				{editingTrackIndex}
				{cragTypes}
				{availableTags}
				{securityOptions}
				{rockTypes}
				{commonEquipment}
				{saveStatus}
				{onAddEquipmentItem}
				{onRemoveEquipmentItem}
				{onAddCragImages}
				{onRemoveCragImage}
				{onAddSector}
				{onDuplicateSector}
				{onRemoveSector}
				{onMoveSector}
				{onFocusSector}
				{onSetSectorGeometryType}
				{onSetHoverHighlight}
				{onClearDetectedAssets}
				{onAddDetectedAsset}
				{onRemoveTransit}
				{onRemoveParking}
				{onEditTrack}
				{onRemoveTrack}
				{onFinalizeTrack}
				{onCancelTrackEdit}
			/>
		</div>
	</div>
{:else}
	<!-- SSR fallback -->
	<div class="fixed left-0 right-0 bottom-0 z-50 bg-white shadow-panel rounded-t-lg overflow-hidden">
		<div class="w-full py-2 flex justify-center touch-none">
			<div class="w-12 h-1.5 bg-warm-gray-300 rounded-full"></div>
		</div>
		<div class="p-4 text-center text-ui-label">
			Loading editor...
		</div>
	</div>
{/if}

<style>
	:global(.shadow-panel) {
		box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15);
	}
</style>
