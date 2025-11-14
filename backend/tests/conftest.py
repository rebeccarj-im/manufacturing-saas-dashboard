# backend/tests/conftest.py
import os, sys, sqlite3, pathlib, pytest
from fastapi.testclient import TestClient

BACKEND_DIR = pathlib.Path(__file__).resolve().parents[1]   # .../backend
APP_DIR = BACKEND_DIR / "app"
DB_PATH = APP_DIR / "data" / "app.db"

# Make `from app.*` importable
sys.path.insert(0, str(BACKEND_DIR))

# Set the database path early (routers read engine.url.database)
os.environ.setdefault("DATABASE_URL", f"sqlite:///{DB_PATH}")

# Support two possible locations: prefer app/db/sql, fallback to db/sql
SQL_DIR_CANDIDATES = [
    APP_DIR / "db" / "sql",
    BACKEND_DIR / "db" / "sql",
]

def _get_sql_path(filename: str) -> pathlib.Path:
    for d in SQL_DIR_CANDIDATES:
        p = d / filename
        if p.exists():
            return p
    raise FileNotFoundError(
        f"Cannot find {filename}. Tried: " +
        ", ".join(str(d / filename) for d in SQL_DIR_CANDIDATES)
    )

def _exec_sql(conn: sqlite3.Connection, file_path: pathlib.Path):
    with file_path.open("r", encoding="utf-8") as f:
        conn.executescript(f.read())

@pytest.fixture(scope="session", autouse=True)
def _prepare_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    if DB_PATH.exists():
        DB_PATH.unlink()
    with sqlite3.connect(DB_PATH) as conn:
        _exec_sql(conn, _get_sql_path("init_schema.sql"))
        _exec_sql(conn, _get_sql_path("init_data.sql"))
    yield

@pytest.fixture()
def client():
    from app.main import app
    return TestClient(app)
