import os
import sqlite3
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# ── Paths are relative to this file (…/backend/app/db/session.py)
_THIS = Path(__file__).resolve()
APP_DIR = _THIS.parents[1]             # backend/app
DB_DIR = APP_DIR / "data"              # backend/app/data
DB_DIR.mkdir(parents=True, exist_ok=True)

# Default DB: backend/app/data/app.db
DEFAULT_DB_PATH = DB_DIR / "app.db"
DEFAULT_DB_URL = f"sqlite:///{DEFAULT_DB_PATH.as_posix()}"

DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_DB_URL)

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, echo=False, future=True, connect_args=connect_args)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
Base = declarative_base()

# SQL scripts directory: backend/app/db/sql
SQL_DIR = _THIS.parent / "sql"
SCHEMA_SQL = SQL_DIR / "init_schema.sql"
DATA_SQL = SQL_DIR / "init_data.sql"

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_sqlite_conn() -> sqlite3.Connection:
    """Raw sqlite connection (for executing SQL scripts / direct queries)."""
    if engine.url.get_backend_name() != "sqlite":
        raise RuntimeError("get_sqlite_conn only supports sqlite backend")
    db_path = Path(engine.url.database)
    conn = sqlite3.connect(db_path.as_posix())
    conn.row_factory = sqlite3.Row
    return conn

def _table_exists(name: str) -> bool:
    try:
        with get_sqlite_conn() as c:
            cur = c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (name,))
            return cur.fetchone() is not None
    except Exception:
        return False

def _executescript(path: Path):
    if not path.exists():
        raise FileNotFoundError(f"SQL file not found: {path}")
    sql = path.read_text(encoding="utf-8")
    with get_sqlite_conn() as c:
        c.execute("PRAGMA foreign_keys = ON;")
        c.executescript(sql)
        c.commit()

def _maybe_bootstrap():
    # Allow forced rebuild
    if os.getenv("RESET_DB", "0") == "1":
        try:
            p = Path(engine.url.database)
            if p.exists():
                p.unlink()
        except Exception:
            pass

    # Skip auto-bootstrap if disabled
    if os.getenv("AUTO_BOOTSTRAP_DB", "1") != "1":
        return

    # If key tables are missing, initialize schema + demo data
    need_schema = not (_table_exists("revenue_trend") and _table_exists("executive_kpis"))
    if need_schema:
        print("[DB] Bootstrapping schema & demo data …")
        DB_DIR.mkdir(parents=True, exist_ok=True)
        _executescript(SCHEMA_SQL)
        _executescript(DATA_SQL)
        print("[DB] Bootstrap complete.")

try:
    _maybe_bootstrap()
except Exception as e:
    print(f"[DB] Bootstrap skipped due to error: {e}")
