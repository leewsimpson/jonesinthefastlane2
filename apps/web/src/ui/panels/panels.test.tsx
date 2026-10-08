// @vitest-environment happy-dom
/** Component tests (tech-stack §6): the action sheet and the end-week check, rendered with Testing Library. */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { engine } from '../../game/engine.ts';
import '../../i18n/i18n.ts';
import { rowKey } from '../common/hotkeys.ts';
import { ActionSheet, groupActions } from './ActionSheet.tsx';
import { EndWeekDialog } from './EndWeekDialog.tsx';

afterEach(cleanup);
// Art loads its atlas over the network; the tests are about the controls, so it never arrives.
vi.stubGlobal('fetch', () => new Promise(() => {}));

function newGame() {
  const { state } = engine.newGame({
    seed: 'panels',
    players: [{ name: 'Ana', controller: 'human' }],
  });
  const me = state.players[0];
  if (!me) throw new Error('no player');
  return { state, me };
}

describe('ActionSheet', () => {
  it('lists what can be done here with keys, previews and reasons, and picks on click', () => {
    const { state, me } = newGame();
    const groups = groupActions(engine.listActions(state), rowKey);
    const onPick = vi.fn();
    render(
      <ActionSheet
        location={me.location}
        week={state.week}
        housingTier={me.housing.tier}
        world={state.world}
        groups={groups}
        canAct
        onPick={onPick}
      />,
    );
    const nap = screen.getByRole('button', { name: /Take a nap/ });
    expect(within(nap).getByText('1')).toBeTruthy();
    expect(nap.textContent).toMatch(/2h/);
    fireEvent.click(nap);
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ type: 'perform' }));
    // A blocked row says why instead of offering a key.
    expect(screen.getByText(/Nothing in the fridge/)).toBeTruthy();
  });
});

describe('EndWeekDialog', () => {
  const needs = { meals: 0, rentDue: 20_000, rentShort: 5_000, work: null };

  it('warns about hunger and short rent, and ends or keeps playing', () => {
    const onEnd = vi.fn();
    const onKeep = vi.fn();
    render(<EndWeekDialog open needs={needs} timeLeft={600} onKeep={onKeep} onEnd={onEnd} />);
    const dialog = screen.getByRole('dialog', { name: 'End the week now?' });
    expect(dialog.textContent).toMatch(/haven't eaten/);
    expect(dialog.textContent).toMatch(/Rent is \$50(\.00)? short/);
    expect(dialog.textContent).toMatch(/10h left/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'End week anyway' }));
    expect(onEnd).toHaveBeenCalledOnce();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep playing' }));
    expect(onKeep).toHaveBeenCalledOnce();
  });

  it('says nothing about food or rent when both are covered', () => {
    render(
      <EndWeekDialog
        open
        needs={{ ...needs, meals: 1, rentShort: 0 }}
        timeLeft={0}
        onKeep={() => {}}
        onEnd={() => {}}
      />,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).not.toMatch(/eaten|Rent is/);
  });
});
