from fastapi import FastAPI
from app.core.handlers import register_exception_handlers

from app.api import menu, ai, price_update

app = FastAPI(title="Menu AI")

register_exception_handlers(app)
app.include_router(menu.router)
app.include_router(price_update.router)
app.include_router(ai.router)

@app.get("/")
async def home():
    return {"message": "Menu AI API"}