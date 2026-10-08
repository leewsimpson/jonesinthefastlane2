/** Building art per location id (art-direction §6), shared by the Pixi board and the DOM location header. */
import { content } from '../game/engine.ts';

/** The atlas frame for a location; home shows the player's housing tier. */
export function buildingFrame(id: string, housingTier: string | undefined): string {
  if (id === content.city.board.home) {
    const tier = Math.max(
      0,
      content.city.housing.findIndex((h) => h.id === housingTier),
    );
    return `your-place-${tier + 1}`;
  }
  return id;
}
