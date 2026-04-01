"use client";

import { useCallback, useState } from "react";
import { TIME_SLOTS, type TimeSlot } from "../lib/time-slots";
import type { TimeSlotGroup, TodoDTO } from "../lib/todo-types";
import { TimeViewHeader } from "./time-view-header";
import { CalendarStrip } from "./calendar-strip";
import { TimeBlock } from "./time-block";
import { TodoCreateSheet } from "./todo-create-sheet";
import { getLocalToday } from "../lib/date-utils";

interface TimeViewProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  timeSlotGroups: TimeSlotGroup[];
  onToggle: (id: string) => void;
  onPress: (todo: TodoDTO) => void;
  onCreate: (params: {
    text: string;
    scheduled_start?: string;
    parent_id?: string;
  }) => Promise<any>;
}

export function TimeView({
  selectedDate,
  onDateChange,
  timeSlotGroups,
  onToggle,
  onPress,
  onCreate,
}: TimeViewProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [createSlot, setCreateSlot] = useState<TimeSlot>("anytime");

  const handleTodayClick = useCallback(() => {
    onDateChange(getLocalToday());
  }, [onDateChange]);

  const handleAdd = useCallback((slot: TimeSlot) => {
    setCreateSlot(slot);
    setCreateOpen(true);
  }, []);

  return (
    <div data-testid="time-view">
      <TimeViewHeader
        selectedDate={selectedDate}
        onTodayClick={handleTodayClick}
      />

      <CalendarStrip
        selectedDate={selectedDate}
        onDateChange={onDateChange}
      />

      {timeSlotGroups.map((group, i) => (
        <TimeBlock
          key={TIME_SLOTS[i].key}
          config={TIME_SLOTS[i]}
          group={group}
          onToggle={onToggle}
          onPress={onPress}
          onAdd={() => handleAdd(TIME_SLOTS[i].key)}
        />
      ))}

      {/* 底部留白 */}
      <div className="h-32" />

      <TodoCreateSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={onCreate}
        defaultDate={selectedDate}
        defaultSlot={createSlot}
      />
    </div>
  );
}
