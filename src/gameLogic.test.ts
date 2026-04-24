import test from 'node:test';
import assert from 'node:assert/strict';
import { compareWinners, hasBingo, shouldClaimWin, sortPlayers, type BingoSquare, type PlayerRecord } from './gameLogic';

const createBoard = (checkedIndexes: number[]): BingoSquare[] =>
  Array.from({ length: 9 }, (_, id) => ({
    id,
    title: `Track ${id + 1}`,
    checked: checkedIndexes.includes(id),
  }));

test('compareWinners uses wonAt as primary sort key', () => {
  const playerA: PlayerRecord = { id: 'a', wonAt: 1000 };
  const playerB: PlayerRecord = { id: 'b', wonAt: 2000 };

  assert.ok(compareWinners(playerA, playerB) < 0, 'Player A won earlier, should be sorted first');
  assert.ok(compareWinners(playerB, playerA) > 0, 'Player B won later, should be sorted second');

  // Verify it handles undefined correctly (Number.MAX_SAFE_INTEGER fallback)
  const playerC: PlayerRecord = { id: 'c' }; // wonAt undefined
  assert.ok(compareWinners(playerA, playerC) < 0, 'Player A won, Player C undefined, A first');
});

test('compareWinners uses winOrder as secondary sort key', () => {
  const playerA: PlayerRecord = { id: 'a', wonAt: 1000, winOrder: 1 };
  const playerB: PlayerRecord = { id: 'b', wonAt: 1000, winOrder: 2 };

  assert.ok(compareWinners(playerA, playerB) < 0, 'Same wonAt, Player A has lower winOrder, should be sorted first');
  assert.ok(compareWinners(playerB, playerA) > 0, 'Same wonAt, Player B has higher winOrder, should be sorted second');

  // Verify it handles undefined correctly
  const playerC: PlayerRecord = { id: 'c', wonAt: 1000 }; // winOrder undefined
  assert.ok(compareWinners(playerA, playerC) < 0, 'Player A has winOrder, Player C undefined, A first');
});

test('compareWinners uses updatedAt as tertiary sort key', () => {
  const playerA: PlayerRecord = { id: 'a', wonAt: 1000, winOrder: 1, updatedAt: { toMillis: () => 100 } };
  const playerB: PlayerRecord = { id: 'b', wonAt: 1000, winOrder: 1, updatedAt: { toMillis: () => 200 } };

  assert.ok(compareWinners(playerA, playerB) < 0, 'Same wonAt and winOrder, Player A updated earlier, should be sorted first');
  assert.ok(compareWinners(playerB, playerA) > 0, 'Same wonAt and winOrder, Player B updated later, should be sorted second');

  // Verify it handles undefined correctly
  const playerC: PlayerRecord = { id: 'c', wonAt: 1000, winOrder: 1 }; // updatedAt undefined
  assert.ok(compareWinners(playerA, playerC) < 0, 'Player A has updatedAt, Player C undefined, A first');
});

test('compareWinners uses id as fallback sort key', () => {
  const playerA: PlayerRecord = { id: 'a', wonAt: 1000, winOrder: 1, updatedAt: { toMillis: () => 100 } };
  const playerB: PlayerRecord = { id: 'b', wonAt: 1000, winOrder: 1, updatedAt: { toMillis: () => 100 } };

  assert.ok(compareWinners(playerA, playerB) < 0, 'Same wonAt, winOrder, updatedAt, Player A id sorts first');
  assert.ok(compareWinners(playerB, playerA) > 0, 'Same wonAt, winOrder, updatedAt, Player B id sorts second');
});

test('hasBingo detects complete winning row only when titles are filled', () => {
  const board = createBoard([0, 1, 2]);
  board[0].artworkUrl = 'https://example.com/cover.jpg';
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
