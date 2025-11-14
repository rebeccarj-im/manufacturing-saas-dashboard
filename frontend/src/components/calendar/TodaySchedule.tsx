import React, { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Meeting, getMeetingsByDateRange } from "@/services/meetings";
import { Clock, MapPin, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export interface TodayScheduleProps {
  selectedDate?: Date;
  refreshKey?: number;
  onMeetingClick?: (meeting: Meeting) => void;
  onCreateMeeting?: () => void;
}

export const TodaySchedule: React.FC<TodayScheduleProps> = ({
  selectedDate,
  refreshKey,
  onMeetingClick,
  onCreateMeeting,
}) => {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadScheduleForDate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, selectedDate?.toISOString().split('T')[0]]);

  const loadScheduleForDate = async () => {
    // Use selectedDate if provided, otherwise use today
    const targetDate = selectedDate ? new Date(selectedDate) : new Date();
    targetDate.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    setLoading(true);
    try {
      const dateStr = targetDate.toISOString().split('T')[0];
      const data = await getMeetingsByDateRange(targetDate, endOfDay);
      
      // Filter to only the target date's events (both meetings and personal)
      const dateEvents = data.filter((meeting) => {
        const meetingDate = new Date(meeting.start_time);
        const meetingDateStr = meetingDate.toISOString().split('T')[0];
        return meetingDateStr === dateStr;
      });
      
      // Sort by start time
      dateEvents.sort((a, b) => 
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );
      setMeetings(dateEvents);
    } catch (error) {
      console.error("Failed to load schedule for date:", error);
      console.error("Error details:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatTimeRange = (start: string, end: string) => {
    return `${formatTime(start)} - ${formatTime(end)}`;
  };

  return (
    <Card className="h-full flex flex-col overflow-hidden">
      <CardHeader className="pb-2 sm:pb-3 pt-4 sm:pt-6 px-4 sm:px-6 flex-shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-lg truncate">Schedule</CardTitle>
            <CardDescription className="text-sm">
              {(selectedDate || new Date()).toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </CardDescription>
          </div>
          {onCreateMeeting && (
            <Button size="sm" variant="outline" onClick={onCreateMeeting} className="flex-shrink-0">
              <Plus className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
              <span className="hidden sm:inline">New</span>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="text-center py-4 text-sm text-muted-foreground">Loading...</div>
        ) : meetings.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No events scheduled for this date
          </div>
        ) : (
          <div className="space-y-2 sm:space-y-3">
            {meetings.map((meeting) => (
              <div
                key={meeting.id}
                className="p-2 sm:p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => onMeetingClick?.(meeting)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold text-sm truncate">{meeting.title}</h4>
                      <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
                        (meeting.category || "meeting") === "meeting"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                          : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                      }`}>
                        {(meeting.category || "meeting") === "meeting" ? "Meeting" : "Personal"}
                      </span>
                    </div>
                    <div className="mt-1.5 sm:mt-2 space-y-0.5 sm:space-y-1 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3 flex-shrink-0" />
                        <span className="truncate">{formatTimeRange(meeting.start_time, meeting.end_time)}</span>
                      </div>
                      {meeting.location && (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-2.5 w-2.5 sm:h-3 sm:w-3 flex-shrink-0" />
                          <span className="truncate">{meeting.location}</span>
                        </div>
                      )}
                      {meeting.attendees && (
                        <div className="flex items-center gap-1">
                          <Users className="h-2.5 w-2.5 sm:h-3 sm:w-3 flex-shrink-0" />
                          <span className="truncate">{meeting.attendees}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

TodaySchedule.displayName = "TodaySchedule";

