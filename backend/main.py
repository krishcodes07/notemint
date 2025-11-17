from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.onboarding import router as onboarding_router
from routes.user import router as user_router

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(onboarding_router, prefix="/api")
app.include_router(user_router, prefix="/api")
