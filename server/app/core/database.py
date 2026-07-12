import logging
from typing import Generator
from psycopg_pool import ConnectionPool
from psycopg.rows import dict_row
from psycopg import Connection
from server.app.core.config import settings

logger = logging.getLogger(__name__)

# Connection pool instance
pool: ConnectionPool = None

def init_db_pool() -> None:
    """Initialize the global connection pool."""
    global pool
    try:
        # Convert postgresql:// to postgresql:// if needed, or pass directly
        # Psycopg 3 accepts standard postgresql connection strings
        conninfo = settings.DATABASE_URL
        # Initialize pool
        pool = ConnectionPool(
            conninfo=conninfo,
            min_size=2,
            max_size=20,
            kwargs={"row_factory": dict_row},
            open=True
        )
        logger.info("Database connection pool initialized successfully.")
    except Exception as e:
        logger.error(f"Failed to initialize database pool: {e}")
        raise e

def close_db_pool() -> None:
    """Close the global connection pool."""
    global pool
    if pool is not None:
        pool.close()
        logger.info("Database connection pool closed.")

def get_db() -> Generator[Connection, None, None]:
    """Dependency to get a connection from the pool."""
    global pool
    if pool is None:
        raise RuntimeError("Database pool is not initialized")
    
    with pool.connection() as conn:
        yield conn
