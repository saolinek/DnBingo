import test from 'node:test';
import assert from 'node:assert/strict';
import { hasBingo, shouldClaimWin, sortPlayers, type BingoSquare, type PlayerRecord } from './gameLogic';

const createBoard = (checkedIndexes: number[]): BingoSquare[] =>
  Array.from({ length: 9 }, (_, id) => ({
    id,
    title: `Track ${id + 1}`,
    checked: checkedIndexes.includes(id),
  }));

test('hasBingo detects complete winning row only when titles are filled', () => {
  const board = createBoard([0, 1, 2]);
  assert.equal(hasBingo(board), true);

  const boardWithEmptyTitle = createBoard([0, 1, 2]);
  boardWithEmptyTitle[1].title = '   ';
  assert.equal(hasBingo(boardWithEmptyTitle), false);
});

test('shouldClaimWin stops re-claiming after bingo was already awarded', () => {
  const winningBoard = createBoard([0, 1, 2]);
  assert.equal(shouldClaimWin({ hasWon: false, isClaimingWin: false, currentSquares: winningBoard }), true);
  assert.equal(shouldClaimWin({ hasWon: true, isClaimingWin: false, currentSquares: winningBoard }), false);
  assert.equal(shouldClaimWin({ hasWon: false, isClaimingWin: true, currentSquares: winningBoard }), false);

  const boardAfterUncheck = createBoard([0, 1]);
  assert.equal(shouldClaimWin({ hasWon: true, isClaimingWin: false, currentSquares: boardAfterUncheck }), false);
});

test('sortPlayers keeps winners stable even with timestamp ties', () => {
  const players: PlayerRecord[] = [
    { id: 'bbb', hasWon: true, wonAt: 1000, winOrder: 2, updatedAt: { toMillis: () => 2000 } },
    { id: 'aaa', hasWon: true, wonAt: 1000, winOrder: 1, updatedAt: { toMillis: () => 3000 } },
    { id: 'ccc', hasWon: false, checkedCount: 8 },
  ];

  const sorted = sortPlayers(players);
  assert.deepEqual(sorted.map(player => player.id), ['aaa', 'bbb', 'ccc']);
});

test('sortPlayers falls back to deterministic ids for non-winners with same progress', () => {
  const players: PlayerRecord[] = [
    { id: 'player-c', hasWon: false, checkedCount: 4 },
    { id: 'player-a', hasWon: false, checkedCount: 4 },
    { id: 'player-b', hasWon: false, checkedCount: 4 },
  ];

  const sorted = sortPlayers(players);
  assert.deepEqual(sorted.map(player => player.id), ['player-a', 'player-b', 'player-c']);
});
