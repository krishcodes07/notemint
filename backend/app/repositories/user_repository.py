"""User repository: lookup and race-safe upsert keyed by Clerk user id."""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.user import User

logger = logging.getLogger(__name__)


class UserRepository:
    """Data-access operations for the ``users`` table."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def get_by_clerk_id(self, clerk_user_id: str) -> User | None:
        """Return the user row for a verified Clerk id, or None."""
        statement = select(User).where(User.clerk_user_id == clerk_user_id)
        return self._session.execute(statement).scalar_one_or_none()

    def list_for_user(self, clerk_user_id: str) -> list[User]:
        """Return only the requested user's rows (isolation helper)."""
        statement = (
            select(User)
            .where(User.clerk_user_id == clerk_user_id)
            .order_by(User.clerk_user_id)
        )
        return list(self._session.execute(statement).scalars())

    def create(
        self,
        clerk_user_id: str,
        *,
        display_name: str | None = None,
        email: str | None = None,
    ) -> User:
        """Insert a new user. Raises IntegrityError if it already exists."""
        user = User(
            clerk_user_id=clerk_user_id,
            display_name=display_name,
            email=email,
        )
        self._session.add(user)
        self._session.flush()
        return user

    def upsert(
        self,
        clerk_user_id: str,
        *,
        display_name: str | None = None,
        email: str | None = None,
    ) -> User:
        """Get-or-create a user, updating trusted profile fields if present.

        Concurrency-safe: a duplicate insert (two first requests racing)
        loses the race on a savepoint, rolls back cleanly, and re-reads the
        winner's row — so no duplicate records are ever produced.
        """
        user = self.get_by_clerk_id(clerk_user_id)
        if user is None:
            try:
                with self._session.begin_nested():
                    return self.create(
                        clerk_user_id,
                        display_name=display_name,
                        email=email,
                    )
            except IntegrityError:
                logger.debug("User insert raced, re-reading row: %s", clerk_user_id)
                user = self.get_by_clerk_id(clerk_user_id)
                if user is None:
                    raise

        changed = False
        if display_name is not None and display_name != user.display_name:
            user.display_name = display_name
            changed = True
        if email is not None and email != user.email:
            user.email = email
            changed = True
        if changed:
            self._session.flush()
        return user

    def delete(self, clerk_user_id: str) -> bool:
        """Delete a user row (and, via ORM cascade, their documents)."""
        user = self.get_by_clerk_id(clerk_user_id)
        if user is None:
            return False
        self._session.delete(user)
        self._session.flush()
        return True
