import pLimit from "p-limit";

/** Rows generated at once in Bulk CSV Studio. One: each row finishes before the next starts, so the active row moves in order. */
export const BULK_STUDIO_ROW_CONCURRENCY = 1;

export const BULK_PROCESSING_CANCELLED_MESSAGE = "Processing cancelled";

/**
 * Runs `runRow` for every index with at most `concurrency` in flight. `runRow` owns its own
 * error handling (a failed row must not stop others). Rows not yet started when `signal`
 * aborts throw the cancel error; rows already running finish before this resolves.
 */
export async function runBulkRowsInParallel(args: {
  rowCount: number;
  signal: AbortSignal;
  runRow: (rowIndex: number) => Promise<void>;
  concurrency?: number;
}): Promise<void> {
  const limit = pLimit(args.concurrency ?? BULK_STUDIO_ROW_CONCURRENCY);
  const settled = await Promise.allSettled(
    Array.from({ length: args.rowCount }, (_, rowIndex) =>
      limit(async () => {
        if (args.signal.aborted) throw new Error(BULK_PROCESSING_CANCELLED_MESSAGE);
        await args.runRow(rowIndex);
      }),
    ),
  );
  const rejected = settled.find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (rejected) throw rejected.reason;
}
