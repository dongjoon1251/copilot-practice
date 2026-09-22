"""FastAPI backend for a modern web calculator.

Serves the static single-page UI from static/ and exposes a JSON API
at /api/calc that safely evaluates arithmetic expressions.
"""

import ast
import logging
import math
import operator
import time
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
logger = logging.getLogger("calculator.requests")
logger.setLevel(logging.INFO)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logger.addHandler(handler)
logger.propagate = False

app = FastAPI(title="Calculator API")

# Serve CSS/JS assets under /static, keep index.html served at "/".
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.middleware("http")
async def log_request(request: Request, call_next):
    """Log request metadata without recording query strings or request bodies."""
    started_at = time.perf_counter()
    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
        return response
    finally:
        latency_ms = (time.perf_counter() - started_at) * 1000
        logger.info(
            "request method=%s path=%s status=%s latency_ms=%.2f",
            request.method,
            request.url.path,
            status_code,
            latency_ms,
        )


class CalcRequest(BaseModel):
    expression: str


class CalcResponses(BaseModel):
    expression: str
    result: float


# Only these AST node types/operators are allowed, so arbitrary code
# cannot be executed via the expression string.
_ALLOWED_BINOPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
    ast.FloorDiv: operator.floordiv,
}
_ALLOWED_UNARYOPS = {
    ast.UAdd: operator.pos,
    ast.USub: operator.neg,
}


def _eval_node(node: ast.AST) -> float:
    if isinstance(node, ast.Expression):
        return _eval_node(node.body)
    if isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float)):
            return node.value
        raise ValueError("Only numeric constants are allowed")
    if isinstance(node, ast.BinOp) and type(node.op) in _ALLOWED_BINOPS:
        left = _eval_node(node.left)
        right = _eval_node(node.right)
        try:
            return _ALLOWED_BINOPS[type(node.op)](left, right)
        except ZeroDivisionError:
            raise ValueError("Division by zero")
    if isinstance(node, ast.UnaryOp) and type(node.op) in _ALLOWED_UNARYOPS:
        return _ALLOWED_UNARYOPS[type(node.op)](_eval_node(node.operand))
    raise ValueError("Invalid or unsupported expression")


def safe_eval(expression: str) -> float:
    """Safely evaluate a basic arithmetic expression string."""
    expression = expression.strip()
    if not expression:
        raise ValueError("Expression must not be empty")
    try:
        tree = ast.parse(expression, mode="eval")
    except SyntaxError:
        raise ValueError("Invalid expression syntax")
    result = _eval_node(tree)
    if isinstance(result, float) and (math.isnan(result) or math.isinf(result)):
        raise ValueError("Result is not a finite number")
    return result


@app.get("/")
def read_index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/calc", response_model=CalcResponses)
def calc(payload: CalcRequest) -> CalcResponses:
    try:
        result = safe_eval(payload.expression)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return CalcResponses(expression=payload.expression, result=result)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("calculate:app", host="0.0.0.0", port=8000, reload=True)
