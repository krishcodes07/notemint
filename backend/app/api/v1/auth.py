"""Authentication endpoints."""

from fastapi import APIRouter, Depends

from app.dependencies.auth import get_current_user
from app.schemas.auth import AuthenticatedUser, MeResponse

router = APIRouter(tags=["auth"])


@router.get(
    "/auth/me",
    response_model=MeResponse,
    summary="Current authenticated user",
)
def read_me(
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> MeResponse:
    """Return the identity verified from the Clerk session token.

    Requires `Authorization: Bearer <CLERK_SESSION_TOKEN>`. The returned
    `user_id` is the token's verified `sub` claim — never a client-supplied
    value.
    """
    return MeResponse(user_id=current_user.user_id, authenticated=True)
