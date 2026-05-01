<script>
	import { T, useThrelte } from '@threlte/core';
	import { MeshLineGeometry, MeshLineMaterial, interactivity } from '@threlte/extras';
	import * as THREE from 'three';
	import { CatmullRomCurve3, Vector3, TubeGeometry } from 'three';
	import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
	import { onMount } from 'svelte';
	import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
	import CssObject from '../CssObject.svelte';
	import { userState } from '$lib/state/editor.svelte.js';
	import { Topo3DInteractionManager } from './3d/InteractionManager.svelte.js';

    interactivity();

	// Apply BVH extension to THREE
	if (typeof window !== 'undefined' && !THREE.BufferGeometry.prototype.computeBoundsTree) {
		THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
		THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
		THREE.Mesh.prototype.raycast = acceleratedRaycast;
	}

	// --- Props ---
	let { 
		gltfScene = null, 
		activeTool, 
        selectedIndicesMap = $bindable(new Map()),
        children,
		...props 
	} = $props(); 

    // --- Interaction Manager ---
    const interaction = new Topo3DInteractionManager();

	// --- Export Functionality Binding ---
	export const downloadModel = (filename = 'model.glb') => {
		if (!gltfScene) return;

		const exporter = new GLTFExporter();
		const sceneClone = gltfScene.clone();

		const scale = userState.topo.scale || 1;
		sceneClone.scale.set(scale, scale, scale);

		const offset = userState.topo.modelOffset || [0, 0, 0];
		sceneClone.position.set(offset[0], offset[1], offset[2]);

		sceneClone.updateMatrixWorld(true);

		exporter.parse(
			sceneClone,
			(glb) => {
				const blob = new Blob([glb], { type: 'application/octet-stream' });
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = filename;
				a.click();
				URL.revokeObjectURL(url);
			},
			(err) => console.error(err),
			{ binary: true }
		);
	};

    export const clearLassoSelection = () => {
        gltfScene?.traverse((child) => {
            if (child.isMesh && child.geometry && child.geometry.attributes.color) {
                const colorAttr = child.geometry.attributes.color;
                for (let i = 0; i < colorAttr.count; i++) {
                    colorAttr.setXYZ(i, 1, 1, 1);
                }
                colorAttr.needsUpdate = true;
            }
        });
        selectedIndicesMap = new Map();
    };

    let editorInternal = $state();

    export function previewLassoCut(points) {
        editorInternal?.previewLassoCut(points);
    }

    export function applyLassoCut() {
        if (selectedIndicesMap.size === 0) return;

        gltfScene.traverse((child) => {
            if (child.isMesh && child.geometry && selectedIndicesMap.has(child.uuid)) {
                const geometry = child.geometry;
                const position = geometry.attributes.position;
                const index = geometry.index;
                const meshSelection = selectedIndicesMap.get(child.uuid);

                if (index) {
                    const oldIndices = index.array;
                    const newIndices = [];
                    for (let i = 0; i < oldIndices.length; i += 3) {
                        const a = oldIndices[i], b = oldIndices[i+1], c = oldIndices[i+2];
                        if (!(meshSelection.has(a) && meshSelection.has(b) && meshSelection.has(c))) {
                            newIndices.push(a, b, c);
                        }
                    }
                    geometry.setIndex(newIndices);
                } else {
                    const posArray = position.array;
                    const newPositions = [];
                    for (let i = 0; i < position.count; i += 3) {
                        const a = i, b = i+1, c = i+2;
                        if (!(meshSelection.has(a) && meshSelection.has(b) && meshSelection.has(c))) {
                            const i3 = i * 3;
                            newPositions.push(
                                posArray[i3], posArray[i3+1], posArray[i3+2],
                                posArray[i3+3], posArray[i3+4], posArray[i3+5],
                                posArray[i3+6], posArray[i3+7], posArray[i3+8]
                            );
                        }
                    }
                    geometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
                }
                
                // Reset colors after cut
                if (geometry.attributes.color) {
                    const colorAttr = geometry.attributes.color;
                    for (let i = 0; i < colorAttr.count; i++) colorAttr.setXYZ(i, 1, 1, 1);
                    colorAttr.needsUpdate = true;
                }

                geometry.attributes.position.needsUpdate = true;
                if (geometry.index) geometry.index.needsUpdate = true;
                geometry.computeVertexNormals();
                if (geometry.boundsTree) geometry.computeBoundsTree();
            }
        });

        selectedIndicesMap = new Map();

        // PERSIST
        const exporter = new GLTFExporter();
        const exportClone = gltfScene.clone();
        exportClone.position.set(0, 0, 0);
        exportClone.rotation.set(0, 0, 0);
        exportClone.scale.set(1, 1, 1);
        exportClone.updateMatrixWorld(true);

        exporter.parse(
            exportClone,
            (glb) => {
                const blob = new Blob([glb], { type: 'application/octet-stream' });
                userState.ui.glbBlob = blob;
                userState.ui.modelRevision++;
            },
            (err) => console.error(err),
            { binary: true }
        );
    }

    export function selectFloatingGeometry() {
        if (!gltfScene) return;
        selectedIndicesMap = new Map();
        const allMeshes = [];
        gltfScene.traverse((child) => { if (child.isMesh && child.geometry) allMeshes.push(child); });
        if (allMeshes.length === 0) return;

        const globalNodeMap = new Map();
        let globalNodeCount = 0;
        const vReusable = new THREE.Vector3();
        const meshVertexData = allMeshes.map(mesh => {
            const pos = mesh.geometry.attributes.position;
            const vertexToGlobalNode = new Int32Array(pos.count);
            mesh.updateMatrixWorld(true);
            const m = mesh.matrixWorld;
            for (let i = 0; i < pos.count; i++) {
                vReusable.fromBufferAttribute(pos, i).applyMatrix4(m);
                const key = `${Math.round(vReusable.x*100)},${Math.round(vReusable.y*100)},${Math.round(vReusable.z*100)}`;
                if (!globalNodeMap.has(key)) globalNodeMap.set(key, globalNodeCount++);
                vertexToGlobalNode[i] = globalNodeMap.get(key);
            }
            return { mesh, vertexToGlobalNode };
        });

        const nodeToFacesHead = new Int32Array(globalNodeCount).fill(-1);
        const totalFaces = allMeshes.reduce((sum, m) => sum + (m.geometry.index ? m.geometry.index.count/3 : m.geometry.attributes.position.count/3), 0);
        const next = new Int32Array(totalFaces * 3);
        const data = new Int32Array(totalFaces * 3);
        let ptr = 0;
        const allFaces = [];
        meshVertexData.forEach(({ mesh, vertexToGlobalNode }, mIdx) => {
            const index = mesh.geometry.index;
            const pos = mesh.geometry.attributes.position;
            const faceCount = index ? index.count / 3 : pos.count / 3;
            const indices = index ? index.array : null;
            for (let f = 0; f < faceCount; f++) {
                const i3 = f * 3;
                const vA = indices ? indices[i3] : i3;
                const vB = indices ? indices[i3+1] : i3+1;
                const vC = indices ? indices[i3+2] : i3+2;
                const gfIdx = allFaces.length;
                const nodes = [vertexToGlobalNode[vA], vertexToGlobalNode[vB], vertexToGlobalNode[vC]];
                allFaces.push({ mIdx, fIdx: f, nodes });
                for (const n of nodes) {
                    next[ptr] = nodeToFacesHead[n];
                    data[ptr] = gfIdx;
                    nodeToFacesHead[n] = ptr++;
                }
            }
        });

        const visited = new Uint8Array(allFaces.length);
        const islands = [];
        for (let i = 0; i < allFaces.length; i++) {
            if (visited[i]) continue;
            const island = [];
            const queue = new Int32Array(allFaces.length);
            let h = 0, t = 0;
            queue[t++] = i;
            visited[i] = 1;
            while (h < t) {
                const idx = queue[h++];
                island.push(idx);
                for (const n of allFaces[idx].nodes) {
                    let p = nodeToFacesHead[n];
                    while (p !== -1) {
                        const neighbor = data[p];
                        if (!visited[neighbor]) { visited[neighbor] = 1; queue[t++] = neighbor; }
                        p = next[p];
                    }
                }
            }
            islands.push(island);
        }
        if (islands.length <= 1) return;
        islands.sort((a, b) => b.length - a.length);
        allMeshes.forEach(mesh => {
            const geo = mesh.geometry;
            if (!geo.attributes.color) { geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(1), 3)); }
            const colors = geo.attributes.color;
            for(let i=0; i<colors.count; i++) colors.setXYZ(i, 1, 1, 1);
            if (mesh.material) {
                const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                mats.forEach(m => { m.vertexColors = true; m.needsUpdate = true; });
            }
        });
        for (let i = 1; i < islands.length; i++) {
            for (const gfIdx of islands[i]) {
                const face = allFaces[gfIdx];
                const mesh = allMeshes[face.mIdx];
                const indices = mesh.geometry.index ? mesh.geometry.index.array : null;
                const colors = mesh.geometry.attributes.color;
                if (!selectedIndicesMap.has(mesh.uuid)) selectedIndicesMap.set(mesh.uuid, new Set());
                const selection = selectedIndicesMap.get(mesh.uuid);
                const i3 = face.fIdx * 3;
                const vs = indices ? [indices[i3], indices[i3+1], indices[i3+2]] : [i3, i3+1, i3+2];
                for (const vIdx of vs) { selection.add(vIdx); colors.setXYZ(vIdx, 1.0, 0.2, 0.2); }
                colors.needsUpdate = true;
            }
        }
    }

    // --- State Sync ---
	let visualRoutes = $derived.by(() => {
        const offset = userState.topo.modelOffset || [0, 0, 0];
		return userState.topo.routes.flatMap(route => {
			const processPoints = (points, subId, label) => {
				let normal = null;
				let displacement = new Vector3(0, 0, 0);
				if (route.orientation) {
					normal = new Vector3(route.orientation[0], route.orientation[1], route.orientation[2]);
					displacement = normal.clone().multiplyScalar(0.05);
				}
				const vecPoints = (points || []).map(p => new Vector3(p[0] + offset[0], p[1] + offset[1], p[2] + offset[2]).add(displacement));
				const curve = vecPoints.length >= 2 ? new CatmullRomCurve3(vecPoints, false, 'catmullrom', 0) : null;
				return { id: subId, rawPoints: vecPoints, curve, normal, label: label || route.id, parentId: route.id };
			};
			if (route.type === 'multi-pitch' && route.pitches) {
				return route.pitches.map((pitch, idx) => processPoints(pitch.points || [], pitch.id || `${route.id}_p${idx}`, `${route.id}.${idx + 1}`));
			} else return [processPoints(route.points, route.id)];
		});
	});

	let visualFixPoints = $derived.by(() => {
        const offset = userState.topo.modelOffset || [0, 0, 0];
        return userState.topo.fixPoints
            .filter(pt => pt.position && ['bolt', 'belay', 'abseil', 'piton', 'tree'].includes(pt.type))
            .map(pt => ({
                ...pt,
                rawPosition: [pt.position[0] + offset[0], pt.position[1] + offset[1], pt.position[2] + offset[2]],
                isAssigned: userState.ui.selectedRouteId ? userState.topo.routes.find(r => r.id === userState.ui.selectedRouteId)?.fixPoints?.includes(pt.id) : false
            }));
    });

    let visualRawHits = $derived.by(() => {
        const clusterId = userState.clustering.selectedClusterId;
        const cluster = userState.clustering.clusters.find(c => c.id === clusterId);
        if (!cluster) return [];
        const offset = userState.topo.modelOffset || [0, 0, 0];
        return cluster.members.map((h, i) => ({ id: `hit-${clusterId}-${i}`, pos: [h.pos[0] + offset[0], h.pos[1] + offset[1], h.pos[2] + offset[2]], color: cluster.color }));
    });

    let visualCameras = $derived.by(() => {
        if (!userState.clustering.showCameraTrail) return [];
        const offset = userState.topo.modelOffset || [0, 0, 0];
        return Object.entries(userState.clustering.cameraPositions).map(([idx, pos]) => ({ id: `cam-${idx}`, pos: [pos[0] + offset[0], pos[1] + offset[1], pos[2] + offset[2]] }));
    });

	let visualClusters = $derived.by(() => {
        const offset = userState.topo.modelOffset || [0, 0, 0];
        return userState.clustering.clusters.map(c => ({ ...c, anchor: [c.anchor[0] + offset[0], c.anchor[1] + offset[1], c.anchor[2] + offset[2]] }));
    });

    $effect(() => {
        interaction.gltfScene = gltfScene;
        interaction.modelPosition = props.position || [0, 0, 0];
        interaction.visualRoutes = visualRoutes;
        interaction.visualFixPoints = visualFixPoints;
		interaction.visualClusters = visualClusters;
    });

    // Compute BVH for the loaded scene to accelerate raycasting
    $effect(() => {
        if (gltfScene) {
            gltfScene.traverse(child => {
                if (child.isMesh && child.geometry && !child.geometry.boundsTree) {
                    child.geometry.computeBoundsTree();
                }
            });
        }
    });

	onMount(() => {
		const handleKey = (e) => interaction.handleKeyDown(e, activeTool);
		window.addEventListener('keydown', handleKey);
		return () => window.removeEventListener('keydown', handleKey);
	});

    const { size } = useThrelte();
</script>

<T.Group>
    {#if gltfScene}
        <T is={gltfScene} 
            onclick={(e) => interaction.handleMeshClick(e)} 
            ondblclick={(e) => interaction.handleMeshDblClick(e, activeTool)} 
            onpointermove={(e) => interaction.handleMeshPointerMove(e, activeTool)} 
            dispose={null} 
            position={userState.topo.modelOffset || [0, 0, 0]}
            {...props} 
        />
    {/if}

    {@render children?.()}

    {#if interaction.previewLineSegment}
        <T.Mesh>
            <MeshLineGeometry points={interaction.previewLineSegment.points} />
            <MeshLineMaterial color={"#ffeb3b"} width={0.1} resolution={[$size.width, $size.height]} transparent opacity={0.7} />
        </T.Mesh>
    {/if}

    {#each interaction.currentLineSegments as segment (segment.id)}
        <T.Mesh>
            <MeshLineGeometry points={segment.points} />
            <MeshLineMaterial color={"#ff00ff"} width={0.15} resolution={[$size.width, $size.height]} />
        </T.Mesh>
    {/each}

    {#each visualFixPoints as point (point.id)}
        <CssObject position={point.rawPosition} scaleWithZoom={true} pointerEvents={true}>
            <div
                class="flex items-center justify-center w-6 h-6 -m-3 transition-all cursor-pointer group"
                onclick={(e) => { interaction.handleFixPointClick(e, point.id); }}
                ondblclick={(e) => interaction.handleFixPointDblClick(e, point.id, activeTool)}
                role="button"
                tabindex="0"
            >
                <div class="w-2 h-2 rounded-full shadow-sm border border-white/40 transition-all 
                    {point.type === 'belay' ? 'bg-orange-500' : (point.type === 'bolt' ? 'bg-creator-blue' : 'bg-near-black')} 
                    {point.isAssigned ? 'ring-2 ring-green-500 ring-offset-1' : ''} 
                    {userState.ui.selectedFixpointId === point.id ? 'ring-2 ring-yellow-400 ring-offset-1 scale-150' : 'group-hover:scale-125'}">
                </div>
            </div>
        </CssObject>
    {/each}

    {#each visualRoutes as route (route.id)}
        {#if route.rawPoints && route.rawPoints.length > 0}
            <CssObject position={route.rawPoints[0]} pointerEvents={true}>
                <div class={"route-label " + (userState.ui.selectedRouteId === route.parentId ? "selected" : "")}
                    onclick={(e) => { e.stopPropagation(); userState.ui.selectedRouteId = (userState.ui.selectedRouteId === route.parentId) ? null : route.parentId; }}
                    role="button" tabindex="0">
                    {route.label}
                </div>
            </CssObject>
        {/if}

        {#if route.rawPoints}
                <!-- Main Route Line -->
                <T.Mesh>
                    <MeshLineGeometry points={route.rawPoints} />
                    <MeshLineMaterial
                        width={userState.ui.selectedRouteId === route.parentId ? 0.12 : (interaction.lastSnappedRouteId === route.parentId ? 0.10 : 0.06)}
                        color={userState.ui.selectedRouteId === route.parentId ? "#0075de" : (interaction.lastSnappedRouteId === route.parentId ? "#f59e0b" : "#0075de")}
                        resolution={[$size.width, $size.height]}
                        transparent
                        opacity={userState.ui.selectedRouteId === route.parentId ? 1 : 0.4}
                    />
                </T.Mesh>

                <!-- Vertex Dots (only for selected/hovered routes to reduce clutter) -->
                {#if userState.ui.selectedRouteId === route.parentId || interaction.hoverSnappedRouteId === route.parentId}
                    {#each route.rawPoints as p}
                        <T.Mesh position={[p.x, p.y, p.z]}>
                            <T.SphereGeometry args={[0.015]} />
                            <T.MeshBasicMaterial color={userState.ui.selectedRouteId === route.parentId ? "#0075de" : "#f59e0b"} />
                        </T.Mesh>
                    {/each}
                {/if}
                {#if route.curve}
                    <T.Mesh onclick={(e) => { e.stopPropagation(); userState.ui.selectedRouteId = (userState.ui.selectedRouteId === route.parentId) ? null : route.parentId; }}
                        ondblclick={(e) => interaction.handleRouteDblClick(e, route.parentId, activeTool)}
                        onpointermove={(e) => interaction.handleMeshPointerMove(e, activeTool)}>
                        <T is={TubeGeometry} args={[route.curve, route.rawPoints.length, 0.15, 4, false]} />
                        <T.MeshBasicMaterial transparent opacity={0} depthWrite={false} />
                    </T.Mesh>
                {/if}
        {/if}
    {/each}

    {#each visualClusters as cluster (cluster.id)}
        <T.Mesh position={cluster.anchor} onclick={(e) => { e.stopPropagation(); userState.clustering.selectedClusterId = cluster.id; }}>
            <T.SphereGeometry args={[userState.clustering.selectedClusterId === cluster.id ? 0.12 : 0.08]} />
            <T.MeshBasicMaterial color={cluster.color} />
        </T.Mesh>
        {#if userState.clustering.showAnnotations}
            <CssObject position={cluster.anchor} scaleWithZoom={true}>
                <div class="annotation !bg-black/50 !text-white !p-1 !rounded !text-[8px] border border-white/20 {userState.clustering.selectedClusterId === cluster.id ? '!border-cyan-400 !bg-cyan-900/80' : ''}">
                    {cluster.members.length}
                </div>
            </CssObject>
        {/if}
    {/each}

    {#each visualRawHits as hit (hit.id)}
        <T.Mesh position={hit.pos}><T.SphereGeometry args={[0.02]} /><T.MeshBasicMaterial color={hit.color} transparent opacity={0.6} /></T.Mesh>
    {/each}

    {#each visualCameras as cam (cam.id)}
        <T.Mesh position={cam.pos}><T.SphereGeometry args={[0.05]} /><T.MeshBasicMaterial color="#0075de" /></T.Mesh>
    {/each}
</T.Group>
