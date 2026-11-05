"""FastAPI database dependencies."""

from __future__ import annotations

from typing import Iterator

from sqlalchemy.orm import Session

from app.db.session import get_session_factory


def get_db() -> Iterator[Session]:
    """Provide a scoped SQLAlchemy session per request.

    The session is committed when the request succeeds, rolled back when it
    raises, and always closed — including on error paths.
    """
    session = get_session_factory()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
