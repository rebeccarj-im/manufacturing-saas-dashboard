import React, { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Meeting, getMeetingsByDateRange } from "@/services/meetings";
import { Clock, MapPin, Users, ChevronRight } from "lucide-react";

export interface MeetingListProps {
  dateRange?: [Date, Date?];
  onMeetingClick?: (meeting: Meeting) => void;
  className?: string;
}

export const MeetingList: React.FC<MeetingListProps> = ({
  dateRange,
  onMeetingClick,
  className,
}) => {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (dateRange) {
      loadMeetings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dateRange?.[0]?.toISOString().split('T')[0],
    dateRange?.[1]?.toISOString().split('T')[0]
  ]);

  const loadMeetings = async () => {
    if (!dateRange) return;

    setLoading(true);
    try {
      const [start, end] = dateRange;
      const endDate = end || start;
      const data = await getMeetingsByDateRange(start, endDate);
      // Show all events (both meetings and personal)
      // Sort by start time
      data.sort((a, b) => 
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );
      setMeetings(data);
    } catch (error) {
      console.error("Failed to load meetings:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getRangeLabel = () => {
    if (!dateRange) return "All Meetings";
    const [start, end] = dateRange;
    if (!end || start.getTime() === end.getTime()) {
      return formatDate(start.toISOString());
    }
    return `${formatDate(start.toISOString())} - ${formatDate(end.toISOString())}`;
  };

  return (
    <Card className={`h-full flex flex-col overflow-hidden ${className || ""}`}>
      <CardHeader className="pb-2 sm:pb-3 flex-shrink-0">
        <CardTitle className="text-lg">Schedule</CardTitle>
        <CardDescription className="text-sm truncate">{getRangeLabel()}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="text-center py-4 text-sm text-muted-foreground">Loading...</div>
        ) : meetings.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No events in selected range
          </div>
        ) : (
          <div className="space-y-1.5 sm:space-y-2">
            {meetings.map((meeting) => (
              <div
                key={meeting.id}
                className="p-1.5 sm:p-2 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors group"
                onClick={() => onMeetingClick?.(meeting)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-sm truncate">{meeting.title}</h4>
                      <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
                        (meeting.category || "meeting") === "meeting"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                          : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                      }`}>
                        {(meeting.category || "meeting") === "meeting" ? "Meeting" : "Personal"}
                      </span>
                    </div>
                    <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3 flex-shrink-0" />
                        <span className="truncate">
                          {formatDate(meeting.start_time)} {formatTime(meeting.start_time)}
                        </span>
                      </div>
                      {meeting.location && (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-2.5 w-2.5 sm:h-3 sm:w-3 flex-shrink-0" />
                          <span className="truncate">{meeting.location}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

MeetingList.displayName = "MeetingList";

