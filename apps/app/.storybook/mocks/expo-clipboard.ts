const copiedStrings: string[] = [];
let nextResult: boolean | null = null;

export function getCopiedStrings(): readonly string[] {
  return copiedStrings;
}

export function resetClipboardMock(): void {
  copiedStrings.length = 0;
  nextResult = null;
}

export function setNextClipboardResult(result: boolean): void {
  nextResult = result;
}

export async function setStringAsync(value: string): Promise<boolean> {
  if (nextResult !== null) {
    const result = nextResult;
    nextResult = null;
    if (!result) {
      return false;
    }
  }
  copiedStrings.push(value);
  return true;
}
