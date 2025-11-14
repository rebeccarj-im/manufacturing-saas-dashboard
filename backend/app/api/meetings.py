# backend/app/api/meetings.py
from fastapi import APIRouter, HTTPException
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime, date, timedelta
import sqlite3
from app.db.session import engine

router = APIRouter(prefix="/api", tags=["meetings"])


# ===== Pydantic Models =====
class MeetingCreate(BaseModel):
    title: str
    description: Optional[str] = None
    start_time: datetime
    end_time: datetime
    location: Optional[str] = None
    attendees: Optional[str] = None  # JSON string or comma-separated list
    category: Optional[str] = "meeting"  # "meeting" or "personal"


class MeetingUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    location: Optional[str] = None
    attendees: Optional[str] = None
    category: Optional[str] = None


class MeetingResponse(BaseModel):
    id: int
    title: str
    description: Optional[str]
    start_time: datetime
    end_time: datetime
    location: Optional[str]
    attendees: Optional[str]
    category: Optional[str] = "meeting"
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ===== DB Helpers =====
def _conn() -> sqlite3.Connection:
    """Open a SQLite connection with WAL mode."""
    db_path = engine.url.database
    conn = sqlite3.connect(db_path, timeout=5, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA busy_timeout=5000;")
    conn.row_factory = sqlite3.Row
    return conn


def _ensure_table(conn: sqlite3.Connection) -> None:
    """Create meetings table if it doesn't exist."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS meetings (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT NOT NULL,
            description TEXT,
            start_time  DATETIME NOT NULL,
            end_time    DATETIME NOT NULL,
            location    TEXT,
            attendees   TEXT,
            category    TEXT DEFAULT 'meeting',
            created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CHECK (end_time > start_time)
        )
    """)
    # Add category column if it doesn't exist (for existing databases)
    try:
        conn.execute("ALTER TABLE meetings ADD COLUMN category TEXT DEFAULT 'meeting'")
    except sqlite3.OperationalError:
        pass  # Column already exists
    conn.execute("CREATE INDEX IF NOT EXISTS idx_meetings_start_time ON meetings(start_time)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_meetings_end_time ON meetings(end_time)")
    conn.commit()


def _row_to_meeting(row: sqlite3.Row) -> MeetingResponse:
    """Convert a database row to a MeetingResponse."""
    # Handle category field - it might not exist in old databases
    category = "meeting"
    try:
        if "category" in row.keys():
            category = row["category"] or "meeting"
    except (KeyError, AttributeError):
        pass
    
    return MeetingResponse(
        id=row["id"],
        title=row["title"],
        description=row["description"],
        start_time=datetime.fromisoformat(row["start_time"]),
        end_time=datetime.fromisoformat(row["end_time"]),
        location=row["location"],
        attendees=row["attendees"],
        category=category,
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
    )


# ===== API Endpoints =====
@router.post("/meetings", response_model=MeetingResponse, status_code=201)
def create_meeting(meeting: MeetingCreate):
    """Create a new meeting."""
    if meeting.end_time <= meeting.start_time:
        raise HTTPException(status_code=400, detail="end_time must be after start_time")

    with _conn() as conn:
        _ensure_table(conn)
        cur = conn.cursor()
        try:
            cur.execute("BEGIN")
            cur.execute(
                """
                INSERT INTO meetings (title, description, start_time, end_time, location, attendees, category)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    meeting.title,
                    meeting.description,
                    meeting.start_time.isoformat(),
                    meeting.end_time.isoformat(),
                    meeting.location,
                    meeting.attendees,
                    meeting.category or "meeting",
                ),
            )
            conn.commit()
            meeting_id = cur.lastrowid
            # Fetch the created meeting
            cur.execute("SELECT * FROM meetings WHERE id = ?", (meeting_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=500, detail="Failed to retrieve created meeting")
            return _row_to_meeting(row)
        except sqlite3.IntegrityError as e:
            conn.rollback()
            raise HTTPException(status_code=400, detail=f"Database constraint error: {str(e)}")
        except Exception as e:
            conn.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to create meeting: {str(e)}")


@router.get("/meetings", response_model=List[MeetingResponse])
def list_meetings(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
):
    """
    List all meetings, optionally filtered by date range.
    
    Query parameters:
    - start_date: ISO format date string (YYYY-MM-DD) - inclusive
    - end_date: ISO format date string (YYYY-MM-DD) - inclusive
    """
    with _conn() as conn:
        _ensure_table(conn)
        cur = conn.cursor()

        query = "SELECT * FROM meetings WHERE 1=1"
        params = []

        if start_date and end_date and start_date == end_date:
            # Single date query - use DATE() function for accurate comparison
            try:
                query += " AND DATE(start_time) = ?"
                params.append(start_date)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")
        else:
            # Date range query
            if start_date:
                try:
                    # Parse and ensure we're comparing dates correctly
                    start_dt = datetime.fromisoformat(start_date).replace(hour=0, minute=0, second=0, microsecond=0)
                    query += " AND start_time >= ?"
                    params.append(start_dt.isoformat())
                except ValueError:
                    raise HTTPException(status_code=400, detail="Invalid start_date format. Use YYYY-MM-DD or ISO datetime.")

            if end_date:
                try:
                    # Parse and set to end of day (next day 00:00:00, exclusive)
                    end_dt = datetime.fromisoformat(end_date).replace(hour=0, minute=0, second=0, microsecond=0)
                    end_dt = end_dt + timedelta(days=1)  # Next day 00:00:00
                    query += " AND start_time < ?"
                    params.append(end_dt.isoformat())
                except ValueError:
                    raise HTTPException(status_code=400, detail="Invalid end_date format. Use YYYY-MM-DD or ISO datetime.")

        query += " ORDER BY start_time ASC"

        cur.execute(query, params)
        rows = cur.fetchall()
        return [_row_to_meeting(row) for row in rows]


@router.get("/meetings/{meeting_id}", response_model=MeetingResponse)
def get_meeting(meeting_id: int):
    """Get a specific meeting by ID."""
    with _conn() as conn:
        _ensure_table(conn)
        cur = conn.cursor()
        cur.execute("SELECT * FROM meetings WHERE id = ?", (meeting_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Meeting not found")
        return _row_to_meeting(row)


@router.put("/meetings/{meeting_id}", response_model=MeetingResponse)
def update_meeting(meeting_id: int, meeting_update: MeetingUpdate):
    """Update a meeting."""
    with _conn() as conn:
        _ensure_table(conn)
        cur = conn.cursor()

        # Check if meeting exists
        cur.execute("SELECT * FROM meetings WHERE id = ?", (meeting_id,))
        existing = cur.fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Meeting not found")

        # Build update query dynamically
        updates = []
        params = []

        if meeting_update.title is not None:
            updates.append("title = ?")
            params.append(meeting_update.title)
        if meeting_update.description is not None:
            updates.append("description = ?")
            params.append(meeting_update.description)
        if meeting_update.start_time is not None:
            updates.append("start_time = ?")
            params.append(meeting_update.start_time.isoformat())
        if meeting_update.end_time is not None:
            updates.append("end_time = ?")
            params.append(meeting_update.end_time.isoformat())
        if meeting_update.location is not None:
            updates.append("location = ?")
            params.append(meeting_update.location)
        if meeting_update.attendees is not None:
            updates.append("attendees = ?")
            params.append(meeting_update.attendees)
        if meeting_update.category is not None:
            updates.append("category = ?")
            params.append(meeting_update.category)

        if not updates:
            # No updates provided, return existing
            return _row_to_meeting(existing)

        # Validate time constraints if both times are being updated
        start_time = meeting_update.start_time.isoformat() if meeting_update.start_time else existing["start_time"]
        end_time = meeting_update.end_time.isoformat() if meeting_update.end_time else existing["end_time"]
        
        if datetime.fromisoformat(end_time) <= datetime.fromisoformat(start_time):
            raise HTTPException(status_code=400, detail="end_time must be after start_time")

        updates.append("updated_at = CURRENT_TIMESTAMP")
        params.append(meeting_id)

        try:
            cur.execute("BEGIN")
            cur.execute(
                f"UPDATE meetings SET {', '.join(updates)} WHERE id = ?",
                params,
            )
            conn.commit()
            # Fetch updated meeting
            cur.execute("SELECT * FROM meetings WHERE id = ?", (meeting_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=500, detail="Failed to retrieve updated meeting")
            return _row_to_meeting(row)
        except sqlite3.IntegrityError as e:
            conn.rollback()
            raise HTTPException(status_code=400, detail=f"Database constraint error: {str(e)}")
        except Exception as e:
            conn.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to update meeting: {str(e)}")


@router.delete("/meetings/{meeting_id}", status_code=204)
def delete_meeting(meeting_id: int):
    """Delete a meeting."""
    with _conn() as conn:
        _ensure_table(conn)
        cur = conn.cursor()

        # Check if meeting exists
        cur.execute("SELECT id FROM meetings WHERE id = ?", (meeting_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Meeting not found")

        try:
            cur.execute("BEGIN")
            cur.execute("DELETE FROM meetings WHERE id = ?", (meeting_id,))
            conn.commit()
        except Exception as e:
            conn.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to delete meeting: {str(e)}")

