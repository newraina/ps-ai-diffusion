from fastapi import FastAPI

app = FastAPI(title="PS AI Bridge", version="0.1.0")


@app.get("/api/health")
async def health():
    return {"status": "ok"}
