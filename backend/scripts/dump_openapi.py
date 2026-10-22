"""Write the FastAPI OpenAPI document to a file (used to generate frontend types)."""

import json
import sys

from app.main import app

if __name__ == "__main__":
    out = sys.argv[1]
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(app.openapi(), fh, indent=2)
        fh.write("\n")
