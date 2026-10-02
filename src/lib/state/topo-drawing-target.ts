import type { InteractionId } from './topo-2d-editor-interactions.ts';

export type TopoDrawingTarget =
	| { type: 'route'; routeId: InteractionId }
	| { type: 'newPitch'; routeId: InteractionId }
	| { type: 'pitch'; routeId: InteractionId; pitchId: InteractionId }
	| { type: 'variant'; routeId: InteractionId; variantId: InteractionId };
