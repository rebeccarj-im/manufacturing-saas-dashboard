# backend/app/api/messages.py
from fastapi import APIRouter, HTTPException
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
import sqlite3
from app.db.session import engine

router = APIRouter(prefix="/api", tags=["messages"])


# ===== Pydantic Models =====
class MessageCreate(BaseModel):
    title: str
    content: str
    recipient_id: Optional[int] = None  # For future multi-user support
    priority: Optional[str] = "normal"  # "low", "normal", "high", "urgent"


class MessageUpdate(BaseModel):
    read: Optional[bool] = None
    archived: Optional[bool] = None


class MessageResponse(BaseModel):
    id: int
    title: str
    content: str
    sender: Optional[str] = None
    recipient_id: Optional[int] = None
    priority: str
    read: bool
    archived: bool
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
    """Create messages table if it doesn't exist."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT NOT NULL,
            content     TEXT NOT NULL,
            sender      TEXT,
            recipient_id INTEGER,
            priority    TEXT NOT NULL DEFAULT 'normal',
            read        BOOLEAN NOT NULL DEFAULT 0,
            archived    BOOLEAN NOT NULL DEFAULT 0,
            created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CHECK (priority IN ('low', 'normal', 'high', 'urgent'))
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_messages_read ON messages(read)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_messages_archived ON messages(archived)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)")
    conn.commit()


def _row_to_message(row: sqlite3.Row) -> MessageResponse:
    """Convert a database row to a MessageResponse."""
    return MessageResponse(
        id=row["id"],
        title=row["title"],
        content=row["content"],
        sender=row["sender"],
        recipient_id=row["recipient_id"],
        priority=row["priority"],
        read=bool(row["read"]),
        archived=bool(row["archived"]),
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
    )


# ===== API Endpoints =====
@router.post("/messages", response_model=MessageResponse, status_code=201)
def create_message(message: MessageCreate):
    """Create a new message."""
    with _conn() as conn:
        _ensure_table(conn)
        cur = conn.cursor()
        try:
            cur.execute("BEGIN")
            cur.execute(
                """
                INSERT INTO messages (title, content, sender, recipient_id, priority)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    message.title,
                    message.content,
                    "System",  # Default sender
                    message.recipient_id,
                    message.priority,
                ),
            )
            conn.commit()
            message_id = cur.lastrowid
            # Fetch the created message
            cur.execute("SELECT * FROM messages WHERE id = ?", (message_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=500, detail="Failed to retrieve created message")
            return _row_to_message(row)
        except sqlite3.IntegrityError as e:
            conn.rollback()
            raise HTTPException(status_code=400, detail=f"Database constraint error: {str(e)}")
        except Exception as e:
            conn.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to create message: {str(e)}")


@router.get("/messages", response_model=List[MessageResponse])
def list_messages(
    read: Optional[bool] = None,
    archived: Optional[bool] = None,
    limit: Optional[int] = None,
):
    """
    List messages, optionally filtered by read/archived status.
    """
    with _conn() as conn:
        _ensure_table(conn)
        cur = conn.cursor()

        query = "SELECT * FROM messages WHERE 1=1"
        params = []

        if read is not None:
            query += " AND read = ?"
            params.append(1 if read else 0)

        if archived is not None:
            query += " AND archived = ?"
            params.append(1 if archived else 0)

        query += " ORDER BY created_at DESC"

        if limit:
            query += " LIMIT ?"
            params.append(limit)

        cur.execute(query, params)
        rows = cur.fetchall()
        return [_row_to_message(row) for row in rows]


@router.get("/messages/unread-count")
def get_unread_count():
    """Get the count of unread messages."""
    with _conn() as conn:
        _ensure_table(conn)
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) as count FROM messages WHERE read = 0 AND archived = 0")
        row = cur.fetchone()
        return {"count": row["count"] if row else 0}


@router.get("/messages/{message_id}", response_model=MessageResponse)
def get_message(message_id: int):
    """Get a specific message by ID."""
    with _conn() as conn:
        _ensure_table(conn)
        cur = conn.cursor()
        cur.execute("SELECT * FROM messages WHERE id = ?", (message_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Message not found")
        return _row_to_message(row)


@router.put("/messages/{message_id}", response_model=MessageResponse)
def update_message(message_id: int, message_update: MessageUpdate):
    """Update a message (mark as read/unread, archive/unarchive)."""
    with _conn() as conn:
        _ensure_table(conn)
        cur = conn.cursor()

        # Check if message exists
        cur.execute("SELECT * FROM messages WHERE id = ?", (message_id,))
        existing = cur.fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Message not found")

        # Build update query
        updates = []
        params = []

        if message_update.read is not None:
            updates.append("read = ?")
            params.append(1 if message_update.read else 0)

        if message_update.archived is not None:
            updates.append("archived = ?")
            params.append(1 if message_update.archived else 0)

        if not updates:
            # No updates provided, return existing
            return _row_to_message(existing)

        updates.append("updated_at = CURRENT_TIMESTAMP")
        params.append(message_id)

        try:
            cur.execute("BEGIN")
            cur.execute(
                f"UPDATE messages SET {', '.join(updates)} WHERE id = ?",
                params,
            )
            conn.commit()
            # Fetch updated message
            cur.execute("SELECT * FROM messages WHERE id = ?", (message_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=500, detail="Failed to retrieve updated message")
            return _row_to_message(row)
        except Exception as e:
            conn.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to update message: {str(e)}")


@router.post("/messages/{message_id}/mark-read", response_model=MessageResponse)
def mark_message_read(message_id: int):
    """Mark a message as read."""
    return update_message(message_id, MessageUpdate(read=True))


@router.post("/messages/mark-all-read")
def mark_all_read():
    """Mark all messages as read."""
    with _conn() as conn:
        _ensure_table(conn)
        cur = conn.cursor()
        try:
            cur.execute("BEGIN")
            cur.execute("UPDATE messages SET read = 1, updated_at = CURRENT_TIMESTAMP WHERE read = 0")
            conn.commit()
            return {"status": "success", "message": "All messages marked as read"}
        except Exception as e:
            conn.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to mark all as read: {str(e)}")


@router.delete("/messages/{message_id}", status_code=204)
def delete_message(message_id: int):
    """Delete a message."""
    with _conn() as conn:
        _ensure_table(conn)
        cur = conn.cursor()

        # Check if message exists
        cur.execute("SELECT id FROM messages WHERE id = ?", (message_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Message not found")

        try:
            cur.execute("BEGIN")
            cur.execute("DELETE FROM messages WHERE id = ?", (message_id,))
            conn.commit()
        except Exception as e:
            conn.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to delete message: {str(e)}")

