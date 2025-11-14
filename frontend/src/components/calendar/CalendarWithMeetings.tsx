import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Meeting } from "@/services/meetings";
import { getMeetingsByMonth } from "@/services/meetings";
import { MeetingDialog } from "./MeetingDialog";
import { MeetingCreate, MeetingUpdate, createMeeting, updateMeeting, deleteMeeting } from "@/services/meetings";

const cn = (...xs: Array<string | false | null | undefined>) => xs.filter(Boolean).join(" ");

export interface CalendarWithMeetingsProps {
  /** Selected date */
  selectedDate?: Date;
  /** Date selection callback */
  onDateSelect?: (date: Date) => void;
  /** Meeting click callback */
  onMeetingClick?: (meeting: Meeting) => void;
  /** Minimum selectable date */
  minDate?: Date;
  /** Maximum selectable date */
  maxDate?: Date;
  /** Custom class name */
  className?: string;
  /** Whether to show today button */
  showTodayButton?: boolean;
  /** Whether to show meeting dialog internally (default: true) */
  showDialog?: boolean;
  /** Refresh key to force reload meetings */
  refreshKey?: number;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export const CalendarWithMeetings: React.FC<CalendarWithMeetingsProps> = ({
  selectedDate,
  onDateSelect,
  onMeetingClick,
  minDate,
  maxDate,
  className,
  showTodayButton = true,
  showDialog = true,
  refreshKey,
}) => {
  const [currentMonth, setCurrentMonth] = React.useState(() => {
    const date = selectedDate || new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });

  const [meetings, setMeetings] = React.useState<Meeting[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [selectedMeeting, setSelectedMeeting] = React.useState<Meeting | null>(null);
  const [dialogDate, setDialogDate] = React.useState<Date | undefined>();

  // Load meetings when month changes, selectedDate changes, or refreshKey changes
  React.useEffect(() => {
    loadMeetings();
  }, [currentMonth, selectedDate, refreshKey]);

  const loadMeetings = async () => {
    setLoading(true);
    try {
      const data = await getMeetingsByMonth(currentMonth.getFullYear(), currentMonth.getMonth());
      setMeetings(data);
    } catch (error) {
      console.error("Failed to load meetings:", error);
    } finally {
      setLoading(false);
    }
  };

  // Get meetings for a specific date
  const getMeetingsForDate = (date: Date): Meeting[] => {
    const dateStr = date.toISOString().split("T")[0];
    return meetings.filter((meeting) => {
      const start = new Date(meeting.start_time).toISOString().split("T")[0];
      return start === dateStr;
    });
  };

  // Get first day of month
  const getFirstDayOfMonth = (date: Date) => {
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    return firstDay.getDay();
  };

  // Get days in month
  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  // Get previous month days
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

  // Get next month days
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

  // Handle date click - just call onDateSelect, let parent handle the logic
  const handleDateClick = (day: number, isCurrentMonth: boolean) => {
    if (!isCurrentMonth) return;
    
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    if (isDateDisabled(date)) return;
    
    // Always call onDateSelect, let the parent component handle the logic
    onDateSelect?.(date);
  };

  // Handle meeting click
  const handleMeetingClick = (e: React.MouseEvent, meeting: Meeting) => {
    e.stopPropagation();
    
    if (onMeetingClick) {
      onMeetingClick(meeting);
    } else if (showDialog) {
      setSelectedMeeting(meeting);
      setDialogDate(undefined);
      setDialogOpen(true);
    }
  };

  // Handle save meeting
  const handleSaveMeeting = async (meetingData: MeetingCreate | MeetingUpdate) => {
    if (selectedMeeting) {
      // Update
      await updateMeeting(selectedMeeting.id, meetingData as MeetingUpdate);
    } else {
      // Create
      await createMeeting(meetingData as MeetingCreate);
    }
    await loadMeetings();
  };

  // Handle delete meeting
  const handleDeleteMeeting = async (id: number) => {
    await deleteMeeting(id);
    await loadMeetings();
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
    const dateMeetings = isCurrentMonth ? getMeetingsForDate(date) : [];

    const keyPrefix = monthOffset < 0 ? "prev" : monthOffset > 0 ? "next" : "current";

    return (
      <div
        key={`${keyPrefix}-${day}`}
        className="relative flex flex-col h-12 sm:h-14 md:h-16 w-full"
      >
        <button
          onClick={() => handleDateClick(day, isCurrentMonth)}
          disabled={disabled || !isCurrentMonth}
          className={cn(
            "relative flex h-6 sm:h-7 md:h-8 w-full items-center justify-center rounded-md sm:rounded-lg text-sm transition-colors",
            "hover:bg-muted focus:outline-none focus:ring-1 sm:focus:ring-2 focus:ring-ring focus:ring-offset-1 sm:focus:ring-offset-2",
            !isCurrentMonth && "text-muted-foreground opacity-40",
            disabled && "cursor-not-allowed opacity-30",
            today && !selected && "font-semibold text-primary",
            selected && "bg-primary text-primary-foreground font-semibold hover:bg-primary/90",
            !selected && !disabled && isCurrentMonth && "hover:bg-muted"
          )}
        >
          {day}
          {today && !selected && (
            <span className="absolute bottom-0.5 sm:bottom-1 left-1/2 h-0.5 sm:h-1 w-0.5 sm:w-1 -translate-x-1/2 rounded-full bg-primary" />
          )}
        </button>
        {/* Meeting indicators - visual only, clicking date cell will show meetings */}
        {isCurrentMonth && dateMeetings.length > 0 && (
          <div className="flex flex-wrap gap-0.5 mt-0.5 px-0.5 pointer-events-none">
            {dateMeetings.slice(0, 3).map((meeting) => (
              <div
                key={meeting.id}
                className={cn(
                  "flex-1 min-w-[12px] sm:min-w-[16px] md:min-w-[20px] h-1 sm:h-1.5 rounded-sm",
                  (meeting.category || "meeting") === "meeting" 
                    ? "bg-blue-500" 
                    : "bg-purple-500"
                )}
                title={meeting.title}
              />
            ))}
            {dateMeetings.length > 3 && (
              <span className="text-[7px] sm:text-[8px] text-muted-foreground px-0.5">
                +{dateMeetings.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  const daysInMonth = getDaysInMonth(currentMonth);
  const prevDays = getPreviousMonthDays(currentMonth);
  const totalCells = 42; // 6 rows x 7 columns
  const nextDays = getNextMonthDays(currentMonth, totalCells);
  const currentDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <>
      <Card className={cn("w-full h-full flex flex-col overflow-hidden", className)}>
        <CardHeader className="pb-2 sm:pb-3 pt-4 sm:pt-6 px-4 sm:px-6 flex-shrink-0">
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={goToPreviousMonth}
              className="h-7 w-7 sm:h-8 sm:w-8"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <CardTitle className="text-base sm:text-lg font-semibold truncate">
              {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={goToNextMonth}
              className="h-7 w-7 sm:h-8 sm:w-8"
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
        {/* Border between month and weekdays */}
        <div className="px-4 sm:px-6 flex-shrink-0">
          <div className="border-b border-border/30"></div>
        </div>
        {/* Weekday headers - fixed */}
        <div className="px-4 sm:px-6 pb-2 pt-2 flex-shrink-0 bg-card">
          <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
            {WEEKDAYS.map((day) => (
              <div
                key={day}
                className="flex h-6 sm:h-8 items-center justify-center text-sm font-medium text-muted-foreground"
              >
                <span className="hidden sm:inline">{day}</span>
                <span className="sm:hidden">{day.substring(0, 1)}</span>
              </div>
            ))}
          </div>
        </div>
        <CardContent className="flex-1 overflow-y-auto min-h-0 pt-2">
          {/* Date grid */}
          <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
            {prevDays.map((day) => renderDateCell(day, false, -1))}
            {currentDays.map((day) => renderDateCell(day, true, 0))}
            {nextDays.map((day) => renderDateCell(day, false, 1))}
          </div>
        </CardContent>
      </Card>

      {showDialog && (
        <MeetingDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          meeting={selectedMeeting}
          defaultDate={dialogDate}
          onSave={handleSaveMeeting}
          onDelete={selectedMeeting ? handleDeleteMeeting : undefined}
        />
      )}
    </>
  );
};

CalendarWithMeetings.displayName = "CalendarWithMeetings";

