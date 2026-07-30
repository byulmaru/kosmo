const copiedStrings: string[] = [];
let nextFailure: Error | null = null;

export function getCopiedStrings(): readonly string[] {
  return copiedStrings;
}

export function resetClipboardMock(): void {
  copiedStrings.length = 0;
  nextFailure = null;
}

export function setNextClipboardFailure(error: Error): void {
  nextFailure = error;
}

export async function setStringAsync(value: string): Promise<void> {
  if (nextFailure) {
    const error = nextFailure;
    nextFailure = null;
    throw error;
  }
  copiedStrings.push(value);
}
