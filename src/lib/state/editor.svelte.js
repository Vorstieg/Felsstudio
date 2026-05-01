import { Vector3 } from 'three';

export const userState = $state({
	topo: {
		name: '',
		description: '',
		rock: 'granite',
		tags: [],
		routes: [],
		fixPoints: [], // Unified markers: [{id, type, position: [x,y,z], position2D: [x,y], rotation2D, scale2D}]
		outlines: [], // Rock outlines: [{id, points2D: [[x,y], ...]}]
		date: '',
		updated: '',
		modelOffset: [0, 0, 0],
		coordinates: [0, 0],
		wallAzimuth: 0,
		altitude: 0,
		scale: 1,
		// 2D TOPO Editor fields
		image2D: null, // Base64 data URL or external URL, null for blank canvas
		imageAspectRatio: 1.5, // Width/Height ratio for responsive rendering
		editorMode: '3d' // '2d' | '3d' - which editor is active
	},
	// UI State for the editor
	ui: {
		workspace: null, // '3d-create' | '3d-edit' | '2d-create' | '2d-edit'
		selectedRouteId: null, // ID of the route currently selected for editing
		selectedOutlineId: null, // ID of the rock outline currently selected for editing
		selectedFixpointId: null,
		selectedSymbol: 'bolt',
		activeDraftId: null,
		lastSaved: null,
		modelUrl: null, // Temporary Blob URL for the 3D model
		glbBlob: null, // Persistable Blob for the 3D model
		modelRevision: 0, // Counter to trigger auto-save on geometry changes
		targetCameraPosition: new Vector3(0, 1, 5),
		targetControlsTarget: new Vector3(0, 0, 0)
	},
	// Data for clustering pipeline
	clustering: {
		radius: 0.2,
		minConfidence: 0.23,
		maxEdgeDist: 1.0,
		minAngleCos: 0.66,
		maxCamDist: 50,
		minViewSpread: 0.4,
		minObservations: 4,

		rawHits: [], // All imported hits from detections.json
		clusters: [], // Final grouped bolts/fixpoints
		selectedClusterId: null, // ID of the cluster currently being inspected
		cropsMap: {}, // Map of local crop Object URLs

		cameraPositions: {}, // frameIndex -> [x,y,z]
		gpsData: {}, // frameIndex -> {lat, lon, alt, ...}
		registrationCsv: null, // Raw content of registration.csv

		// UI Toggles
		showRawHits: false,
		showAnnotations: false,
		showCameraTrail: false,

		stats: {
			totalHits: 0,
			confCut: 0,
			edgeCut: 0,
			angleCut: 0,
			distCut: 0,
			finalHits: 0,
			initialClusters: 0,
			spreadCut: 0,
			obsCut: 0,
			finalClusters: 0
		},

		// Manual Review State for AI conversion
		review: {
			stage: null, // null | 'noise' | 'conflicts' | 'done'
			pendingIds: [], // IDs left to review in 'noise' stage
			conflictPairs: [], // [[idA, idB], ...] for 'conflicts' stage
			rejectedIds: new Set(),
			approvedIds: new Set(),
			mergedGroups: new Map() // parentId -> Set of childIds
		}
	},

	startAiConversion() {
		this.clustering.review.rejectedIds.clear();
		this.clustering.review.approvedIds.clear();
		this.clustering.review.mergedGroups.clear();

		// 1. Identify "Noisy" or "Low Confidence" clusters for stage 1
		// Criteria:
		// - < 6 observations
		// - OR overall cluster confidence < 0.35
		// - OR (only contains bolt detections AND confidence < 0.60)
		const noise = this.clustering.clusters.filter((c) => {
			const isNoisy = c.members.length < 6 || c.conf < 0.35;
			const isLowConfBolt = c.class === 'bolt' && c.conf < 0.6;
			return isNoisy || isLowConfBolt;
		});
		this.clustering.review.pendingIds = noise.map((n) => n.id);

		if (this.clustering.review.pendingIds.length > 0) {
			this.clustering.review.stage = 'noise';
			this.clustering.selectedClusterId = this.clustering.review.pendingIds[0];
		} else {
			this.findConflictPairs();
		}
	},

	findConflictPairs() {
		const clusters = this.clustering.clusters.filter(
			(c) => !this.clustering.review.rejectedIds.has(c.id)
		);
		const pairs = [];
		const threshold = 0.5; // 50cm conflict threshold

		for (let i = 0; i < clusters.length; i++) {
			for (let j = i + 1; j < clusters.length; j++) {
				const cA = clusters[i];
				const cB = clusters[j];
				const dist = Math.sqrt(
					Math.pow(cA.anchor[0] - cB.anchor[0], 2) +
						Math.pow(cA.anchor[1] - cB.anchor[1], 2) +
						Math.pow(cA.anchor[2] - cB.anchor[2], 2)
				);
				if (dist < threshold) {
					pairs.push([cA.id, cB.id]);
				}
			}
		}

		this.clustering.review.conflictPairs = pairs;
		if (pairs.length > 0) {
			this.clustering.review.stage = 'conflicts';
			this.clustering.selectedClusterId = pairs[0][0]; // Select first in pair
		} else {
			this.clustering.review.stage = 'done';
			this.clustering.selectedClusterId = null;
		}
	},

	approveCluster(id) {
		this.clustering.review.approvedIds.add(id);
		this.advanceReview();
	},

	rejectCluster(id) {
		this.clustering.review.rejectedIds.add(id);
		this.advanceReview();
	},

	mergeConflict(idA, idB, shouldMerge) {
		if (shouldMerge) {
			const cA = this.clustering.clusters.find((c) => c.id === idA);
			const cB = this.clustering.clusters.find((c) => c.id === idB);

			if (cA && cB) {
				// A is parent, B is child
				if (!this.clustering.review.mergedGroups.has(idA)) {
					this.clustering.review.mergedGroups.set(idA, new Set());
				}
				this.clustering.review.mergedGroups.get(idA).add(idB);
				this.clustering.review.rejectedIds.add(idB);

				// Combine members for correct final stats
				const totalObs = cA.members.length + cB.members.length;
				const weightA = cA.members.length / totalObs;
				const weightB = cB.members.length / totalObs;

				// Weighted Average anchor position
				cA.anchor = [
					cA.anchor[0] * weightA + cB.anchor[0] * weightB,
					cA.anchor[1] * weightA + cB.anchor[1] * weightB,
					cA.anchor[2] * weightA + cB.anchor[2] * weightB
				];

				// Merge members list
				cA.members = [...cA.members, ...cB.members];

				// Recalculate combined confidence (simple average of cluster confidences)
				cA.conf = (cA.conf + cB.conf) / 2;

				// Update remaining conflict pairs: Replace B with A
				this.clustering.review.conflictPairs = this.clustering.review.conflictPairs
					.map((pair) => {
						let [p1, p2] = pair;
						if (p1 === idB) p1 = idA;
						if (p2 === idB) p2 = idA;
						return [p1, p2];
					})
					.filter((pair) => {
						// Remove self-conflicts and ensure uniqueness
						return pair[0] !== pair[1];
					});

				// Deduplicate the pair list
				const seen = new Set();
				this.clustering.review.conflictPairs = this.clustering.review.conflictPairs.filter(
					(pair) => {
						const key = pair.sort().join('|');
						if (seen.has(key)) return false;
						seen.add(key);
						return true;
					}
				);
			}
		} else {
			// Just remove the current pair if user said "Separate"
			this.clustering.review.conflictPairs.shift();
		}

		this.advanceReview();
	},

	advanceReview() {
		if (this.clustering.review.stage === 'noise') {
			this.clustering.review.pendingIds.shift();
			if (this.clustering.review.pendingIds.length > 0) {
				this.clustering.selectedClusterId = this.clustering.review.pendingIds[0];
			} else {
				this.findConflictPairs();
			}
		} else if (this.clustering.review.stage === 'conflicts') {
			// Clean up the front of the queue if it was already processed by a previous merge
			while (this.clustering.review.conflictPairs.length > 0) {
				const [idA, idB] = this.clustering.review.conflictPairs[0];
				if (
					this.clustering.review.rejectedIds.has(idA) ||
					this.clustering.review.rejectedIds.has(idB)
				) {
					this.clustering.review.conflictPairs.shift();
				} else {
					break;
				}
			}

			if (this.clustering.review.conflictPairs.length > 0) {
				this.clustering.selectedClusterId = this.clustering.review.conflictPairs[0][0];
			} else {
				this.clustering.review.stage = 'done';
				this.clustering.selectedClusterId = null;
			}
		}
	},

	async finalizeAiConversion() {
		const confirmedClusters = this.clustering.clusters.filter(
			(c) => !this.clustering.review.rejectedIds.has(c.id)
		);
		const { generateSymbolId } = await import('$lib/assets/js/id-utils.js');

		const newFixPoints = confirmedClusters.map((c) => {
			// Map AI class to official topo type
			let type = 'bolt';
			if (c.class === 'anchor' || c.class === 'belay') type = 'belay';

			return {
				id: generateSymbolId(),
				type: type,
				position: [...c.anchor],
				meta: {
					ai_source: true,
					confidence: c.conf,
					observations: c.members.length,
					original_class: c.class
				}
			};
		});

		this.topo.fixPoints = [...this.topo.fixPoints, ...newFixPoints];

		// Reset AI state as it's now official topo data
		this.clustering.review.stage = null;
		this.clustering.rawHits = [];
		this.clustering.clusters = [];
		this.ui.workspace = '3d-edit'; // Transition to full editor
	},

	reset() {
		this.topo = {
			name: '',
			description: '',
			rock: 'granite',
			tags: [],
			routes: [],
			fixPoints: [],
			outlines: [],
			date: '',
			updated: '',
			modelOffset: [0, 0, 0],
			coordinates: [0, 0],
			wallAzimuth: 0,
			altitude: 0,
			scale: 1,
			image2D: null,
			imageAspectRatio: 1.5,
			editorMode: '3d'
		};
		if (this.ui.modelUrl) {
			URL.revokeObjectURL(this.ui.modelUrl);
		}
		this.ui.workspace = null;
		this.ui.activeDraftId = null;
		this.ui.lastSaved = null;
		this.ui.modelUrl = null;
		this.ui.glbBlob = null;
		this.clustering.rawHits = [];
		this.clustering.clusters = [];
		this.clustering.cameraPositions = {};
		this.clustering.gpsData = {};
		this.clustering.cropsMap = {};
		this.clustering.stats = {
			totalHits: 0,
			confCut: 0,
			edgeCut: 0,
			angleCut: 0,
			distCut: 0,
			finalHits: 0,
			initialClusters: 0,
			spreadCut: 0,
			obsCut: 0,
			finalClusters: 0
		};
	}
});
