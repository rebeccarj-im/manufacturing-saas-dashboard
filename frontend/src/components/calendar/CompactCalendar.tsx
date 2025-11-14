import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const cn = (...xs: Array<string | false | null | undefined>) => xs.filter(Boolean).join(" ");

export interface CompactCalendarProps {
  /** Selected date or date range */
  selectedDate?: Date | [Date, Date?];
  /** Date selection callback */
  onDateSelect?: (date: Date | [Date, Date?]) => void;
  /** Selection mode: 'single' or 'range' */
  mode?: "single" | "range";
  /** Mode change callback */
  onModeChange?: (mode: "single" | "range") => void;
  /** Custom class name */
  className?: string;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

export const CompactCalendar: React.FC<CompactCalendarProps> = ({
  selectedDate,
  onDateSelect,
  mode = "single",
  onModeChange,
  className,
}) => {
  const [currentMonth, setCurrentMonth] = React.useState(() => {
    if (selectedDate) {
      const date = Array.isArray(selectedDate) ? selectedDate[0] : selectedDate;
      return new Date(date.getFullYear(), date.getMonth(), 1);
    }
    return new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  });

  const [rangeStart, setRangeStart] = React.useState<Date | null>(null);
  const [rangeEnd, setRangeEnd] = React.useState<Date | null>(null);

  React.useEffect(() => {
    if (mode === "range") {
      if (selectedDate) {
        if (Array.isArray(selectedDate)) {
          setRangeStart(selectedDate[0]);
          setRangeEnd(selectedDate[1] || null);
        } else {
          setRangeStart(selectedDate);
          setRangeEnd(null);
        }
      } else {
        setRangeStart(null);
        setRangeEnd(null);
      }
    } else {
      // Single mode - reset range
      setRangeStart(null);
      setRangeEnd(null);
    }
  }, [selectedDate, mode]);

  const getFirstDayOfMonth = (date: Date) => {
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    return firstDay.getDay();
  };

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getPreviousMonthDays = (date: Date) => {
    const firstDay = getFirstDayOfMonth(date);
    const prevMonth = new Date(date.getFullYear(), date.getMonth() - 1, 0);
    const daysInPrevMonth = prevMonth.getDate();
    const days: number[] = [];
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push(daysInPrevMonth - i);
    }
    return days;
  };

  const getNextMonthDays = (date: Date, totalCells: number) => {
    const daysInMonth = getDaysInMonth(date);
    const firstDay = getFirstDayOfMonth(date);
    const daysToShow = totalCells - (firstDay + daysInMonth);
    const days: number[] = [];
    for (let i = 1; i <= daysToShow; i++) {
      days.push(i);
    }
    return days;
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const isSelected = (date: Date) => {
    if (mode === "range") {
      if (!rangeStart) return false;
      if (!rangeEnd) {
        // Only start date selected
        return (
          date.getDate() === rangeStart.getDate() &&
          date.getMonth() === rangeStart.getMonth() &&
          date.getFullYear() === rangeStart.getFullYear()
        );
      }
      // Both dates selected - check if date is in range
      const start = rangeStart < rangeEnd ? rangeStart : rangeEnd;
      const end = rangeStart < rangeEnd ? rangeEnd : rangeStart;
      return date >= start && date <= end;
    } else {
      if (!selectedDate || Array.isArray(selectedDate)) return false;
      return (
        date.getDate() === selectedDate.getDate() &&
        date.getMonth() === selectedDate.getMonth() &&
        date.getFullYear() === selectedDate.getFullYear()
      );
    }
  };

  const isInRange = (date: Date) => {
    if (mode !== "range" || !rangeStart || !rangeEnd) return false;
    const start = rangeStart < rangeEnd ? rangeStart : rangeEnd;
    const end = rangeStart < rangeEnd ? rangeEnd : rangeStart;
    return date > start && date < end;
  };

  const handleDateClick = (day: number, isCurrentMonth: boolean, monthOffset: number = 0) => {
    if (!isCurrentMonth) return;

    const date = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() + monthOffset,
      day
    );

    if (mode === "range") {
      if (!rangeStart || (rangeStart && rangeEnd)) {
        // Start new range
        setRangeStart(date);
        setRangeEnd(null);
        onDateSelect?.([date]);
      } else if (rangeStart && !rangeEnd) {
        // Complete range
        const start = rangeStart < date ? rangeStart : date;
        const end = rangeStart < date ? date : rangeStart;
        setRangeStart(start);
        setRangeEnd(end);
        onDateSelect?.([start, end]);
      }
    } else {
      onDateSelect?.(date);
    }
  };

  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const renderDateCell = (day: number, isCurrentMonth: boolean, monthOffset: number = 0) => {
    const date = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() + monthOffset,
      day
    );
    const today = isToday(date);
    const selected = isSelected(date);
    const inRange = isInRange(date);

    const keyPrefix = monthOffset < 0 ? "prev" : monthOffset > 0 ? "next" : "current";

    return (
        <button
          key={`${keyPrefix}-${day}`}
          onClick={() => handleDateClick(day, isCurrentMonth, monthOffset)}
          className={cn(
            "relative flex h-6 sm:h-7 w-6 sm:w-7 items-center justify-center rounded text-xs transition-colors",
            "hover:bg-muted focus:outline-none focus:ring-1 focus:ring-ring",
            !isCurrentMonth && "text-muted-foreground opacity-30",
            today && !selected && "font-semibold text-primary",
            selected && "bg-primary text-primary-foreground font-semibold",
            inRange && "bg-primary/20",
            !selected && !inRange && isCurrentMonth && "hover:bg-muted"
          )}
        >
          {day}
        </button>
    );
  };

  const daysInMonth = getDaysInMonth(currentMonth);
  const prevDays = getPreviousMonthDays(currentMonth);
  const totalCells = 42;
  const nextDays = getNextMonthDays(currentMonth, totalCells);
  const currentDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="pb-2 flex-shrink-0">
        <div className="flex items-center justify-between gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={goToPreviousMonth}
            className="h-6 w-6"
          >
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <CardTitle className="text-sm font-semibold truncate">
            {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={goToNextMonth}
            className="h-6 w-6"
          >
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
        {onModeChange && (
          <div className="mt-2 flex items-center gap-0.5 rounded-lg border p-0.5">
            {(["single", "range"] as const).map((m) => (
              <button
                key={m}
                onClick={() => onModeChange(m)}
                className={cn(
                  "flex-1 rounded-md px-1.5 sm:px-2 py-0.5 text-xs font-medium transition",
                  mode === m
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                {m === "single" ? "Day" : "Period"}
              </button>
            ))}
          </div>
        )}
        {mode === "range" && (
          <div className="text-xs text-muted-foreground text-center mt-1 truncate">
            {rangeStart && !rangeEnd && "Select end date"}
            {rangeStart && rangeEnd && `${rangeStart.toLocaleDateString()} - ${rangeEnd.toLocaleDateString()}`}
          </div>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="flex h-4 sm:h-5 items-center justify-center text-xs font-medium text-muted-foreground"
            >
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {prevDays.map((day) => renderDateCell(day, false, -1))}
          {currentDays.map((day) => renderDateCell(day, true, 0))}
          {nextDays.map((day) => renderDateCell(day, false, 1))}
        </div>
      </CardContent>
    </Card>
  );
};

CompactCalendar.displayName = "CompactCalendar";

