"""Standalone FastAPI server entry point.

Run with: python run.py
"""
import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "src.fastapi_app:app",
        host="0.0.0.0",
        port=7860,
        reload=True,
    )
