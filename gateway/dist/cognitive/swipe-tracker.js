import { strikeRepo, strikeTagRepo, bondRepo, todoRepo } from "../db/repositories/index.js";
import { query } from "../db/pool.js";
import { writeStrikeEmbedding } from "./embed-writer.js";
export async function recordSwipe(event) {
    const { userId, strikeId, direction, reason } = event;
    if (direction === "right") {
        await handleRightSwipe(userId, strikeId);
    }
    else {
        await handleLeftSwipe(userId, strikeId, reason);
    }
}
async function handleRightSwipe(userId, strikeId) {
    // The strikeId from ActionPanel can be a todo ID or a strike ID.
    // Try todo first (action-panel uses todo.id as strikeId for todo-sourced items).
    const todo = await query(`SELECT * FROM todo WHERE id = $1 AND done = false LIMIT 1`, [strikeId]);
    if (todo.length > 0) {
        await todoRepo.update(todo[0].id, { done: true });
        console.log(`[swipe] right: todoId=${strikeId} → done`);
        return;
    }
    // Otherwise treat as a strike — tag it completed
    await strikeTagRepo.create({
        strike_id: strikeId,
        label: "completed",
        created_by: "user_swipe",
    });
    console.log(`[swipe] right: strikeId=${strikeId} → completed`);
}
async function handleLeftSwipe(userId, strikeId, reason) {
    switch (reason) {
        case "wait":
            await strikeTagRepo.create({
                strike_id: strikeId,
                label: "waiting_condition",
                created_by: "user_swipe",
            });
            break;
        case "blocked": {
            // Fetch original strike to get action text
            const original = await strikeRepo.findById(strikeId);
            const actionText = original?.nucleus ?? "未知行动";
            // Create a Feel-type strike
            const feelStrike = await strikeRepo.create({
                user_id: userId,
                nucleus: `用户对「${actionText}」感到有阻力`,
                polarity: "feel",
                source_type: "swipe",
                confidence: 0.8,
                salience: 0.6,
            });
            void writeStrikeEmbedding(feelStrike.id, feelStrike.nucleus);
            // Bond it to the original
            await bondRepo.create({
                source_strike_id: strikeId,
                target_strike_id: feelStrike.id,
                type: "resistance",
                created_by: "user_swipe",
            });
            break;
        }
        case "rethink":
            await strikeTagRepo.create({
                strike_id: strikeId,
                label: "rethinking",
                created_by: "user_swipe",
            });
            break;
        default:
            // 'later' or no reason → skipped
            await strikeTagRepo.create({
                strike_id: strikeId,
                label: "skipped",
                created_by: "user_swipe",
            });
            break;
    }
    console.log(`[swipe] left: strikeId=${strikeId} reason=${reason ?? "later"}`);
}
//# sourceMappingURL=swipe-tracker.js.map