import { access, rename, rm } from "node:fs/promises";

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

export async function replaceDirectory(staging: string, destination: string): Promise<void> {
  const backup = `${destination}.backup`;
  if (await exists(backup)) {
    if (await exists(destination)) await rm(backup, { recursive: true, force: true, maxRetries: 3 });
    else await rename(backup, destination);
  }

  const hadDestination = await exists(destination);
  if (hadDestination) await rename(destination, backup);
  try {
    await rename(staging, destination);
  } catch (error) {
    if (hadDestination) {
      try {
        await rename(backup, destination);
      } catch (restoreError) {
        throw new AggregateError([error, restoreError], `Could not replace ${destination}; the original remains at ${backup}.`);
      }
    }
    throw error;
  }

  await rm(backup, { recursive: true, force: true, maxRetries: 3 }).catch(() => undefined);
}
