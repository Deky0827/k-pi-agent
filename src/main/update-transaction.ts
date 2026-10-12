export interface PayloadPointers<Runtime, PiWeb> {
  runtime: Runtime;
  piWeb: PiWeb;
}

export async function commitPayloadPointers<Runtime, PiWeb>(
  previous: PayloadPointers<Runtime, PiWeb>,
  next: PayloadPointers<Runtime, PiWeb>,
  operations: {
    writeJournal: () => Promise<void>;
    clearJournal: () => Promise<void>;
    activateRuntime: (value: Runtime) => Promise<void>;
    activatePiWeb: (value: PiWeb) => Promise<void>;
  }
): Promise<void> {
  await operations.writeJournal();
  try {
    await operations.activateRuntime(next.runtime);
    await operations.activatePiWeb(next.piWeb);
    await operations.clearJournal();
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    await operations.activateRuntime(previous.runtime).catch((rollbackError) => rollbackErrors.push(rollbackError));
    await operations.activatePiWeb(previous.piWeb).catch((rollbackError) => rollbackErrors.push(rollbackError));
    if (!rollbackErrors.length) {
      await operations.clearJournal().catch((rollbackError) => rollbackErrors.push(rollbackError));
    }
    if (rollbackErrors.length) {
      throw new AggregateError([error, ...rollbackErrors], "Update failed and immediate rollback was incomplete; the recovery record will be retried at startup.");
    }
    throw error;
  }
}
