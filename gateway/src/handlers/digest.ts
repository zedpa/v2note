/**
 * Digest Level 1 — core pipeline.
 * Decomposes records into Strikes, creates internal Bonds,
 * then links new Strikes to historical ones via cross-record Bonds.
 */

import { chatCompletion, type ChatMessage } from "../ai/provider.js";
import {
  strikeRepo,
  bondRepo,
  strikeTagRepo,
  recordRepo,
  transcriptRepo,
  summaryRepo,
} from "../db/repositories/index.js";
import { buildDigestPrompt, buildCrossLinkPrompt } from "./digest-prompt.js";

interface RawStrike {
  nucleus: string;
  polarity: string;
  confidence: number;
  tags: string[];
}

interface RawBond {
  source_idx: number;
  target_idx: number;
  type: string;
  strength: number;
}

interface RawCrossBond {
  new_idx: number;
  history_id: string;
  type: string;
  strength: number;
}

interface RawSupersede {
  new_idx: number;
  history_id: string;
}

/**
 * Main digest entry point.
 * Processes a batch of records through the full cognitive pipeline.
 */
export async function digestRecords(
  recordIds: string[],
  context: { deviceId: string; userId?: string },
): Promise<void> {
  const userId = context.userId ?? context.deviceId;

  try {
    // ── Step 1: Load records & text ──────────────────────────────
    const records = await Promise.all(
      recordIds.map((id) => recordRepo.findById(id)),
    );
    const validIds = records
      .filter((r) => r !== null)
      .map((r) => r!.id);

    // Build sourceType mapping: material stays material, everything else → think
    const sourceTypeMap = new Map<string, string>();
    for (const r of records.filter(Boolean)) {
      sourceTypeMap.set(r!.id, r!.source_type === "material" ? "material" : "think");
    }

    if (validIds.length === 0) {
      console.warn("[digest] No valid records found for ids:", recordIds);
      return;
    }

    const transcripts = await transcriptRepo.findByRecordIds(validIds);
    const summaries = await Promise.all(
      validIds.map((id) => summaryRepo.findByRecordId(id)),
    );

    // Build id → text map: prefer summary, fallback to transcript
    const summaryByRecord = new Map(
      summaries.filter(Boolean).map((s) => [s!.record_id, s!.short_summary || s!.long_summary]),
    );
    const transcriptByRecord = new Map(
      transcripts.map((t) => [t.record_id, t.text]),
    );

    const textParts: string[] = [];
    for (const id of validIds) {
      const text = summaryByRecord.get(id) ?? transcriptByRecord.get(id);
      if (text) {
        textParts.push(validIds.length > 1 ? `[记录 ${id}]\n${text}` : text);
      }
    }

    if (textParts.length === 0) {
      console.warn("[digest] No text content for records:", validIds);
      return;
    }

    const combinedText = textParts.join("\n\n---\n\n");

    // ── Step 2: AI decomposition (1st call) ──────────────────────
    const digestMessages: ChatMessage[] = [
      { role: "system", content: buildDigestPrompt() },
      { role: "user", content: combinedText },
    ];

    const digestResp = await chatCompletion(digestMessages, {
      json: true,
      temperature: 0.3,
    });

    let rawStrikes: RawStrike[];
    let rawBonds: RawBond[];
    try {
      const parsed = JSON.parse(digestResp.content);
      rawStrikes = parsed.strikes ?? [];
      rawBonds = parsed.bonds ?? [];
    } catch (e) {
      console.error("[digest] Failed to parse AI response as JSON:", e);
      return; // don't mark as digested
    }

    if (rawStrikes.length === 0) {
      console.log("[digest] AI returned no strikes, skipping");
      await markAllDigested(validIds);
      return;
    }

    // ── Step 3: Write Strikes to DB ──────────────────────────────
    const idxToId = new Map<number, string>();

    for (let i = 0; i < rawStrikes.length; i++) {
      const s = rawStrikes[i];
      try {
        const entry = await strikeRepo.create({
          user_id: userId,
          nucleus: s.nucleus,
          polarity: s.polarity,
          confidence: s.confidence ?? 0.5,
          source_id: validIds[0],
          source_type: sourceTypeMap.get(validIds[0]) ?? "think",
        });
        idxToId.set(i, entry.id);

        // Write tags
        if (s.tags && s.tags.length > 0) {
          await strikeTagRepo.createMany(
            s.tags.map((label) => ({
              strike_id: entry.id,
              label,
            })),
          );
        }
      } catch (e) {
        console.error(`[digest] Failed to write strike ${i}:`, e);
      }
    }

    // ── Step 4: Write internal Bonds ─────────────────────────────
    const bondsToInsert = rawBonds
      .filter((b) => idxToId.has(b.source_idx) && idxToId.has(b.target_idx))
      .map((b) => ({
        source_strike_id: idxToId.get(b.source_idx)!,
        target_strike_id: idxToId.get(b.target_idx)!,
        type: b.type,
        strength: b.strength ?? 0.5,
        created_by: "digest",
      }));

    if (bondsToInsert.length > 0) {
      try {
        await bondRepo.createMany(bondsToInsert);
      } catch (e) {
        console.error("[digest] Failed to write internal bonds:", e);
      }
    }

    // ── Step 5: Retrieve historical Strikes ──────────────────────
    let historyStrikes: Awaited<ReturnType<typeof strikeRepo.findActive>> = [];

    try {
      // Try hybrid retrieval if CE-03 module exists
      const retrieval = await import("../cognitive/retrieval.js").catch(
        () => null,
      );
      if (retrieval?.hybridRetrieve) {
        const allTags = rawStrikes.flatMap((s) => s.tags ?? []);
        const combinedNucleus = rawStrikes.map((s) => s.nucleus).join("\n");
        const results = await retrieval.hybridRetrieve(
          combinedNucleus,
          allTags,
          userId,
          { limit: 20 },
        );
        historyStrikes = results.map(
          (r: { strike: (typeof historyStrikes)[number] }) => r.strike,
        );
      } else {
        historyStrikes = await strikeRepo.findActive(userId, 20);
      }
    } catch {
      historyStrikes = await strikeRepo.findActive(userId, 20);
    }

    // Exclude strikes we just created
    const newIds = new Set(idxToId.values());
    historyStrikes = historyStrikes.filter((s) => !newIds.has(s.id));

    // ── Step 6: Cross-record Bonds (2nd AI call) ─────────────────
    if (historyStrikes.length > 0) {
      try {
        const newStrikesList = rawStrikes.map((s, i) => ({
          idx: i,
          nucleus: s.nucleus,
          polarity: s.polarity,
        }));

        const historyList = historyStrikes.map((s) => ({
          id: s.id,
          nucleus: s.nucleus,
          polarity: s.polarity,
        }));

        const crossMessages: ChatMessage[] = [
          { role: "system", content: buildCrossLinkPrompt() },
          {
            role: "user",
            content: `新 Strike：\n${JSON.stringify(newStrikesList, null, 2)}\n\n历史 Strike：\n${JSON.stringify(historyList, null, 2)}`,
          },
        ];

        const crossResp = await chatCompletion(crossMessages, {
          json: true,
          temperature: 0.3,
        });

        let crossBonds: RawCrossBond[] = [];
        let supersedes: RawSupersede[] = [];
        try {
          const parsed = JSON.parse(crossResp.content);
          crossBonds = parsed.cross_bonds ?? [];
          supersedes = parsed.supersedes ?? [];
        } catch (e) {
          console.error("[digest] Failed to parse cross-link JSON:", e);
        }

        // Write cross bonds
        const crossToInsert = crossBonds
          .filter((b) => idxToId.has(b.new_idx))
          .map((b) => ({
            source_strike_id: idxToId.get(b.new_idx)!,
            target_strike_id: b.history_id,
            type: b.type,
            strength: b.strength ?? 0.5,
            created_by: "digest-cross",
          }));

        if (crossToInsert.length > 0) {
          await bondRepo.createMany(crossToInsert);
        }

        // Handle supersedes
        for (const sup of supersedes) {
          const newId = idxToId.get(sup.new_idx);
          if (newId) {
            try {
              await strikeRepo.updateStatus(
                sup.history_id,
                "superseded",
                newId,
              );
            } catch (e) {
              console.error(
                `[digest] Failed to supersede ${sup.history_id}:`,
                e,
              );
            }
          }
        }
      } catch (e) {
        console.error("[digest] Cross-link phase failed:", e);
        // Internal bonds are still preserved
      }
    }

    // ── Step 7: Mark records as digested ─────────────────────────
    await markAllDigested(validIds);
  } catch (e) {
    console.error("[digest] Pipeline failed:", e);
    // Don't rethrow — digest failure should not crash the caller
  }
}

async function markAllDigested(ids: string[]): Promise<void> {
  await Promise.all(
    ids.map((id) =>
      recordRepo.markDigested(id).catch((e: unknown) => {
        console.error(`[digest] Failed to mark record ${id} as digested:`, e);
      }),
    ),
  );
}
