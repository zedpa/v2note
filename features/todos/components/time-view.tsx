"use client";

import { useCallback, useState, useMemo, useEffect } from "react";
import { TIME_SLOTS, type TimeSlot } from "../lib/time-slots";
import type { TimeSlotGroup, TodoDTO } from "../lib/todo-types";
import { TimeViewHeader } from "./time-view-header";
import { CalendarExpand } from "./calendar-expand";
import { TimeBlock } from "./time-block";
import { TodoCreateSheet } from "./todo-create-sheet";
import { getLocalToday } from "../lib/date-utils";
import { computeDateDots } from "../lib/date-dots";

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
    priority?: number;
    estimated_minutes?: number;
  }) => Promise<any>;
  onPostpone: (id: string) => void;
  onRemove: (id: string) => void;
  swipeOpenId: string | null;
  onSwipeOpenChange: (id: string | null) => void;
  projects?: TodoDTO[];
  allTodos?: TodoDTO[];
  viewedDates: Set<string>;
  onMarkViewed: (date: string) => void;
}

export function TimeView({
  selectedDate,
  onDateChange,
  timeSlotGroups,
  onToggle,
  onPress,
  onCreate,
  onPostpone,
  onRemove,
  swipeOpenId,
  onSwipeOpenChange,
  projects,
  allTodos,
  viewedDates,
  onMarkViewed,
}: TimeViewProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [createSlot, setCreateSlot] = useState<TimeSlot>("anytime");
  const [calendarExpanded, setCalendarExpanded] = useState(false);


  const today = useMemo(() => getLocalToday(), []);

  const dateDots = useMemo(
    () => computeDateDots(allTodos ?? [], viewedDates, today),
    [allTodos, viewedDates, today],
  );

  const handleDateChange = useCallback(
    (date: string) => {
      onDateChange(date);
      onMarkViewed(date);
    },
    [onDateChange, onMarkViewed],
  );

  const handleTodayClick = useCallback(() => {
    const todayStr = getLocalToday();
    onDateChange(todayStr);
    onMarkViewed(todayStr);
  }, [onDateChange, onMarkViewed]);

  const handleToggleCalendar = useCallback(() => {
    setCalendarExpanded((prev) => !prev);
  }, []);

  const handleCollapseCalendar = useCallback(() => {
    setCalendarExpanded(false);
  }, []);

  const handleAdd = useCallback((slot: TimeSlot) => {
    setCreateSlot(slot);
    setCreateOpen(true);
  }, []);

  return (
    <div data-testid="time-view">
      <TimeViewHeader
        selectedDate={selectedDate}
        calendarExpanded={calendarExpanded}
        onToggleCalendar={handleToggleCalendar}
        onTodayClick={handleTodayClick}
      />

      <CalendarExpand
        selectedDate={selectedDate}
        onDateChange={handleDateChange}
        expanded={calendarExpanded}
        onCollapse={handleCollapseCalendar}
        dateDots={dateDots}
      />

      {timeSlotGroups.map((group, i) => (
        <TimeBlock
          key={TIME_SLOTS[i].key}
          config={TIME_SLOTS[i]}
          group={group}
          onToggle={onToggle}
          onPress={onPress}
          onAdd={() => handleAdd(TIME_SLOTS[i].key)}
          onPostpone={onPostpone}
          onRemove={onRemove}
          swipeOpenId={swipeOpenId}
          onSwipeOpenChange={onSwipeOpenChange}
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
        projects={projects}
      />
    </div>
  );
}
