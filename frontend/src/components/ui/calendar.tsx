import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./button";
import { Card, CardContent, CardHeader, CardTitle } from "./card";

const cn = (...xs: Array<string | false | null | undefined>) => xs.filter(Boolean).join(" ");

export interface CalendarProps {
  /** Selected date */
  selectedDate?: Date;
  /** Date selection callback */
  onDateSelect?: (date: Date) => void;
  /** Minimum selectable date */
  minDate?: Date;
  /** Maximum selectable date */
  maxDate?: Date;
  /** Custom class name */
  className?: string;
  /** Whether to show today button */
  showTodayButton?: boolean;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export const Calendar: React.FC<CalendarProps> = ({
  selectedDate,
  onDateSelect,
  minDate,
  maxDate,
  className,
  showTodayButton = true,
}) => {
  const [currentMonth, setCurrentMonth] = React.useState(() => {
    const date = selectedDate || new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });

  // Get the day of week for the first day of the month
  const getFirstDayOfMonth = (date: Date) => {
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    return firstDay.getDay();
  };

  // Get the number of days in the month
  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  // Get the last few days of the previous month (for calendar padding)
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

  // Get the first few days of the next month (for calendar padding)
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

  // Check if date is disabled
  const isDateDisabled = (date: Date) => {
    if (minDate && date < minDate) {
      const min = new Date(minDate);
      min.setHours(0, 0, 0, 0);
      const check = new Date(date);
      check.setHours(0, 0, 0, 0);
      return check < min;
    }
    if (maxDate && date > maxDate) {
      const max = new Date(maxDate);
      max.setHours(23, 59, 59, 999);
      const check = new Date(date);
      check.setHours(23, 59, 59, 999);
      return check > max;
    }
    return false;
  };

  // Check if today
  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  // Check if selected
  const isSelected = (date: Date) => {
    if (!selectedDate) return false;
    return (
      date.getDate() === selectedDate.getDate() &&
      date.getMonth() === selectedDate.getMonth() &&
      date.getFullYear() === selectedDate.getFullYear()
    );
  };

  // Handle date click
  const handleDateClick = (day: number, isCurrentMonth: boolean) => {
    if (!isCurrentMonth) return;
    
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    if (isDateDisabled(date)) return;
    
    onDateSelect?.(date);
  };

  // Previous month
  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  // Next month
  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  // Go to today
  const goToToday = () => {
    const today = new Date();
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    onDateSelect?.(today);
  };

  // Render date cell
  const renderDateCell = (day: number, isCurrentMonth: boolean, monthOffset: number = 0) => {
    const date = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() + monthOffset,
      day
    );
    const disabled = isDateDisabled(date);
    const today = isToday(date);
    const selected = isSelected(date);

    const keyPrefix = monthOffset < 0 ? "prev" : monthOffset > 0 ? "next" : "current";

    return (
      <button
        key={`${keyPrefix}-${day}`}
        onClick={() => handleDateClick(day, isCurrentMonth)}
        disabled={disabled || !isCurrentMonth}
        className={cn(
          "relative flex h-10 w-10 items-center justify-center rounded-lg text-sm transition-colors",
          "hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          !isCurrentMonth && "text-muted-foreground opacity-40",
          disabled && "cursor-not-allowed opacity-30",
          today && !selected && "font-semibold text-primary",
          selected && "bg-primary text-primary-foreground font-semibold hover:bg-primary/90",
          !selected && !disabled && isCurrentMonth && "hover:bg-muted"
        )}
      >
        {day}
        {today && !selected && (
          <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary" />
        )}
      </button>
    );
  };

  const daysInMonth = getDaysInMonth(currentMonth);
  const prevDays = getPreviousMonthDays(currentMonth);
  const totalCells = 42; // 6 rows x 7 columns
  const nextDays = getNextMonthDays(currentMonth, totalCells);

  const currentDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <Card className={cn("w-full max-w-sm", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            onClick={goToPreviousMonth}
            className="h-8 w-8"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <CardTitle className="text-base font-semibold">
            {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={goToNextMonth}
            className="h-8 w-8"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        {showTodayButton && (
          <div className="flex justify-center pt-2">
            <Button variant="outline" size="sm" onClick={goToToday}>
              Today
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="flex h-8 items-center justify-center text-sm font-medium text-muted-foreground"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Date grid */}
        <div className="grid grid-cols-7 gap-1">
          {/* Previous month days */}
          {prevDays.map((day) => renderDateCell(day, false, -1))}
          
          {/* Current month days */}
          {currentDays.map((day) => renderDateCell(day, true, 0))}
          
          {/* Next month days */}
          {nextDays.map((day) => renderDateCell(day, false, 1))}
        </div>
      </CardContent>
    </Card>
  );
};

Calendar.displayName = "Calendar";

