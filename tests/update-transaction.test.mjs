import assert from "node:assert/strict";
import test from "node:test";
import { commitPayloadPointers } from "../dist/main/update-transaction.js";

test("payload pointer commit rolls both versions back when the second activation fails", async () => {
  const previous = { runtime: "node-old", piWeb: "web-old" };
  const next = { runtime: "node-new", piWeb: "web-new" };
  const active = { ...previous };
  let journal = false;
  let failNewPiWebOnce = true;
  await assert.rejects(commitPayloadPointers(previous, next, {
    writeJournal: async () => { journal = true; },
    clearJournal: async () => { journal = false; },
    activateRuntime: async (value) => { active.runtime = value; },
    activatePiWeb: async (value) => {
      if (value === "web-new" && failNewPiWebOnce) { failNewPiWebOnce = false; throw new Error("simulated pointer failure"); }
      active.piWeb = value;
    }
  }), /simulated pointer failure/);
  assert.deepEqual(active, previous);
  assert.equal(journal, false);
});

test("payload pointer commit keeps the journal if rollback cannot finish", async () => {
  let journal = false;
  let piWebWrites = 0;
  await assert.rejects(commitPayloadPointers(
    { runtime: "node-old", piWeb: "web-old" },
    { runtime: "node-new", piWeb: "web-new" },
    {
      writeJournal: async () => { journal = true; },
      clearJournal: async () => { journal = false; },
      activateRuntime: async () => { throw new Error("runtime pointer unavailable"); },
      activatePiWeb: async () => {
        piWebWrites++;
        if (piWebWrites === 1) throw new Error("Pi Web pointer unavailable");
      }
    }
  ), /rollback was incomplete/);
  assert.equal(journal, true);
});
