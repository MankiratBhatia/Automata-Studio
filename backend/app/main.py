from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import adapters, schemas, storage
from app.routers import analyze, convert, machines, projects
from automata_core.errors import (
    InputSymbolError,
    InvalidAutomatonError,
    LimitExceededError,
    RegexSyntaxError,
    WrongKindError,
)

VERSION = "0.1.0"

app = FastAPI(title="Automata Studio API", version=VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze.router)
app.include_router(convert.router)
app.include_router(machines.router)
app.include_router(projects.router)


def _error(status: int, body: schemas.ErrorBody) -> JSONResponse:
    payload = schemas.ErrorResponse(error=body).model_dump(exclude_none=True)
    return JSONResponse(payload, status_code=status)


@app.exception_handler(InvalidAutomatonError)
def _invalid_automaton(_: Request, exc: InvalidAutomatonError) -> JSONResponse:
    return _error(
        400,
        schemas.ErrorBody(
            code="INVALID_AUTOMATON",
            message="This has errors. Fix them before running this operation.",
            issues=[adapters.issue_out(i) for i in exc.issues],
        ),
    )


@app.exception_handler(InputSymbolError)
def _input_symbol(_: Request, exc: InputSymbolError) -> JSONResponse:
    return _error(
        400, schemas.ErrorBody(code="INPUT_SYMBOL", message=str(exc), position=exc.position)
    )


@app.exception_handler(storage.ProjectNotFoundError)
def _project_not_found(_: Request, __: storage.ProjectNotFoundError) -> JSONResponse:
    return _error(
        404, schemas.ErrorBody(code="NOT_FOUND", message="No saved project with that id.")
    )


@app.exception_handler(RegexSyntaxError)
def _regex_syntax(_: Request, exc: RegexSyntaxError) -> JSONResponse:
    return _error(
        400,
        schemas.ErrorBody(code="REGEX_SYNTAX", message=exc.message, position=exc.position),
    )


@app.exception_handler(LimitExceededError)
def _limit_exceeded(_: Request, exc: LimitExceededError) -> JSONResponse:
    return _error(400, schemas.ErrorBody(code="LIMIT_EXCEEDED", message=str(exc)))


@app.exception_handler(WrongKindError)
def _wrong_kind(_: Request, exc: WrongKindError) -> JSONResponse:
    return _error(400, schemas.ErrorBody(code="WRONG_KIND", message=str(exc)))


@app.exception_handler(RequestValidationError)
def _bad_request(_: Request, exc: RequestValidationError) -> JSONResponse:
    first = exc.errors()[0]
    if first["type"] == "json_invalid":
        message = "Request body is not valid JSON."
    else:
        where = ".".join(str(p) for p in first["loc"] if p != "body")
        message = f"{where}: {first['msg']}" if where else str(first["msg"])
    return _error(422, schemas.ErrorBody(code="VALIDATION", message=message))


@app.get("/api/health", response_model=schemas.HealthResponse)
def health() -> schemas.HealthResponse:
    return schemas.HealthResponse(status="ok", version=VERSION)
