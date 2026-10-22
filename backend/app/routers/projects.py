from fastapi import APIRouter, Response

from app import schemas, storage

router = APIRouter(prefix="/api/projects", tags=["projects"])

_ERRORS: dict[int | str, dict[str, object]] = {
    404: {"model": schemas.ErrorResponse},
    422: {"model": schemas.ErrorResponse},
}


def _project(row: storage.ProjectRow) -> schemas.Project:
    return schemas.Project(
        id=row.id,
        name=row.name,
        kind=row.kind,
        createdAt=row.created_at,
        updatedAt=row.updated_at,
        automaton=schemas.Automaton.model_validate_json(row.json),
    )


def _fields(automaton: schemas.Automaton) -> tuple[str, str, str]:
    name = automaton.name.strip() or "Untitled"
    return name, automaton.kind, automaton.model_dump_json(by_alias=True)


@router.get("", response_model=list[schemas.ProjectSummary])
def list_projects() -> list[schemas.ProjectSummary]:
    return [
        schemas.ProjectSummary(
            id=r.id,
            name=r.name,
            kind=r.kind,
            createdAt=r.created_at,
            updatedAt=r.updated_at,
        )
        for r in storage.list_projects()
    ]


@router.post("", status_code=201, response_model=schemas.Project, responses=_ERRORS)
def create_project(body: schemas.ProjectIn) -> schemas.Project:
    return _project(storage.create_project(*_fields(body.automaton)))


@router.get("/{project_id}", response_model=schemas.Project, responses=_ERRORS)
def get_project(project_id: str) -> schemas.Project:
    return _project(storage.get_project(project_id))


@router.put("/{project_id}", response_model=schemas.Project, responses=_ERRORS)
def update_project(project_id: str, body: schemas.ProjectIn) -> schemas.Project:
    return _project(storage.update_project(project_id, *_fields(body.automaton)))


@router.delete("/{project_id}", status_code=204, responses=_ERRORS)
def delete_project(project_id: str) -> Response:
    storage.delete_project(project_id)
    return Response(status_code=204)
