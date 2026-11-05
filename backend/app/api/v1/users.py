"""Application user endpoints (database-backed)."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.dependencies import get_db
from app.dependencies.auth import get_current_user
from app.repositories.user_repository import UserRepository
from app.schemas.auth import AuthenticatedUser
from app.schemas.user import UserProfileResponse

router = APIRouter(tags=["users"])


@router.get(
    "/users/me",
    response_model=UserProfileResponse,
    summary="Current user's application profile",
)
def read_user_me(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserProfileResponse:
    """Return (creating on first visit) the signed-in user's profile.

    The identity comes exclusively from the verified Clerk session token —
    never from a client-supplied id. The row is inserted on the first
    authenticated interaction and reused afterwards (no duplicates).
    """
    user = UserRepository(db).upsert(current_user.user_id)
    return UserProfileResponse.model_validate(user)
