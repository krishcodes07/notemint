from fastapi import APIRouter
from db import users_collection

router = APIRouter()

@router.get("/user/{user_id}")
def check_user(user_id: str):
    user = users_collection.find_one({"userId": user_id})
    if not user:
        return {"exists": False, "completedOnboarding": False}

    return {
        "exists": True,
        "completedOnboarding": user.get("completedOnboarding", False),
        "user": {
            "name": user.get("name"),
            "class": user.get("class"),
            "subjects": user.get("subjects"),
            "state": user.get("state"),
            "goal": user.get("goal"),
        }
    }
