<script>
	import { userState } from '$lib/state/editor.svelte.js';
	import TagSelector from '$lib/components/ui/TagSelector.svelte';
	import { _ } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { generateId, generateSymbolId } from '$lib/assets/js/id-utils.js';
	import {
		availableTopoTags,
		availableRouteTags,
		convertRouteType,
		calculateRouteLength,
		calculateBoltAmount,
		topoSymbols
	} from '$lib/assets/js/topo-utils.js';

	import { uiaaMap, standardGrades, getGradeLabel } from '$lib/assets/js/grades.js';
	import { isMobileViewport } from '$lib/assets/js/mobile-utils.js';
	import { resize, snapToBiggestHeight } from '$lib/assets/js/resize.js';
	import ImageUploader from '$lib/components/editor/ImageUploader.svelte';
	import ClusteringMap from '$lib/components/editor/ClusteringMap.svelte';

	let {
		showMapModal = $bindable(false),
		drawingTarget = $bindable(null),
		activeTool = $bindable('route')
	} = $props();

	let routes = $derived(userState.topo.routes);
	const routeLineStyles = [
		{ id: 'red', label: 'Red' },
		{ id: 'redDashed', label: 'Red dashed' },
		{ id: 'variant', label: 'Variant' }
	];
	const outlineLineStyles = [
		{ id: 'rock', label: 'Rock outline' },
		{ id: 'approach', label: 'Approach' },
		{ id: 'descent', label: 'Descent' },
		{ id: 'variant', label: 'Variant' },
		{ id: 'fixedRope', label: 'Fixed rope' }
	];
	let lastSelectedId = $state(null);
	let lastSelectedFpId = $state(null);
	let lastSelectedTextId = $state(null);
	let lastLockedClusterId = $state(null);
	let selectedTextLabel = $derived(
		(userState.topo.textLabels || []).find((label) => label.id === userState.ui.selectedTextLabelId)
	);
	let selectedOutline = $derived(
		(userState.topo.outlines || []).find((outline) => outline.id === userState.ui.selectedOutlineId)
	);

	$effect(() => {
		const selectedId = userState.ui.selectedRouteId;
		const selectedFpId = userState.ui.selectedFixpointId;
		const selectedTextId = userState.ui.selectedTextLabelId;
		const lockedClusterId = userState.clustering.lockedClusterId;

		if (selectedId && selectedId !== lastSelectedId) {
			lastSelectedId = selectedId;
			const route = userState.topo.routes.find((r) => r.id === selectedId);
			if (route) {
				if (activeTab !== 'routes') activeTab = 'routes';

				if (route.type !== 'multi-pitch') {
					if (drawingTarget?.id !== selectedId) {
						drawingTarget = { type: 'route', id: selectedId };
					}
				} else {
					if (drawingTarget?.routeId !== selectedId) {
						drawingTarget = null;
					}
				}

				setTimeout(() => {
					const el = document.getElementById('route-' + selectedId);
					el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
				}, 100);
			}
		} else if (!selectedId) {
			lastSelectedId = null;
			if (drawingTarget && drawingTarget.type === 'route') drawingTarget = null;
		}

		if (selectedFpId && selectedFpId !== lastSelectedFpId) {
			lastSelectedFpId = selectedFpId;
			if (activeTab !== 'fixpoints') activeTab = 'fixpoints';
			setTimeout(() => {
				const el = document.getElementById('fixpoint-' + selectedFpId);
				el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			}, 100);
		} else if (!selectedFpId) {
			lastSelectedFpId = null;
		}

		if (selectedTextId && selectedTextId !== lastSelectedTextId) {
			lastSelectedTextId = selectedTextId;
			if (activeTab !== 'info') activeTab = 'info';
		} else if (!selectedTextId) {
			lastSelectedTextId = null;
		}

		if (lockedClusterId && lockedClusterId !== lastLockedClusterId) {
			lastLockedClusterId = lockedClusterId;
			if (activeTab !== 'fixpoints') activeTab = 'fixpoints';
			setTimeout(() => {
				const el = document.getElementById('ai-bolt-' + lockedClusterId);
				el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			}, 100);
		} else if (!lockedClusterId) {
			lastLockedClusterId = null;
		}
	});

	let aiSuggestions = $derived.by(() => {
		if (activeTool !== 'ai-bolts' || !userState.clustering.clusters) return [];
		return userState.clustering.clusters.filter((c) => {
			return !userState.topo.fixPoints.some((fp) => {
				const dist = Math.sqrt(
					Math.pow(fp.position[0] - c.anchor[0], 2) +
						Math.pow(fp.position[1] - c.anchor[1], 2) +
						Math.pow(fp.position[2] - c.anchor[2], 2)
				);
				return dist < 0.1; // 10cm threshold
			});
		});
	});

	function addAiBolt(c) {
		let type = 'bolt';
		if (c.class === 'anchor' || c.class === 'belay') type = 'belay';

		userState.topo.fixPoints.push({
			id: generateSymbolId(),
			type: type,
			position: [...c.anchor],
			meta: {
				ai_source: true,
				confidence: c.conf,
				observations: c.members.length,
				original_class: c.class
			}
		});
		userState.clustering.selectedClusterId = null;
	}

	function addPitch(route) {
		if (!route.pitches) route.pitches = [];
		const lastPitch = route.pitches[route.pitches.length - 1];
		if (lastPitch && (lastPitch.points2D?.length || 0) < 2) {
			drawPitch(route, lastPitch);
			return;
		}
		userState.ui.selectedRouteId = route.id;
		userState.ui.selectedFixpointId = null;
		drawingTarget = { type: 'newPitch', routeId: route.id };
		activeTool = 'multipitch';
	}

	function parseAssetList(value) {
		return value.split(',').map((item) => item.trim()).filter(Boolean);
	}

	function getGpxAssets(item) {
		const gpx = item.assets?.gpx;
		if (!gpx) return [];
		return Array.isArray(gpx) ? gpx : [gpx];
	}

	function setGpxAssets(item, value) {
		item.assets = {
			...(item.assets || {}),
			gpx: parseAssetList(value)
		};
	}

	function drawPitch(route, pitch) {
		userState.ui.selectedRouteId = route.id;
		userState.ui.selectedFixpointId = null;
		drawingTarget = { type: 'pitch', routeId: route.id, pitchId: pitch.id };
		activeTool = 'multipitch';
	}

	function addVariant(route) {
		if (!route.variants) route.variants = [];
		const variant = {
			id: generateId('variant'),
			name: `Variant ${route.variants.length + 1}`,
			points2D: [],
			points: [],
			grade: '',
			length: 0,
			lineStyle: 'variant',
			type: 'variant'
		};
		route.variants = [...route.variants, variant];
		drawVariant(route, variant);
	}

	function drawVariant(route, variant) {
		userState.ui.selectedRouteId = route.id;
		userState.ui.selectedFixpointId = null;
		drawingTarget = { type: 'variant', routeId: route.id, variantId: variant.id };
		activeTool = 'multipitch';
	}

	function removeFixpoint(point, index) {
		const pointId = point?.id;
		userState.topo.fixPoints.splice(index, 1);
		if (userState.ui.selectedFixpointId === pointId) userState.ui.selectedFixpointId = null;
		userState.topo.routes.forEach((route) => {
			if (route.fixPoints && route.fixPoints.includes(pointId)) {
				route.fixPoints = route.fixPoints.filter((id) => id !== pointId);
			}
		});
	}

	let activeTab = $state('info');
	let isMobile = $state(false);

	onMount(() => {
		isMobile = isMobileViewport();
		const handleResize = () => {
			isMobile = isMobileViewport();
		};
		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	});

	function switchTab(tab) {
		activeTab = tab;
		userState.ui.selectedRouteId = null;
		userState.ui.selectedFixpointId = null;
	}
</script>

<!-- Desktop Layout -->
<div
	class="hidden md:flex fixed top-14 right-2 z-50 w-80 flex-col"
	style="max-height: calc(100vh - {userState.clustering.lockedClusterId
		? '8.5rem'
		: '4rem'}); transition: max-height 0.2s ease-out;"
>
	<!-- Scrollable Content Area -->
	<div class="panel flex flex-col flex-1 overflow-hidden shadow-panel">
		<div
			class="flex justify-between items-center border-b border-black/15 p-3 pb-2 mb-2 flex-shrink-0"
		>
			<div>
				<h1 class="text-section-title">{$_('ui.properties')}</h1>
				<p class="text-ui-label !m-0">{$_('ui.topo_inspector')}</p>
			</div>
		</div>

		<!-- Tab Bar -->
		<div
			class="bg-black/5 rounded-sm p-0.5 border border-black/10 flex gap-0.5 mx-3 mb-2 flex-shrink-0"
		>
			<button
				class="flex-1 px-2 py-1.5 rounded-sm text-ui-label transition-none whitespace-nowrap {activeTab ===
				'info'
					? 'bg-white shadow-sm text-near-black'
					: 'text-warm-gray-500 hover:bg-black/5'}"
				onclick={() => switchTab('info')}
			>
				{$_('menu.info')}
			</button>
			<button
				class="flex-1 px-2 py-1.5 rounded-sm text-ui-label transition-none whitespace-nowrap {activeTab ===
				'routes'
					? 'bg-white shadow-sm text-near-black'
					: 'text-warm-gray-500 hover:bg-black/5'}"
				onclick={() => switchTab('routes')}
			>
				{$_('topo.routes')}
				<span
					class="ml-1 text-micro-data {activeTab === 'routes'
						? 'text-warm-gray-400'
						: 'text-warm-gray-400'}">{routes.length}</span
				>
			</button>
			<button
				class="flex-1 px-2 py-1.5 rounded-sm text-ui-label transition-none whitespace-nowrap {activeTab ===
				'fixpoints'
					? 'bg-white shadow-sm text-near-black'
					: 'text-warm-gray-500 hover:bg-black/5'}"
				onclick={() => switchTab('fixpoints')}
			>
				{$_('ui.fixpoints')}
				<span
					class="ml-1 text-micro-data {activeTab === 'fixpoints'
						? 'text-warm-gray-400'
						: 'text-warm-gray-400'}">{userState.topo.fixPoints.length}</span
				>
			</button>
		</div>

		<div class="overflow-y-auto flex-1 p-2.5 pt-0 custom-scrollbar bg-transparent">
			<div class="flex flex-col gap-2.5 pb-2">
				{#if activeTab === 'info'}
					<div class="space-y-3">
						<div class="space-y-2.5">
							<div class="space-y-0.5">
								<label for="name" class="text-ui-label block">{$_('ui.name')}</label>
								<input
									type="text"
									id="name"
									bind:value={userState.topo.name}
									class="input-studio w-full"
									placeholder={$_('ui.name_placeholder')}
								/>
							</div>

							<div class="space-y-0.5">
								<label for="author" class="text-ui-label block">{$_('ui.author')}</label>
								<input
									type="text"
									id="author"
									bind:value={userState.topo.author}
									class="input-studio w-full"
									placeholder={$_('ui.author_placeholder')}
								/>
							</div>

							<div class="grid grid-cols-2 gap-2">
								<div class="space-y-0.5">
									<label for="crag-id" class="text-ui-label block">Crag ID</label>
									<input
										type="text"
										id="crag-id"
										bind:value={userState.topo.crag_id}
										class="input-studio w-full font-mono"
										placeholder="peilstein"
									/>
								</div>
								<div class="space-y-0.5">
									<label for="sector-id" class="text-ui-label block">Sector ID</label>
									<input
										type="text"
										id="sector-id"
										bind:value={userState.topo.sector_id}
										class="input-studio w-full font-mono"
										placeholder="hauptwand"
									/>
								</div>
							</div>

							<div class="space-y-0.5">
								<label for="rock" class="text-ui-label block">{$_('ui.rock_type')}</label>
								<select
									id="rock"
									bind:value={userState.topo.rock}
									class="input-studio w-full appearance-none"
								>
									<option value="granite">{$_('rock_types.granite')}</option>
									<option value="gneiss">{$_('rock_types.gneiss')}</option>
									<option value="limestone">{$_('rock_types.limestone')}</option>
									<option value="dolomite">{$_('rock_types.dolomite')}</option>
									<option value="sandstone">{$_('rock_types.sandstone')}</option>
									<option value="basalt">{$_('rock_types.basalt')}</option>
									<option value="tuff">{$_('rock_types.tuff')}</option>
									<option value="rhyolite">{$_('rock_types.rhyolite')}</option>
									<option value="quartzite">{$_('rock_types.quartzite')}</option>
									<option value="conglomerate">{$_('rock_types.conglomerate')}</option>
									<option value="schist">{$_('rock_types.schist')}</option>
								</select>
							</div>

							<div class="space-y-0.5">
								<label class="text-ui-label block">{$_('ui.location')}</label>
								{#if Object.keys(userState.clustering.gpsData || {}).length > 0}
									<ClusteringMap />
								{:else}
									<div
										class="flex items-center gap-2 p-1.5 rounded-sm bg-black/5 border border-black/15 shadow-sm"
									>
										<button
											class="bg-near-black text-white hover:bg-black px-2.5 py-1.5 rounded-sm text-ui-label transition-none flex items-center gap-1.5 shadow-sm"
											onclick={() => (showMapModal = true)}
										>
											<i class="fa-solid fa-map-location-dot opacity-60"></i>{$_('ui.open_map')}
										</button>
										<div class="flex-1 min-w-0 pr-1">
											{#if userState.topo.coordinates[0] !== 0}
												<div
													class="text-micro-data font-mono truncate leading-none text-near-black font-bold"
												>
													{userState.topo.coordinates[1].toFixed(5)}
													, {userState.topo.coordinates[0].toFixed(5)}
												</div>
												<div
													class="text-[9px] text-warm-gray-400 font-bold uppercase mt-1 leading-none tracking-tight"
												>
													{userState.topo.wallAzimuth}
													° / {userState.topo.altitude ? userState.topo.altitude.toFixed(0) : 0}m
												</div>
											{:else}
												<div class="text-micro-data text-warm-gray-400 italic">
													{$_('sun.no_geodata')}
												</div>
											{/if}
										</div>
									</div>
								{/if}
							</div>

							<div class="space-y-0.5">
								<label for="description" class="text-ui-label block">{$_('ui.description')}</label>
								<textarea
									id="description"
									bind:value={userState.topo.description}
									rows="2"
									class="input-studio w-full resize-none"
									placeholder={$_('ui.description_placeholder')}
								></textarea>
							</div>

							<div class="space-y-0.5">
								<label class="text-ui-label block">{$_('ui.tags')}</label>
								<div>
									<TagSelector
										bind:selectedTags={userState.topo.tags}
										availableTags={availableTopoTags}
									/>
								</div>
							</div>

							{#if selectedTextLabel}
								<div class="space-y-2 p-2 rounded-sm bg-warm-white border border-black/10">
									<div class="flex items-center justify-between">
										<label class="text-ui-label block">Selected text</label>
										<button
											class="text-warm-gray-300 hover:text-rose-600 transition-none w-6 h-6 flex items-center justify-center rounded-sm hover:bg-rose-50"
											title="Delete text"
											onclick={() => {
												userState.topo.textLabels = (userState.topo.textLabels || []).filter(
													(label) => label.id !== selectedTextLabel.id
												);
												userState.ui.selectedTextLabelId = null;
											}}
										>
											<i class="fa-solid fa-trash-can text-[10px]"></i>
										</button>
									</div>
									<input type="text" bind:value={selectedTextLabel.text} class="input-studio w-full" />
									<div class="grid grid-cols-3 gap-1.5">
										<div class="space-y-0.5">
											<label class="text-ui-label block">Size</label>
											<input
												type="number"
												min="0.01"
												max="0.08"
												step="0.005"
												bind:value={selectedTextLabel.fontSize2D}
												class="input-studio w-full"
											/>
										</div>
										<div class="space-y-0.5">
											<label class="text-ui-label block">Color</label>
											<input type="color" bind:value={selectedTextLabel.color} class="input-studio w-full h-8 p-1" />
										</div>
										<div class="space-y-0.5">
											<label class="text-ui-label block">Weight</label>
											<select bind:value={selectedTextLabel.fontWeight} class="input-studio w-full appearance-none">
												<option value={400}>Regular</option>
												<option value={700}>Bold</option>
												<option value={900}>Heavy</option>
											</select>
										</div>
									</div>
								</div>
							{/if}

							{#if selectedOutline}
								<div class="space-y-2 p-2 rounded-sm bg-warm-white border border-black/10">
									<div class="flex items-center justify-between">
										<label class="text-ui-label block">Selected outline</label>
										<button
											class="text-warm-gray-300 hover:text-rose-600 transition-none w-6 h-6 flex items-center justify-center rounded-sm hover:bg-rose-50"
											title="Delete outline"
											onclick={() => {
												userState.topo.outlines = (userState.topo.outlines || []).filter(
													(outline) => outline.id !== selectedOutline.id
												);
												userState.ui.selectedOutlineId = null;
											}}
										>
											<i class="fa-solid fa-trash-can text-[10px]"></i>
										</button>
									</div>
									<select
										value={selectedOutline.lineStyle || 'rock'}
										onchange={(e) => (selectedOutline.lineStyle = e.currentTarget.value)}
										class="input-studio w-full appearance-none"
									>
										{#each outlineLineStyles as style}
											<option value={style.id}>{style.label}</option>
										{/each}
									</select>
								</div>
							{/if}

							{#if userState.topo.editorMode === '2d'}
								<div class="pt-2 border-t border-black/15">
									<ImageUploader />
								</div>
							{/if}
						</div>
					</div>
				{/if}

				{#if activeTab === 'routes'}
					{#if routes.length === 0}
						<div class="bg-warm-white rounded-sm p-4 text-center border border-black/15">
							<p class="text-body-text text-warm-gray-500 font-medium">{$_('ui.no_routes_yet')}</p>
						</div>
					{/if}

					{#each routes as route, i (route.id)}
						<div
							id={'route-' + route.id}
							class={'panel-inner p-2.5 relative overflow-visible transition-none border ' +
								(userState.ui.selectedRouteId === route.id
									? 'border-creator-blue'
									: 'border-black/10')}
						>
							<div
								class="flex justify-between items-center mb-2 cursor-pointer group"
								onclick={() => {
									if (userState.ui.selectedRouteId === route.id) {
										userState.ui.selectedRouteId = null;
										drawingTarget = null;
									} else {
										userState.ui.selectedRouteId = route.id;
										userState.ui.selectedFixpointId = null;
										if (route.type !== 'multi-pitch') {
											drawingTarget = { type: 'route', id: route.id };
										} else {
											drawingTarget = null;
										}
									}
								}}
							>
								<div class="flex items-center gap-2">
									<div
										class="w-5 h-5 rounded-sm {userState.ui.selectedRouteId === route.id
											? 'bg-creator-blue text-white'
											: 'bg-black/5 text-warm-gray-500'} flex items-center justify-center text-micro-data font-bold shadow-sm transition-none"
									>
										{i + 1}
									</div>
									<h3
										class={'text-body-text font-bold ' +
											(userState.ui.selectedRouteId === route.id
												? 'text-creator-blue'
												: 'text-near-black')}
									>
										{route.name || `${$_('ui.route')} ${i + 1}`}
									</h3>
								</div>

								<div class="flex items-center gap-1">
									<button
										class="text-warm-gray-300 hover:text-rose-600 transition-none w-6 h-6 flex items-center justify-center rounded-sm hover:bg-rose-50"
										onclick={(e) => {
											e.stopPropagation();
											const index = userState.topo.routes.indexOf(route);
											if (index > -1) {
												userState.topo.routes.splice(index, 1);
												if (userState.ui.selectedRouteId === route.id) {
													userState.ui.selectedRouteId = null;
													drawingTarget = null;
												}
											}
										}}
										title={$_('ui.delete_route')}
									>
										<i class="fa-solid fa-trash-can text-[10px]"></i>
									</button>
								</div>
							</div>

							<div class="space-y-2">
								<div class="flex gap-1.5">
									<div class="flex-1 space-y-0.5">
										<label class="text-ui-label block">{$_('ui.name')}</label>
										<input type="text" bind:value={route.name} class="input-studio w-full" />
									</div>
									<div class="w-1/3 space-y-0.5">
										<label class="text-ui-label block">{$_('ui.type')}</label>
										<select
											value={Array.isArray(route.type) ? route.type[0] : route.type}
											onchange={(e) => convertRouteType(route, e.currentTarget.value)}
											class="input-studio w-full appearance-none"
										>
											<option value="sports-climbing">SC</option>
											<option value="bouldering">B</option>
											<option value="trad">T</option>
											<option value="multi-pitch">MP</option>
										</select>
									</div>
								</div>

								<div class="space-y-0.5">
									<label class="text-ui-label block">Line style</label>
									<select
										value={route.lineStyle || 'red'}
										onchange={(e) => (route.lineStyle = e.currentTarget.value)}
										class="input-studio w-full appearance-none"
									>
										{#each routeLineStyles as style}
											<option value={style.id}>{style.label}</option>
										{/each}
									</select>
								</div>

								<div class="space-y-0.5">
									<label class="text-ui-label block">GPX Assets</label>
									<input
										type="text"
										value={getGpxAssets(route).join(', ')}
										oninput={(e) => setGpxAssets(route, e.currentTarget.value)}
										class="input-studio w-full font-mono"
										placeholder="routes/route-name.gpx"
									/>
								</div>

								{#if route.type !== 'multi-pitch'}
									<div class="space-y-0.5">
										<label class="text-ui-label block">{$_('topo.grade')}</label>
										<div class="flex gap-1">
											<select bind:value={route._gradeScale} class="input-studio w-12 font-bold">
												<option value="french">FR</option>
												<option value="uiaa">UIAA</option>
											</select>
											<select bind:value={route.grade} class="input-studio flex-1">
												{#each standardGrades as g}
													{#if route._gradeScale !== 'uiaa' || uiaaMap[g]}
														<option value={g}>{getGradeLabel(g, route._gradeScale)}</option>
													{/if}
												{/each}
											</select>
										</div>
									</div>

									<div class="grid grid-cols-2 gap-1.5">
										<div class="space-y-0.5">
											<label class="text-ui-label block">{$_('ui.length')}</label>
											<div class="flex items-center gap-1">
												<div class="relative flex-1">
													<input
														type="number"
														bind:value={route.length}
														class="input-studio w-full !pr-4"
													/>
													<span class="absolute right-1 top-1.5 text-micro-data">m</span>
												</div>
												<button
													class="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-sm bg-black/5 hover:bg-creator-blue hover:text-white transition-none border border-black/10"
													onclick={() =>
														(route.length = calculateRouteLength(route, userState.topo.scale))}
													><i class="fa-solid fa-calculator text-[10px]"></i></button
												>
											</div>
										</div>
										{#if route.type === 'sports-climbing'}
											<div class="space-y-0.5">
												<label class="text-ui-label block">{$_('topo.protection')}</label>
												<div class="flex items-center gap-1">
													<input
														type="number"
														bind:value={route.boltAmount}
														class="input-studio flex-1"
													/>
													<button
														class="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-sm bg-black/5 hover:bg-creator-blue hover:text-white transition-none border border-black/10"
														onclick={() =>
															(route.boltAmount = calculateBoltAmount(
																route,
																userState.topo.fixPoints
															))}><i class="fa-solid fa-calculator text-[10px]"></i></button
													>
												</div>
											</div>
										{/if}
									</div>
								{:else}
									<div class="p-1.5 rounded-sm bg-warm-white space-y-1 border border-black/10">
										<div class="flex justify-between items-center mb-0.5">
											<label class="text-ui-label block">{$_('ui.pitches')}</label>
											<div class="flex items-center gap-1">
												<button
													class="bg-white border border-black/15 rounded-sm px-1.5 py-0.5 text-micro-data font-bold text-warm-gray-500 hover:bg-creator-blue hover:text-white transition-none"
													onclick={() => addPitch(route)}
												>
													{$_('ui.add_pitch')}
												</button>
												<select
													bind:value={route._gradeScale}
													class="bg-white border border-black/15 rounded-sm px-1 py-0.5 text-micro-data outline-none"
												>
													<option value="french">FR</option>
													<option value="uiaa">UIAA</option>
												</select>
											</div>
										</div>
										{#each route.pitches as pitch, idx}
											<div
												class="grid grid-cols-12 gap-1 items-center bg-white p-1 rounded-sm border border-black/10 shadow-sm"
											>
												<div class="col-span-1 flex justify-center">
													<span class="text-micro-data font-bold">{idx + 1}</span>
												</div>
												<div class="col-span-4 flex min-w-0">
													<select
														bind:value={pitch.grade}
														class="w-full bg-transparent border border-black/15 rounded-sm px-1 py-0.5 text-body-text outline-none"
													>
														<option value="">Grade</option>
														{#each standardGrades as g}
															{#if route._gradeScale !== 'uiaa' || uiaaMap[g]}
																<option value={g}>{getGradeLabel(g, route._gradeScale)}</option>
															{/if}
														{/each}
													</select>
												</div>
												<div class="col-span-5 flex items-center gap-0.5">
													<div class="relative flex-1">
														<input
															type="number"
															bind:value={pitch.length}
															class="w-full bg-transparent border border-black/15 rounded-sm pl-1 pr-3 py-0.5 text-body-text outline-none"
														/>
														<span class="absolute right-1 inset-y-0 flex items-center text-[9px]"
															>m</span
														>
													</div>
													<button
														class="w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-sm bg-black/5 hover:bg-creator-blue hover:text-white"
														onclick={() =>
															(pitch.length = calculateRouteLength(pitch, userState.topo.scale))}
														><i class="fa-solid fa-calculator text-[8px]"></i></button
													>
													</div>
													<div class="col-span-2 flex justify-center gap-1">
														<button
															class="text-warm-gray-300 hover:text-rose-600"
															onclick={() => {
															route.pitches.splice(idx, 1);
															if (drawingTarget?.pitchId === pitch.id) drawingTarget = null;
														}}
														title={$_('ui.delete_pitch')}
														><i class="fa-solid fa-trash-can text-[9px]"></i></button
													>
												</div>
												<div class="col-span-12">
													<select
														value={pitch.lineStyle || ''}
														onchange={(e) => (pitch.lineStyle = e.currentTarget.value)}
														class="w-full bg-white border border-black/15 rounded-sm px-1 py-0.5 text-micro-data outline-none"
													>
														<option value="">Use route line style</option>
														{#each routeLineStyles as style}
															<option value={style.id}>{style.label}</option>
														{/each}
													</select>
												</div>
												<div class="col-span-12">
													<input
														type="text"
														value={getGpxAssets(pitch).join(', ')}
														oninput={(e) => setGpxAssets(pitch, e.currentTarget.value)}
														class="w-full bg-white border border-black/15 rounded-sm px-1 py-0.5 text-micro-data font-mono outline-none"
														placeholder="routes/route-name-pitch.gpx"
													/>
												</div>
											</div>
										{/each}

										<div class="pt-1 border-t border-black/10 space-y-1">
											<div class="flex justify-between items-center">
												<label class="text-ui-label block">{$_('ui.variants')}</label>
												<button
													class="bg-white border border-black/15 rounded-sm px-1.5 py-0.5 text-micro-data font-bold text-warm-gray-500 hover:bg-creator-blue hover:text-white transition-none"
													onclick={() => addVariant(route)}
												>
													{$_('ui.add_variant')}
												</button>
											</div>
											{#each route.variants || [] as variant, idx}
												<div
													class="grid grid-cols-12 gap-1 items-center bg-white p-1 rounded-sm border border-black/10 shadow-sm"
												>
													<div class="col-span-1 flex justify-center">
														<i class="fa-solid fa-code-branch text-[9px] text-warm-gray-500"></i>
													</div>
													<div class="col-span-6 flex min-w-0">
														<input
															bind:value={variant.name}
															placeholder={$_('ui.variant_name_placeholder')}
															class="w-full bg-transparent border border-black/15 rounded-sm px-1 py-0.5 text-body-text outline-none"
														/>
													</div>
													<div class="col-span-3 flex min-w-0">
														<select
															bind:value={variant.grade}
															class="w-full bg-transparent border border-black/15 rounded-sm px-1 py-0.5 text-body-text outline-none"
														>
															<option value="">Grade</option>
															{#each standardGrades as g}
																{#if route._gradeScale !== 'uiaa' || uiaaMap[g]}
																	<option value={g}>{getGradeLabel(g, route._gradeScale)}</option>
																{/if}
															{/each}
														</select>
													</div>
													<div class="col-span-2 flex justify-center gap-1">
														<button
															class="text-warm-gray-300 hover:text-creator-blue"
															onclick={() => drawVariant(route, variant)}
															title={$_('ui.draw_variant')}
															><i class="fa-solid fa-pencil text-[9px]"></i></button
														>
														<button
															class="text-warm-gray-300 hover:text-rose-600"
															onclick={() => {
																route.variants.splice(idx, 1);
																route.variants = [...route.variants];
																if (drawingTarget?.variantId === variant.id) drawingTarget = null;
															}}
															title={$_('ui.delete_variant')}
															><i class="fa-solid fa-trash-can text-[9px]"></i></button
														>
													</div>
													<div class="col-span-7">
														<select
															value={variant.lineStyle || 'variant'}
															onchange={(e) => (variant.lineStyle = e.currentTarget.value)}
															class="w-full bg-white border border-black/15 rounded-sm px-1 py-0.5 text-micro-data outline-none"
														>
															{#each routeLineStyles as style}
																<option value={style.id}>{style.label}</option>
															{/each}
														</select>
													</div>
													<div class="col-span-5 flex items-center gap-0.5">
														<div class="relative flex-1">
															<input
																type="number"
																bind:value={variant.length}
																class="w-full bg-transparent border border-black/15 rounded-sm pl-1 pr-3 py-0.5 text-body-text outline-none"
															/>
															<span class="absolute right-1 inset-y-0 flex items-center text-[9px]"
																>m</span
															>
														</div>
														<button
															class="w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-sm bg-black/5 hover:bg-creator-blue hover:text-white"
															onclick={() =>
																(variant.length = calculateRouteLength(
																	variant,
																	userState.topo.scale
																))}
															><i class="fa-solid fa-calculator text-[8px]"></i></button
														>
													</div>
												</div>
											{/each}
										</div>
									</div>
								{/if}

								<div class="space-y-0.5">
									<label class="text-ui-label block">{$_('ui.description')}</label>
									<textarea
										bind:value={route.description}
										rows="1"
										class="input-studio w-full resize-none"
									></textarea>
								</div>

								<div class="flex items-center justify-between gap-2 pt-1 border-t border-black/10">
									<div class="flex-1">
										<TagSelector
											bind:selectedTags={route.tags}
											availableTags={availableRouteTags}
											small={true}
										/>
									</div>
									{#if userState.topo.fixPoints.length > 0}
										<details class="group/fp flex-none relative">
											<summary
												class="list-none flex items-center justify-center w-6 h-6 rounded-sm bg-black/5 text-warm-gray-500 cursor-pointer hover:bg-creator-blue hover:text-white transition-none shadow-sm"
											>
												<i class="fa-solid fa-hashtag text-[10px]"></i></summary
											>
											<div
												class="absolute bottom-7 right-0 z-20 bg-white shadow-modal rounded-sm p-2 border border-black/15 min-w-[140px]"
											>
												<p class="text-ui-label mb-1.5 border-b border-black/10 pb-1">
													{$_('ui.assign_fixpoints')}
												</p>
												<div class="grid grid-cols-5 gap-1">
													{#each userState.topo.fixPoints as fp, idx}
														<button
															class={'w-6 h-6 flex items-center justify-center rounded-sm text-micro-data font-bold transition-none ' +
																(route.fixPoints?.includes(fp.id)
																	? 'bg-creator-blue text-white shadow-sm'
																	: 'bg-black/5 text-warm-gray-500 hover:bg-black/10')}
															onclick={(e) => {
																e.stopPropagation();
																if (!route.fixPoints) route.fixPoints = [];
																if (route.fixPoints.includes(fp.id)) {
																	route.fixPoints = route.fixPoints.filter((id) => id !== fp.id);
																} else {
																	route.fixPoints.push(fp.id);
																}
															}}>{idx + 1}</button
														>
													{/each}
												</div>
											</div>
										</details>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				{/if}

				{#if activeTab === 'fixpoints'}
					{#if aiSuggestions.length > 0}
						<div
							class="bg-creator-blue/5 rounded-sm p-2 border border-creator-blue/20 space-y-1.5 mb-4"
							style="margin-bottom: {userState.clustering.lockedClusterId ? '70px' : '1rem'}"
						>
							<div class="flex justify-between items-center">
								<span class="text-ui-label text-creator-blue">{$_('ui.ai_suggestions_title')}</span>
							</div>
							<div class="space-y-1">
								{#each aiSuggestions as cluster (cluster.id)}
									<!-- svelte-ignore a11y_click_events_have_key_events -->
									<!-- svelte-ignore a11y_no_static_element_interactions -->
									<div
										id={'ai-bolt-' + cluster.id}
										class="bg-white rounded-sm p-1.5 shadow-sm border flex items-center justify-between gap-2 group transition-none cursor-pointer {userState
											.clustering.lockedClusterId === cluster.id
											? 'border-creator-blue ring-1 ring-creator-blue'
											: userState.clustering.selectedClusterId === cluster.id
												? 'border-creator-blue/60'
												: 'border-black/15 hover:border-creator-blue'}"
										onclick={() => {
											if (userState.clustering.lockedClusterId === cluster.id) {
												userState.clustering.lockedClusterId = null;
											} else {
												userState.clustering.lockedClusterId = cluster.id;
											}
											userState.clustering.selectedClusterId = cluster.id;
										}}
									>
										<div class="flex items-center gap-2">
											<div
												class="w-6 h-6 rounded-sm bg-creator-blue/10 flex items-center justify-center text-creator-blue text-micro-data font-bold"
											>
												<i class="fa-solid fa-wand-magic-sparkles text-[10px]"></i>
											</div>
											<div class="min-w-0">
												<p class="text-body-text font-bold text-near-black leading-tight truncate">
													{cluster.class === 'anchor' || cluster.class === 'belay'
														? $_('ui.ai_anchor')
														: $_('ui.ai_bolt')}
													<span class="text-[10px] text-warm-gray-500 font-normal ml-0.5"
														>({Math.round(cluster.conf)}
														%)</span
													>
												</p>
											</div>
										</div>
										<button
											class="px-2 py-1 bg-near-black text-white rounded-sm text-micro-data font-bold hover:bg-black"
											onclick={(e) => {
												e.stopPropagation();
												addAiBolt(cluster);
											}}
											>Add
										</button>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					{#if userState.topo.fixPoints.length === 0}
						<div class="bg-warm-white rounded-sm p-4 text-center border border-black/15">
							<p class="text-body-text text-warm-gray-500 font-medium">
								{$_('ui.no_fixpoints_yet')}
							</p>
						</div>
					{:else}
						<div class="grid grid-cols-1 gap-1.5">
							{#each userState.topo.fixPoints as point, i (point.id)}
								<div
									id={'fixpoint-' + point.id}
									class={'panel-inner p-2 transition-none flex items-center gap-2 border ' +
										(userState.ui.selectedFixpointId === point.id
											? 'border-creator-blue'
											: 'border-transparent')}
								>
									<div
										class="w-6 h-6 rounded-sm bg-black/5 flex items-center justify-center text-warm-gray-500 text-micro-data font-bold border border-black/10 shadow-sm"
									>
										{i + 1}
									</div>
									<div class="flex-1">
										<select
											bind:value={point.type}
											class="w-full bg-transparent text-body-text font-bold text-near-black outline-none appearance-none"
										>
											{#each topoSymbols as symbol}
												<option value={symbol.id}>{$_(`topo.fixpoints.${symbol.id}`)}</option>
											{/each}
										</select>
									</div>
									<button
										class="text-warm-gray-300 hover:text-rose-600 transition-none w-6 h-6 flex items-center justify-center rounded-sm hover:bg-rose-50"
										onclick={() => removeFixpoint(point, i)}
										><i class="fa-solid fa-trash-can text-[10px]"></i></button
									>
								</div>
							{/each}
						</div>
					{/if}
				{/if}
			</div>
		</div>
	</div>
</div>

<!-- Mobile Bottom Sheet -->
{#if isMobile}
	<div
		use:resize
		class="fixed left-0 right-0 top-1/2 bottom-0 z-40 bg-white rounded-t-[2rem] shadow-modal border-t border-black/10 overflow-hidden"
	>
		<div class="bg-warm-gray-200 h-1.5 w-12 rounded-sm self-center mt-3 mx-auto"></div>
		<div class="relative z-20 flex gap-1 p-2 border-b border-black/5 bg-warm-white/50 mt-2">
			<button
				class="flex-1 py-2.5 rounded-sm transition-none text-xs font-bold transition-all {activeTab ===
				'info'
					? 'bg-creator-blue text-white'
					: 'text-warm-gray-400'}"
				onclick={() => switchTab('info')}><i class="fa-solid fa-circle-info"></i></button
			>
			<button
				class="flex-1 py-2.5 rounded-sm transition-none text-xs font-bold transition-all {activeTab ===
				'routes'
					? 'bg-creator-blue text-white'
					: 'text-warm-gray-400'}"
				onclick={() => switchTab('routes')}
				><i class="fa-solid fa-route"></i><span class="ml-1.5 text-[10px]">{routes.length}</span
				></button
			>
			<button
				class="flex-1 py-2.5 rounded-sm transition-none text-xs font-bold transition-all {activeTab ===
				'fixpoints'
					? 'bg-creator-blue text-white'
					: 'text-warm-gray-400'}"
				onclick={() => switchTab('fixpoints')}
				><i class="fa-solid fa-location-dot"></i><span class="ml-1.5 text-[10px]"
					>{userState.topo.fixPoints.length}</span
				></button
			>
		</div>
		<div class="overflow-y-auto custom-scrollbar" style="height: calc(100% - 100px);">
			<div class="p-4 space-y-3">
				{#if activeTab === 'routes'}
					{#each routes as route, i (route.id)}
						<div
							class="panel p-3 border-2 {userState.ui.selectedRouteId === route.id
								? 'border-creator-blue ring-4 ring-creator-blue/5'
								: 'border-transparent'}"
						>
							<div
								class="flex items-center gap-3 cursor-pointer"
								onclick={() => {
									if (userState.ui.selectedRouteId === route.id) {
										userState.ui.selectedRouteId = null;
										drawingTarget = null;
									} else {
										userState.ui.selectedRouteId = route.id;
										if (route.type !== 'multi-pitch')
											drawingTarget = { type: 'route', id: route.id };
										if (isMobile) snapToBiggestHeight();
									}
								}}
							>
								<div
									class="w-8 h-8 rounded-sm transition-none {userState.ui.selectedRouteId ===
									route.id
										? 'bg-creator-blue text-white'
										: 'bg-warm-gray-100 text-warm-gray-500'} flex items-center justify-center text-xs font-black transition-colors shadow-sm"
								>
									{i + 1}
								</div>
								<div class="flex-1 min-w-0">
									<div
										class="font-black text-sm truncate {userState.ui.selectedRouteId === route.id
											? 'text-creator-blue'
											: 'text-near-black'}"
									>
										{route.name || `${$_('ui.route')} ${i + 1}`}
									</div>
									<div class="text-[10px] text-warm-gray-400 font-bold uppercase tracking-wider">
										{#if route.grade}{getGradeLabel(route.grade, route._gradeScale || 'french')} ·{/if}
										{#if route.length}{route.length}m ·{/if}{$_(`types.${route.type}`)}
									</div>
								</div>
								<button
									class="w-9 h-9 flex items-center justify-center rounded-sm text-warm-gray-200 hover:text-red-500 hover:bg-red-50 transition-none"
									onclick={(e) => {
										e.stopPropagation();
										const index = userState.topo.routes.indexOf(route);
										if (index > -1) {
											userState.topo.routes.splice(index, 1);
											if (userState.ui.selectedRouteId === route.id) {
												userState.ui.selectedRouteId = null;
												drawingTarget = null;
											}
										}
									}}
								>
									<i class="fa-solid fa-trash-can text-sm"></i></button
								>
							</div>

							{#if userState.ui.selectedRouteId === route.id}
								<div class="mt-3 space-y-3 border-t border-black/10 pt-3">
									<div class="grid grid-cols-[1fr_6.5rem] gap-2">
										<div class="space-y-1">
											<label class="text-ui-label block">{$_('ui.name')}</label>
											<input type="text" bind:value={route.name} class="input-studio w-full" />
										</div>
										<div class="space-y-1">
											<label class="text-ui-label block">{$_('ui.type')}</label>
											<select
												value={Array.isArray(route.type) ? route.type[0] : route.type}
												onchange={(e) => convertRouteType(route, e.currentTarget.value)}
												class="input-studio w-full appearance-none"
											>
												<option value="sports-climbing">SC</option>
												<option value="bouldering">B</option>
												<option value="trad">T</option>
												<option value="multi-pitch">MP</option>
											</select>
										</div>
									</div>

									<div class="grid grid-cols-2 gap-2">
										<div class="space-y-1">
											<label class="text-ui-label block">Line style</label>
											<select
												value={route.lineStyle || 'red'}
												onchange={(e) => (route.lineStyle = e.currentTarget.value)}
												class="input-studio w-full appearance-none"
											>
												{#each routeLineStyles as style}
													<option value={style.id}>{style.label}</option>
												{/each}
											</select>
										</div>
										{#if route.type !== 'multi-pitch'}
											<div class="space-y-1">
												<label class="text-ui-label block">{$_('topo.grade')}</label>
												<div class="flex gap-1">
													<select bind:value={route._gradeScale} class="input-studio w-16 font-bold">
														<option value="french">FR</option>
														<option value="uiaa">UIAA</option>
													</select>
													<select bind:value={route.grade} class="input-studio min-w-0 flex-1">
														{#each standardGrades as g}
															{#if route._gradeScale !== 'uiaa' || uiaaMap[g]}
																<option value={g}>{getGradeLabel(g, route._gradeScale)}</option>
															{/if}
														{/each}
													</select>
												</div>
											</div>
										{/if}
									</div>

									{#if route.type !== 'multi-pitch'}
										<div class="grid grid-cols-2 gap-2">
											<div class="space-y-1">
												<label class="text-ui-label block">{$_('ui.length')}</label>
												<div class="flex items-center gap-1">
													<div class="relative min-w-0 flex-1">
														<input
															type="number"
															bind:value={route.length}
															class="input-studio w-full !pr-5"
														/>
														<span class="absolute right-1.5 top-2 text-micro-data">m</span>
													</div>
													<button
														class="h-9 w-9 flex-shrink-0 rounded-sm border border-black/10 bg-black/5 text-warm-gray-500"
														onclick={() =>
															(route.length = calculateRouteLength(route, userState.topo.scale))}
														title={$_('ui.length')}
														aria-label={$_('ui.length')}
													>
														<i class="fa-solid fa-calculator text-[10px]"></i>
													</button>
												</div>
											</div>
											{#if route.type === 'sports-climbing'}
												<div class="space-y-1">
													<label class="text-ui-label block">{$_('topo.protection')}</label>
													<div class="flex items-center gap-1">
														<input
															type="number"
															bind:value={route.boltAmount}
															class="input-studio min-w-0 flex-1"
														/>
														<button
															class="h-9 w-9 flex-shrink-0 rounded-sm border border-black/10 bg-black/5 text-warm-gray-500"
															onclick={() =>
																(route.boltAmount = calculateBoltAmount(
																	route,
																	userState.topo.fixPoints
																))}
															title={$_('topo.protection')}
															aria-label={$_('topo.protection')}
														>
															<i class="fa-solid fa-calculator text-[10px]"></i>
														</button>
													</div>
												</div>
											{/if}
										</div>
									{:else}
										<div class="rounded-sm border border-black/10 bg-warm-white p-2 space-y-2">
											<div class="flex items-center justify-between gap-2">
												<label class="text-ui-label block">{$_('ui.pitches')}</label>
												<div class="flex items-center gap-1">
													<button
														class="rounded-sm border border-black/15 bg-white px-2 py-1 text-micro-data font-bold text-warm-gray-500"
														onclick={() => addPitch(route)}
													>
														{$_('ui.add_pitch')}
													</button>
													<select
														bind:value={route._gradeScale}
														class="rounded-sm border border-black/15 bg-white px-1 py-1 text-micro-data outline-none"
													>
														<option value="french">FR</option>
														<option value="uiaa">UIAA</option>
													</select>
												</div>
											</div>
											{#each route.pitches || [] as pitch, idx}
												<div class="grid grid-cols-12 gap-1 rounded-sm border border-black/10 bg-white p-1">
													<div class="col-span-1 flex items-center justify-center">
														<span class="text-micro-data font-bold">{idx + 1}</span>
													</div>
													<div class="col-span-5">
														<select
															bind:value={pitch.grade}
															class="w-full rounded-sm border border-black/15 bg-transparent px-1 py-1 text-body-text outline-none"
														>
															<option value="">Grade</option>
															{#each standardGrades as g}
																{#if route._gradeScale !== 'uiaa' || uiaaMap[g]}
																	<option value={g}>{getGradeLabel(g, route._gradeScale)}</option>
																{/if}
															{/each}
														</select>
													</div>
													<div class="col-span-4">
														<input
															type="number"
															bind:value={pitch.length}
															class="w-full rounded-sm border border-black/15 bg-transparent px-1 py-1 text-body-text outline-none"
														/>
													</div>
													<button
														class="col-span-1 text-warm-gray-300"
														onclick={() =>
															(pitch.length = calculateRouteLength(pitch, userState.topo.scale))}
														title={$_('ui.length')}
														aria-label={$_('ui.length')}
													>
														<i class="fa-solid fa-calculator text-[9px]"></i>
													</button>
													<button
														class="col-span-1 text-rose-500"
														onclick={() => {
															route.pitches.splice(idx, 1);
															if (drawingTarget?.pitchId === pitch.id) drawingTarget = null;
														}}
														title={$_('ui.delete_pitch')}
														aria-label={$_('ui.delete_pitch')}
													>
														<i class="fa-solid fa-trash-can text-[9px]"></i>
													</button>
												</div>
											{/each}

											<div class="border-t border-black/10 pt-2 space-y-2">
												<div class="flex items-center justify-between">
													<label class="text-ui-label block">{$_('ui.variants')}</label>
													<button
														class="rounded-sm border border-black/15 bg-white px-2 py-1 text-micro-data font-bold text-warm-gray-500"
														onclick={() => addVariant(route)}
													>
														{$_('ui.add_variant')}
													</button>
												</div>
												{#each route.variants || [] as variant, idx}
													<div class="grid grid-cols-12 gap-1 rounded-sm border border-black/10 bg-white p-1">
														<input
															bind:value={variant.name}
															placeholder={$_('ui.variant_name_placeholder')}
															class="col-span-5 rounded-sm border border-black/15 bg-transparent px-1 py-1 text-body-text outline-none"
														/>
														<select
															bind:value={variant.grade}
															class="col-span-4 rounded-sm border border-black/15 bg-transparent px-1 py-1 text-body-text outline-none"
														>
															<option value="">Grade</option>
															{#each standardGrades as g}
																{#if route._gradeScale !== 'uiaa' || uiaaMap[g]}
																	<option value={g}>{getGradeLabel(g, route._gradeScale)}</option>
																{/if}
															{/each}
														</select>
														<button
															class="col-span-1 text-creator-blue"
															onclick={() => drawVariant(route, variant)}
															title={$_('ui.draw_variant')}
															aria-label={$_('ui.draw_variant')}
														>
															<i class="fa-solid fa-pencil text-[9px]"></i>
														</button>
														<button
															class="col-span-1 text-rose-500"
															onclick={() => {
																route.variants.splice(idx, 1);
																route.variants = [...route.variants];
																if (drawingTarget?.variantId === variant.id) drawingTarget = null;
															}}
															title={$_('ui.delete_variant')}
															aria-label={$_('ui.delete_variant')}
														>
															<i class="fa-solid fa-trash-can text-[9px]"></i>
														</button>
													</div>
												{/each}
											</div>
										</div>
									{/if}

									<div class="space-y-1">
										<label class="text-ui-label block">GPX Assets</label>
										<input
											type="text"
											value={getGpxAssets(route).join(', ')}
											oninput={(e) => setGpxAssets(route, e.currentTarget.value)}
											class="input-studio w-full font-mono"
											placeholder="routes/route-name.gpx"
										/>
									</div>

									<div class="space-y-1">
										<label class="text-ui-label block">{$_('ui.description')}</label>
										<textarea
											bind:value={route.description}
											rows="2"
											class="input-studio w-full resize-none"
										></textarea>
									</div>

									<TagSelector
										bind:selectedTags={route.tags}
										availableTags={availableRouteTags}
										small={true}
									/>
								</div>
							{/if}
						</div>
					{/each}
				{:else if activeTab === 'fixpoints'}
					{#if aiSuggestions.length > 0}
						<div class="mb-4 space-y-1.5">
							<p class="text-ui-label text-creator-blue px-1 mb-0.5">
								{$_('ui.nearby_suggestions')}
							</p>
							<div class="space-y-1.5">
								{#each aiSuggestions as cluster (cluster.id)}
									<!-- svelte-ignore a11y_click_events_have_key_events -->
									<!-- svelte-ignore a11y_no_static_element_interactions -->
									<div
										id={'ai-bolt-' + cluster.id}
										class="panel p-3 flex items-center gap-3 border-2 cursor-pointer transition-none {userState
											.clustering.lockedClusterId === cluster.id
											? 'border-creator-blue bg-creator-blue/10'
											: userState.clustering.selectedClusterId === cluster.id
												? 'border-creator-blue/60 bg-creator-blue/10'
												: 'border-creator-blue/30 bg-creator-blue/5 hover:border-creator-blue/60 hover:bg-creator-blue/10'}"
										onclick={() => {
											if (userState.clustering.lockedClusterId === cluster.id) {
												userState.clustering.lockedClusterId = null;
											} else {
												userState.clustering.lockedClusterId = cluster.id;
											}
											userState.clustering.selectedClusterId = cluster.id;
										}}
									>
										<div
											class="w-8 h-8 rounded-sm bg-creator-blue/10 flex items-center justify-center text-creator-blue text-xs font-black shadow-sm"
										>
											<i class="fa-solid fa-wand-magic-sparkles"></i>
										</div>
										<div class="flex-1">
											<div class="text-sm font-black text-near-black">
												{cluster.class === 'anchor' || cluster.class === 'belay'
													? $_('ui.ai_anchor')
													: $_('ui.ai_bolt')}
											</div>
											<div class="text-xs text-warm-gray-500">
												{Math.round(cluster.conf)}% {$_('ui.match')}
											</div>
										</div>
										<button
											class="w-9 h-9 flex items-center justify-center rounded-sm bg-near-black text-white font-bold text-xs"
											onclick={(e) => {
												e.stopPropagation();
												addAiBolt(cluster);
											}}
											>Add
										</button>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					{#if userState.topo.fixPoints.length === 0}
						<div class="bg-warm-white rounded-sm p-4 text-center border border-black/15">
							<p class="text-body-text text-warm-gray-500 font-medium">
								{$_('ui.no_fixpoints_yet')}
							</p>
						</div>
					{:else}
						{#each userState.topo.fixPoints as point, i (point.id)}
							<div
								id={'fixpoint-' + point.id}
								class="panel p-3 flex items-center gap-3 border-2 {userState.ui
									.selectedFixpointId === point.id
									? 'border-creator-blue'
									: 'border-transparent'}"
							>
								<button
									class="w-9 h-9 rounded-sm transition-none bg-warm-gray-100 flex items-center justify-center text-warm-gray-500 text-xs font-black shadow-sm"
									onclick={() => {
										userState.ui.selectedFixpointId =
											userState.ui.selectedFixpointId === point.id ? null : point.id;
										userState.ui.selectedRouteId = null;
									}}
									aria-label={`${$_('ui.fixpoints')} ${i + 1}`}
								>
									{i + 1}
								</button>
								<select
									bind:value={point.type}
									class="min-w-0 flex-1 bg-transparent text-sm font-black text-near-black outline-none appearance-none"
								>
									{#each topoSymbols as symbol}
										<option value={symbol.id}>{$_(`topo.fixpoints.${symbol.id}`)}</option>
									{/each}
								</select>
								<button
									class="h-9 flex items-center justify-center gap-1.5 rounded-sm bg-rose-50 px-3 text-[11px] font-bold text-rose-700 transition-none hover:bg-rose-100"
									onclick={() => removeFixpoint(point, i)}
								>
									<i class="fa-solid fa-trash-can text-[10px]"></i>
									<span>{$_('ui.remove')}</span>
								</button>
							</div>
						{/each}
					{/if}
				{:else}
					<div class="space-y-4 pt-1">
						<div class="space-y-1.5 px-1">
							<label for="name-mobile" class="label-studio">{$_('ui.name')}</label>
							<input
								type="text"
								id="name-mobile"
								bind:value={userState.topo.name}
								class="input-studio w-full"
								placeholder={$_('ui.name_placeholder')}
							/>
						</div>
						<div class="px-1 pt-2">
							<ImageUploader />
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	:global(.grabber.top) {
		height: 28px;
		width: 100%;
		position: absolute;
		top: 0;
		left: 0;
		cursor: pointer;
		z-index: 10;
	}
</style>
