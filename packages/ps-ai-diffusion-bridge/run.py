"""Standalone FastAPI server entry point.

Run with: python run.py
"""
import logging
import uvicorn

# Configure logging to show debug info
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

if __name__ == "__main__":
    uvicorn.run(
        "src.fastapi_app:app",
        host="0.0.0.0",
        port=7860,
        reload=True,
    )
