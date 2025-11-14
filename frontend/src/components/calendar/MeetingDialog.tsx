import * as React from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Meeting, MeetingCreate, MeetingUpdate } from "@/services/meetings";

const cn = (...xs: Array<string | false | null | undefined>) => xs.filter(Boolean).join(" ");

export interface MeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting?: Meeting | null;
  defaultDate?: Date;
  onSave: (meeting: MeetingCreate | MeetingUpdate) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
}

export const MeetingDialog: React.FC<MeetingDialogProps> = ({
  open,
  onOpenChange,
  meeting,
  defaultDate,
  onSave,
  onDelete,
}) => {
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [startTime, setStartTime] = React.useState("");
  const [endTime, setEndTime] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [attendees, setAttendees] = React.useState("");
  const [category, setCategory] = React.useState<"meeting" | "personal">("meeting");
  const [loading, setLoading] = React.useState(false);
  const [meetingDate, setMeetingDate] = React.useState<Date>(new Date());

  // Initialize form when dialog opens or meeting changes
  React.useEffect(() => {
    if (open) {
      if (meeting) {
        // Edit mode
        const start = new Date(meeting.start_time);
        const end = new Date(meeting.end_time);
        setTitle(meeting.title || "");
        setDescription(meeting.description || "");
        setStartTime(start.toTimeString().slice(0, 5));
        setEndTime(end.toTimeString().slice(0, 5));
        setLocation(meeting.location || "");
        setAttendees(meeting.attendees || "");
        setCategory((meeting.category || "meeting") as "meeting" | "personal");
        setMeetingDate(start); // Use start date as the meeting date
      } else {
        // Create mode
        const date = defaultDate || new Date();
        const start = new Date(date);
        start.setHours(9, 0, 0, 0);
        const end = new Date(date);
        end.setHours(10, 0, 0, 0);
        
        setTitle("");
        setDescription("");
        setStartTime(start.toTimeString().slice(0, 5));
        setEndTime(end.toTimeString().slice(0, 5));
        setLocation("");
        setAttendees("");
        setCategory("meeting");
        setMeetingDate(date); // Use default date or current date
      }
    }
  }, [open, meeting, defaultDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!title.trim()) {
        alert("Title is required");
        setLoading(false);
        return;
      }

      // Use meetingDate for both start and end dates
      const dateStr = meetingDate.toISOString().split("T")[0];
      const startDateTime = new Date(`${dateStr}T${startTime}`);
      const endDateTime = new Date(`${dateStr}T${endTime}`);

      if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
        alert("Invalid date or time");
        setLoading(false);
        return;
      }

      if (endDateTime <= startDateTime) {
        alert("End time must be after start time");
        setLoading(false);
        return;
      }

      const meetingData: MeetingCreate | MeetingUpdate = {
        title: title.trim(),
        description: description?.trim() || undefined,
        start_time: startDateTime.toISOString(),
        end_time: endDateTime.toISOString(),
        location: location?.trim() || undefined,
        attendees: attendees?.trim() || undefined,
        category: category,
      };

      await onSave(meetingData);
      onOpenChange(false);
    } catch (error: any) {
      console.error("Failed to save meeting:", error);
      // Handle ApiError from fetcher
      const errorMessage = error?.payload?.detail || error?.message || "Failed to save meeting";
      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!meeting || !onDelete) return;
    if (!confirm("Are you sure you want to delete this meeting?")) return;

    setLoading(true);
    try {
      await onDelete(meeting.id);
      onOpenChange(false);
    } catch (error: any) {
      alert(error?.message || "Failed to delete");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={meeting ? "Edit Meeting" : "New Meeting"}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="title">Title *</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            disabled={loading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <div className="flex items-center gap-1 rounded-lg border p-1">
            {(["meeting", "personal"] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                disabled={loading}
                className={cn(
                  "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition",
                  category === cat
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                {cat === "meeting" ? "Meeting" : "Personal"}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={cn(
              "flex min-h-[80px] w-full rounded-md border bg-background px-3 py-2 text-sm",
              "shadow-sm transition-colors placeholder:text-muted-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
            disabled={loading}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="startTime">Start Time *</Label>
            <Input
              id="startTime"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="endTime">End Time *</Label>
            <Input
              id="endTime"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              required
              disabled={loading}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="location">Location</Label>
          <Input
            id="location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="attendees">Attendees</Label>
          <Input
            id="attendees"
            value={attendees}
            onChange={(e) => setAttendees(e.target.value)}
            placeholder="Separate multiple attendees with commas"
            disabled={loading}
          />
        </div>

        <div className="flex justify-end gap-2 pt-4">
          {meeting && onDelete && (
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={loading}
            >
              Delete
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "Saving..." : "Save"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};

MeetingDialog.displayName = "MeetingDialog";

