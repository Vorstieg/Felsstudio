/**
 * Build the public controller exposed to crag editor descendants.
 * The editor supplies behavior; this module defines the stable domain shape.
 */
export function createCragEditorController({
	onBack, onStartRoutingDraft, onSetTrackDraftMode, onHandleTrackConfirm, onCancelTrackEdit,
	onUndoTrackPoint, onStartTrackCut, onConfirmTrackCut, onCancelTrackCut, onReverseTrack,
	onTrimTrackStart, onTrimTrackEnd, onSimplifyTrack, onGpxUpload, onExport, onCenterMapOnUser,
	onUndo, onRedo, onAddCragImages, onRemoveCragImage, onAddEquipmentItem, onRemoveEquipmentItem,
	onSetHoverHighlight, onClearDetectedAssets, onAddDetectedAsset, onRemoveAccessFeature,
	onEditTrack, onRemoveTrack, onFinalizeTrack, onAddSector, onDuplicateSector, onRemoveSector,
	onMoveSector, onSetSectorGeometryType, onFocusSector, onUndoSectorVertexDelete, onPlanGenerated,
	onAddParentRoute, onAddSectorRoute, onSelectRoute, onUpdateRoute, onAddRoutePath,
	onAssignExistingRoutePath, onCreateRoutePathFromAccess, onEditRoutePath, onUpdateRoutePath,
	onRemoveRoutePath, onDeleteRoutePath, onDeleteRoute
}) {
	return {
		toolbar: {
			onBack, onStartRoutingDraft, onSetTrackDraftMode, onHandleTrackConfirm, onCancelTrackEdit,
			onUndoTrackPoint, onStartTrackCut, onConfirmTrackCut, onCancelTrackCut, onReverseTrack,
			onTrimTrackStart, onTrimTrackEnd, onSimplifyTrack, onGpxUpload, onExport, onCenterMapOnUser
		},
		history: { onUndo, onRedo },
		metadata: { onAddCragImages, onRemoveCragImage, onAddEquipmentItem, onRemoveEquipmentItem },
		access: { onSetHoverHighlight, onClearDetectedAssets, onAddDetectedAsset, onRemoveAccessFeature },
		tracks: { onEditTrack, onRemoveTrack, onFinalizeTrack, onCancelTrackEdit },
		sectors: {
			onAddSector, onDuplicateSector, onRemoveSector, onMoveSector, onSetSectorGeometryType,
			onFocusSector, onUndoSectorVertexDelete, onPlanGenerated
		},
		routes: {
			onAddParentRoute, onAddSectorRoute, onSelectRoute, onUpdateRoute, onAddRoutePath,
			onAssignExistingRoutePath, onCreateRoutePathFromAccess, onEditRoutePath, onUpdateRoutePath,
			onRemoveRoutePath, onDeleteRoutePath, onDeleteRoute
		}
	};
}
