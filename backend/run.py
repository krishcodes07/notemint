import os
import sys
from pathlib import Path

import uvicorn

# Make the backend directory importable
backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

if __name__ == "__main__":
    port = int(os.environ.get("SERVER_PORT") or os.environ.get("PORT") or "8000")

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=port,
        workers=1,
        log_level="info",
    )