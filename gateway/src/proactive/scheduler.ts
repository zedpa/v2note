/**
 * Smart scheduler — suggests time slots for unscheduled todos.
 */

export interface ScheduleSlot {
  todoId: string;
  start: string; // ISO timestamp
  end: string; // ISO timestamp
}

export interface TodoForScheduling {
  id: string;
  text: string;
  estimated_minutes: number;
  priority: number;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
}

/**
 * Generate a suggested schedule for unscheduled todos.
 * Fills gaps in the day based on priority and estimated time.
 */
export function suggestSchedule(
  todos: TodoForScheduling[],
  date: Date = new Date(),
): ScheduleSlot[] {
  const unscheduled = todos
    .filter((t) => !t.scheduled_start)
    .sort((a, b) => b.priority - a.priority); // highest priority first

  if (unscheduled.length === 0) return [];

  // Collect busy slots from already-scheduled todos
  const busySlots = todos
    .filter((t) => t.scheduled_start && t.scheduled_end)
    .map((t) => ({
      start: new Date(t.scheduled_start!).getTime(),
      end: new Date(t.scheduled_end!).getTime(),
    }))
    .sort((a, b) => a.start - b.start);

  // Build free slots (working hours: 9am - 6pm)
  const dayStart = new Date(date);
  dayStart.setHours(9, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(18, 0, 0, 0);

  // If it's today and past 9am, start from now + 15 min buffer
  const now = new Date();
  if (date.toDateString() === now.toDateString() && now > dayStart) {
    dayStart.setTime(now.getTime() + 15 * 60 * 1000);
    // Round up to next 15 minutes
    const minutes = dayStart.getMinutes();
    const roundedMinutes = Math.ceil(minutes / 15) * 15;
    dayStart.setMinutes(roundedMinutes, 0, 0);
  }

  const freeSlots = getFreeSlots(dayStart.getTime(), dayEnd.getTime(), busySlots);
  const result: ScheduleSlot[] = [];

  let slotIndex = 0;
  for (const todo of unscheduled) {
    const duration = todo.estimated_minutes * 60 * 1000;

    // Find a free slot that fits
    while (slotIndex < freeSlots.length) {
      const slot = freeSlots[slotIndex];
      const slotDuration = slot.end - slot.start;

      if (slotDuration >= duration) {
        result.push({
          todoId: todo.id,
          start: new Date(slot.start).toISOString(),
          end: new Date(slot.start + duration).toISOString(),
        });

        // Update the free slot (shrink it)
        freeSlots[slotIndex] = {
          start: slot.start + duration + 5 * 60 * 1000, // 5-min gap between tasks
          end: slot.end,
        };

        // If remaining slot is too small, move to next
        if (freeSlots[slotIndex].end - freeSlots[slotIndex].start < 5 * 60 * 1000) {
          slotIndex++;
        }
        break;
      }
      slotIndex++;
    }

    if (slotIndex >= freeSlots.length) break; // No more free slots
  }

  return result;
}

function getFreeSlots(
  dayStart: number,
  dayEnd: number,
  busySlots: Array<{ start: number; end: number }>,
): Array<{ start: number; end: number }> {
  const free: Array<{ start: number; end: number }> = [];
  let cursor = dayStart;

  for (const busy of busySlots) {
    if (busy.start > cursor) {
      free.push({ start: cursor, end: busy.start });
    }
    cursor = Math.max(cursor, busy.end);
  }

  if (cursor < dayEnd) {
    free.push({ start: cursor, end: dayEnd });
  }

  return free;
}
