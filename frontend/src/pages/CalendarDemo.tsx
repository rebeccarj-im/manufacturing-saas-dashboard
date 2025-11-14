import React, { useState } from "react";
import { CalendarWithMeetings } from "@/components/calendar/CalendarWithMeetings";
import { CompactCalendar } from "@/components/calendar/CompactCalendar";
import { TodaySchedule } from "@/components/calendar/TodaySchedule";
import { MeetingList } from "@/components/calendar/MeetingList";
import { MeetingDialog } from "@/components/calendar/MeetingDialog";
import { Meeting, MeetingCreate, MeetingUpdate, createMeeting, updateMeeting, deleteMeeting, getMeetingsByDateRange } from "@/services/meetings";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const cn = (...xs: Array<string | false | null | undefined>) => xs.filter(Boolean).join(" ");

export default function CalendarDemo() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [compactDateRange, setCompactDateRange] = useState<Date | [Date, Date?] | undefined>(new Date());
  const [selectionMode, setSelectionMode] = useState<"single" | "range">("single");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [dialogDate, setDialogDate] = React.useState<Date | undefined>();
  const [refreshKey, setRefreshKey] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Handle mode change - reset date range when switching modes
  const handleModeChange = (mode: "single" | "range") => {
    setSelectionMode(mode);
    if (mode === "single") {
      // Convert range to single date if needed
      if (Array.isArray(compactDateRange)) {
        setCompactDateRange(compactDateRange[0]);
      }
    } else {
      // Convert single date to range start if needed
      if (!Array.isArray(compactDateRange)) {
        setCompactDateRange([compactDateRange || new Date()]);
      }
    }
  };

  // Normalize date to start of day for consistent comparison
  const normalizeDate = React.useCallback((date: Date): Date => {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
  }, []);

  // Convert compact date range to [Date, Date?] format for MeetingList
  // Use a key based on the date string to force re-render when date changes
  const dateRangeKey = React.useMemo(() => {
    if (!compactDateRange) return '';
    if (Array.isArray(compactDateRange)) {
      const start = compactDateRange[0]?.toISOString().split('T')[0] || '';
      const end = compactDateRange[1]?.toISOString().split('T')[0] || '';
      return `${start}_${end}`;
    }
    return compactDateRange?.toISOString().split('T')[0] || '';
  }, [
    Array.isArray(compactDateRange) 
      ? compactDateRange[0]?.getTime() 
      : compactDateRange?.getTime(),
    Array.isArray(compactDateRange) 
      ? compactDateRange[1]?.getTime() 
      : undefined
  ]);

  const getDateRangeForList = React.useMemo((): [Date, Date?] | undefined => {
    if (!compactDateRange) return undefined;
    if (Array.isArray(compactDateRange)) {
      // Normalize dates and return new array - always create new Date objects
      const start = new Date(compactDateRange[0]);
      start.setHours(0, 0, 0, 0);
      const end = compactDateRange[1] ? (() => {
        const e = new Date(compactDateRange[1]);
        e.setHours(0, 0, 0, 0);
        return e;
      })() : undefined;
      return [start, end];
    }
    // Normalize date and return new array - always create new Date object
    const normalized = new Date(compactDateRange);
    normalized.setHours(0, 0, 0, 0);
    return [normalized];
  }, [dateRangeKey]);

  // Handle meeting click from calendar or today schedule
  const handleMeetingClick = (meeting: Meeting) => {
    setSelectedMeeting(meeting);
    setDialogDate(undefined);
    
    // Only sync to right side if it's a meeting (not personal)
    if (meeting.category === "meeting" || !meeting.category) {
      // Update right side calendar to show the meeting's date
      const meetingDate = new Date(meeting.start_time);
      meetingDate.setHours(0, 0, 0, 0);
      
      if (selectionMode === "single") {
        setCompactDateRange(meetingDate);
      } else {
        // In range mode, set the date as the start of the range
        setCompactDateRange([meetingDate]);
      }
    }
    
    setDialogOpen(true);
  };

  // Handle date click from large calendar - update right side list
  const handleDateClick = (date: Date) => {
    const normalizedDate = normalizeDate(date);
    setSelectedDate(normalizedDate);
    // If in range mode, switch back to single day mode
    if (selectionMode === "range") {
      setSelectionMode("single");
    }
    // Update right side calendar to show this date
    setCompactDateRange(normalizedDate);
  };

  // Handle compact calendar date selection - update right side list
  const handleCompactDateSelect = (date: Date | [Date, Date?]) => {
    if (Array.isArray(date)) {
      const normalized = [normalizeDate(date[0]), date[1] ? normalizeDate(date[1]) : undefined];
      setCompactDateRange(normalized as [Date, Date?]);
    } else {
      const normalized = normalizeDate(date);
      setCompactDateRange(normalized);
      setSelectedDate(normalized);
    }
  };

  // Handle save meeting
  const handleSaveMeeting = async (meetingData: MeetingCreate | MeetingUpdate) => {
    try {
      if (selectedMeeting) {
        await updateMeeting(selectedMeeting.id, meetingData as MeetingUpdate);
      } else {
        await createMeeting(meetingData as MeetingCreate);
      }
      setDialogOpen(false);
      // Force refresh all components
      setRefreshKey(prev => prev + 1);
      // Force refresh by updating selected date
      setSelectedDate(new Date(selectedDate || new Date()));
      // Reload compact calendar selection
      if (compactDateRange) {
        setCompactDateRange(Array.isArray(compactDateRange) ? compactDateRange : new Date());
      }
    } catch (error) {
      console.error("Failed to save meeting:", error);
      throw error;
    }
  };

  // Handle delete meeting
  const handleDeleteMeeting = async (id: number) => {
    try {
      await deleteMeeting(id);
      setDialogOpen(false);
      // Force refresh all components
      setRefreshKey(prev => prev + 1);
      // Force refresh by updating selected date
      setSelectedDate(new Date(selectedDate || new Date()));
      if (compactDateRange) {
        setCompactDateRange(Array.isArray(compactDateRange) ? compactDateRange : new Date());
      }
    } catch (error) {
      console.error("Failed to delete meeting:", error);
      throw error;
    }
  };

  // Handle create meeting - use selected date range or today
  const handleCreateMeeting = () => {
    // Use the start of the selected date range, or today
    let defaultDate = new Date();
    if (compactDateRange) {
      if (Array.isArray(compactDateRange)) {
        defaultDate = compactDateRange[0];
      } else {
        defaultDate = compactDateRange;
      }
    }
    setDialogDate(defaultDate);
    setSelectedMeeting(null);
    setDialogOpen(true);
  };

  // Auto-refresh mechanism
  React.useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      // Increment refreshKey to trigger all components to reload
      setRefreshKey(prev => prev + 1);
      // Also update selectedDate to trigger calendar refresh
      setSelectedDate(new Date(selectedDate || new Date()));
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, selectedDate]);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="grid grid-cols-[1fr_auto] gap-y-2">
        <h1 className="text-2xl font-semibold tracking-tight col-start-1 row-start-1">Calendar</h1>
        <div className="col-start-2 row-start-1 justify-self-end flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
            <Label htmlFor="auto-refresh" className="text-xs text-muted-foreground cursor-pointer">
              Auto refresh (30s)
            </Label>
            <Switch
              id="auto-refresh"
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
            />
          </div>
        </div>
      </div>

      {/* Main layout: Left (large) + Right (narrow) */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-3 sm:gap-4 xl:gap-6">
        {/* Left side: Large calendar + Today's schedule */}
        <div className="flex flex-col gap-3 sm:gap-4">
          {/* Large Calendar */}
          <div className="min-h-[500px]">
            <CalendarWithMeetings
              selectedDate={selectedDate}
              onDateSelect={handleDateClick}
              onMeetingClick={handleMeetingClick}
              showDialog={false}
              showTodayButton={false}
              className="h-full"
              refreshKey={refreshKey}
            />
          </div>

          {/* Today's Schedule */}
          <div className="h-[250px] sm:h-[280px] md:h-[300px]">
            <TodaySchedule
              selectedDate={selectedDate}
              refreshKey={refreshKey}
              onMeetingClick={handleMeetingClick}
              onCreateMeeting={handleCreateMeeting}
            />
          </div>
        </div>

        {/* Right side: Compact calendar + Meeting list */}
        <div className="hidden xl:flex flex-col gap-3 sm:gap-4 min-h-0 overflow-hidden">
          {/* Compact Calendar */}
          <div className="flex-shrink-0">
            <CompactCalendar
              selectedDate={compactDateRange}
              onDateSelect={handleCompactDateSelect}
              mode={selectionMode}
              onModeChange={handleModeChange}
            />
          </div>

          {/* Meeting List */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <MeetingList
              key={`${refreshKey}-${dateRangeKey}`}
              dateRange={getDateRangeForList}
              onMeetingClick={handleMeetingClick}
            />
          </div>
        </div>
      </div>

      {/* Meeting Dialog */}
      <MeetingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        meeting={selectedMeeting}
        defaultDate={dialogDate}
        onSave={handleSaveMeeting}
        onDelete={selectedMeeting ? handleDeleteMeeting : undefined}
      />
    </div>
  );
}
