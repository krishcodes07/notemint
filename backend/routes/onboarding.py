from fastapi import APIRouter, Request
from db import users_collection

router = APIRouter()

@router.post("/onboarding")
async def save_onboarding(req: Request):
    data = await req.json()

    user_id = data.get("userId")

    if not user_id:
        print("❌ userId missing!")
        return {"success": False, "error": "userId missing"}

    result = users_collection.update_one(
        {"userId": user_id},
        {
            "$set": {
                "name": data.get("name"),
                "class": data.get("class"),
                "subjects": data.get("subjects"),
                "state": data.get("state"),
                "goal": data.get("goal"),
                "completedOnboarding": True
            }
        },
        upsert=True
    )

    print("✅ MongoDB Updated:", result.raw_result)

    return {"success": True}
