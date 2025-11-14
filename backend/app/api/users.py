# backend/app/api/users.py
from fastapi import APIRouter, HTTPException
from typing import Optional
from pydantic import BaseModel, EmailStr
from datetime import datetime
import sqlite3
from app.db.session import engine

router = APIRouter(prefix="/api", tags=["users"])


# ===== Pydantic Models =====
class UserProfile(BaseModel):
    id: int
    name: str
    email: str
    avatar_url: Optional[str] = None
    role: Optional[str] = None
    department: Optional[str] = None
    phone: Optional[str] = None
    timezone: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class UserProfileUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    avatar_url: Optional[str] = None
    role: Optional[str] = None
    department: Optional[str] = None
    phone: Optional[str] = None
    timezone: Optional[str] = None


class UserSettings(BaseModel):
    theme: Optional[str] = "light"  # "light", "dark", "auto"
    notifications_enabled: bool = True
    email_notifications: bool = True
    language: Optional[str] = "en"
    date_format: Optional[str] = "YYYY-MM-DD"
    time_format: Optional[str] = "24h"


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


def _ensure_tables(conn: sqlite3.Connection) -> None:
    """Create users and user_settings tables if they don't exist."""
    # Users table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            email       TEXT NOT NULL UNIQUE,
            avatar_url  TEXT,
            role        TEXT,
            department  TEXT,
            phone       TEXT,
            timezone    TEXT,
            created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # User settings table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS user_settings (
            user_id                 INTEGER PRIMARY KEY,
            theme                   TEXT DEFAULT 'light',
            notifications_enabled   BOOLEAN DEFAULT 1,
            email_notifications     BOOLEAN DEFAULT 1,
            language                TEXT DEFAULT 'en',
            date_format             TEXT DEFAULT 'YYYY-MM-DD',
            time_format             TEXT DEFAULT '24h',
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)
    
    # Create default user if not exists
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) as count FROM users")
    if cur.fetchone()["count"] == 0:
        cur.execute("""
            INSERT INTO users (name, email, role, department)
            VALUES (?, ?, ?, ?)
        """, ("Demo User", "demo@example.com", "Admin", "Executive"))
        user_id = cur.lastrowid
        cur.execute("""
            INSERT INTO user_settings (user_id)
            VALUES (?)
        """, (user_id,))
    
    conn.commit()


def _row_to_profile(row: sqlite3.Row) -> UserProfile:
    """Convert a database row to a UserProfile."""
    return UserProfile(
        id=row["id"],
        name=row["name"],
        email=row["email"],
        avatar_url=row["avatar_url"],
        role=row["role"],
        department=row["department"],
        phone=row["phone"],
        timezone=row["timezone"],
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
    )


# ===== API Endpoints =====
@router.get("/users/me", response_model=UserProfile)
def get_current_user():
    """Get the current user's profile."""
    with _conn() as conn:
        _ensure_tables(conn)
        cur = conn.cursor()
        # For now, return the first user (in a real app, this would use authentication)
        cur.execute("SELECT * FROM users LIMIT 1")
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        return _row_to_profile(row)


@router.put("/users/me", response_model=UserProfile)
def update_current_user(profile_update: UserProfileUpdate):
    """Update the current user's profile."""
    with _conn() as conn:
        _ensure_tables(conn)
        cur = conn.cursor()

        # Get current user (first user for now)
        cur.execute("SELECT * FROM users LIMIT 1")
        existing = cur.fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="User not found")

        user_id = existing["id"]

        # Build update query
        updates = []
        params = []

        if profile_update.name is not None:
            updates.append("name = ?")
            params.append(profile_update.name)
        if profile_update.email is not None:
            updates.append("email = ?")
            params.append(profile_update.email)
        if profile_update.avatar_url is not None:
            updates.append("avatar_url = ?")
            params.append(profile_update.avatar_url)
        if profile_update.role is not None:
            updates.append("role = ?")
            params.append(profile_update.role)
        if profile_update.department is not None:
            updates.append("department = ?")
            params.append(profile_update.department)
        if profile_update.phone is not None:
            updates.append("phone = ?")
            params.append(profile_update.phone)
        if profile_update.timezone is not None:
            updates.append("timezone = ?")
            params.append(profile_update.timezone)

        if not updates:
            return _row_to_profile(existing)

        updates.append("updated_at = CURRENT_TIMESTAMP")
        params.append(user_id)

        try:
            cur.execute("BEGIN")
            cur.execute(
                f"UPDATE users SET {', '.join(updates)} WHERE id = ?",
                params,
            )
            conn.commit()
            # Fetch updated profile
            cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=500, detail="Failed to retrieve updated profile")
            return _row_to_profile(row)
        except sqlite3.IntegrityError as e:
            conn.rollback()
            raise HTTPException(status_code=400, detail=f"Database constraint error: {str(e)}")
        except Exception as e:
            conn.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to update profile: {str(e)}")


@router.get("/users/me/settings", response_model=UserSettings)
def get_user_settings():
    """Get the current user's settings."""
    with _conn() as conn:
        _ensure_tables(conn)
        cur = conn.cursor()
        # Get first user's settings
        cur.execute("SELECT * FROM user_settings LIMIT 1")
        row = cur.fetchone()
        if not row:
            # Create default settings
            cur.execute("SELECT id FROM users LIMIT 1")
            user_row = cur.fetchone()
            if not user_row:
                raise HTTPException(status_code=404, detail="User not found")
            cur.execute("""
                INSERT INTO user_settings (user_id)
                VALUES (?)
            """, (user_row["id"],))
            conn.commit()
            cur.execute("SELECT * FROM user_settings WHERE user_id = ?", (user_row["id"],))
            row = cur.fetchone()
        
        return UserSettings(
            theme=row["theme"],
            notifications_enabled=bool(row["notifications_enabled"]),
            email_notifications=bool(row["email_notifications"]),
            language=row["language"],
            date_format=row["date_format"],
            time_format=row["time_format"],
        )


@router.put("/users/me/settings", response_model=UserSettings)
def update_user_settings(settings: UserSettings):
    """Update the current user's settings."""
    with _conn() as conn:
        _ensure_tables(conn)
        cur = conn.cursor()
        
        # Get first user
        cur.execute("SELECT id FROM users LIMIT 1")
        user_row = cur.fetchone()
        if not user_row:
            raise HTTPException(status_code=404, detail="User not found")
        
        user_id = user_row["id"]

        try:
            cur.execute("BEGIN")
            cur.execute("""
                INSERT INTO user_settings (user_id, theme, notifications_enabled, email_notifications, language, date_format, time_format)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    theme = excluded.theme,
                    notifications_enabled = excluded.notifications_enabled,
                    email_notifications = excluded.email_notifications,
                    language = excluded.language,
                    date_format = excluded.date_format,
                    time_format = excluded.time_format
            """, (
                user_id,
                settings.theme,
                1 if settings.notifications_enabled else 0,
                1 if settings.email_notifications else 0,
                settings.language,
                settings.date_format,
                settings.time_format,
            ))
            conn.commit()
            return settings
        except Exception as e:
            conn.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to update settings: {str(e)}")

