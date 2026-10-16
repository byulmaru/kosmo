const copiedStrings: string[] = [];
let nextResult: boolean | null = null;
let nextPending = false;
let pendingCopy: {
  resolve: (result: boolean) => void;
  value: string;
} | null = null;

export function getCopiedStrings(): readonly string[] {
  return copiedStrings;
}

export function resetClipboardMock(): void {
  copiedStrings.length = 0;
  nextResult = null;
  nextPending = false;
  pendingCopy = null;
}

export function setNextClipboardResult(result: boolean): void {
  nextResult = result;
}

export function setNextClipboardPending(): void {
  nextPending = true;
}

export function resolvePendingClipboard(result: boolean): void {
  if (!pendingCopy) {
    throw new Error('No pending clipboard copy is waiting for a result.');
  }
  const copy = pendingCopy;
  pendingCopy = null;
  if (result) {
    copiedStrings.push(copy.value);
  }
  copy.resolve(result);
}

export async function setStringAsync(value: string): Promise<boolean> {
  if (nextPending) {
    nextPending = false;
    return new Promise((resolve) => {
      pendingCopy = { resolve, value };
    });
  }
  const result = nextResult ?? true;
  nextResult = null;
  if (result) {
    copiedStrings.push(value);
  }
  return result;
}
