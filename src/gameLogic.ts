export interface BingoSquare {
  id: number;
  title: string;
  checked: boolean;
  artworkUrl?: string;
}

export interface SortableTimestamp {
  toMillis?: () => number;
}

export interface PlayerRecord {
  id: string;
  name?: string;
  checkedCount?: number;
  hasWon?: boolean;
  wonAt?: number;
  winOrder?: number;
  updatedAt?: SortableTimestamp | null;
}

export const getCheckedCount = (board: BingoSquare[]) => board.filter(square => square.checked).length;

export const getSortableTime = (value: unknown) => {
  if (typeof value === 'number') {
    return value;
  }

  if (value && typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function') {
    return value.toMillis();
  }

  return Number.MAX_SAFE_INTEGER;
};

export const compareWinners = (a: PlayerRecord, b: PlayerRecord) => {
  const aWonAt = getSortableTime(a.wonAt);
  const bWonAt = getSortableTime(b.wonAt);
  if (aWonAt !== bWonAt) {
    return aWonAt - bWonAt;
  }

  const aWinOrder = typeof a.winOrder === 'number' ? a.winOrder : Number.MAX_SAFE_INTEGER;
  const bWinOrder = typeof b.winOrder === 'number' ? b.winOrder : Number.MAX_SAFE_INTEGER;
  if (aWinOrder !== bWinOrder) {
    return aWinOrder - bWinOrder;
  }

  const aUpdatedAt = getSortableTime(a.updatedAt);
  const bUpdatedAt = getSortableTime(b.updatedAt);
  if (aUpdatedAt !== bUpdatedAt) {
    return aUpdatedAt - bUpdatedAt;
  }

  return a.id.localeCompare(b.id);
};

export const sortPlayers = (players: PlayerRecord[]) => {
  return [...players].sort((a, b) => {
    if (a.hasWon && !b.hasWon) return -1;
    if (!a.hasWon && b.hasWon) return 1;
    if (a.hasWon && b.hasWon) {
      return compareWinners(a, b);
    }

    const checkedCountDiff = (b.checkedCount || 0) - (a.checkedCount || 0);
    if (checkedCountDiff !== 0) {
      return checkedCountDiff;
    }

    return a.id.localeCompare(b.id);
  });
};

export const hasBingo = (currentSquares: BingoSquare[]) => {
  const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  return winPatterns.some(pattern =>
    pattern.every(index => currentSquares[index].checked && currentSquares[index].title.trim() !== '')
  );
};

export const shouldClaimWin = (params: {
  hasWon: boolean;
  isClaimingWin: boolean;
  currentSquares: BingoSquare[];
}) => {
  if (params.hasWon || params.isClaimingWin) {
    return false;
  }

  return hasBingo(params.currentSquares);
};
