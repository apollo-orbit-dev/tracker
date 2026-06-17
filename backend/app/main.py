from fastapi import FastAPI

from backend.app.config import settings
from backend.app.middleware.origin_check import OriginCheckMiddleware
from backend.app.routes import admin as admin_routes
from backend.app.routes import audit_log as audit_log_routes
from backend.app.routes import auth as auth_routes
from backend.app.routes import health as health_routes
from backend.app.routes import contacts as contacts_routes
from backend.app.routes import metrics as metrics_routes
from backend.app.routes import cors as cors_routes
from backend.app.routes import notes as notes_routes
from backend.app.routes import dashboard as dashboard_routes
from backend.app.routes import project_access as project_access_routes
from backend.app.routes import project_contacts as project_contacts_routes
from backend.app.routes import projects as projects_routes
from backend.app.routes import roster as roster_routes
from backend.app.routes import saved_metrics as saved_metrics_routes
from backend.app.routes import taxonomy as taxonomy_routes
from backend.app.routes import templates as templates_routes
from backend.app.routes import view_columns as view_columns_routes
from backend.app.routes import views as views_routes

app = FastAPI(title="Tracker", version="0.0.0")

app.add_middleware(
    OriginCheckMiddleware,
    allowed_origins=settings.allowed_origins_list,
)

app.include_router(health_routes.router)
app.include_router(auth_routes.router)
app.include_router(admin_routes.router)
app.include_router(audit_log_routes.router)
app.include_router(taxonomy_routes.departments_router)
app.include_router(taxonomy_routes.clients_router)
app.include_router(taxonomy_routes.disciplines_router)
app.include_router(templates_routes.router)
app.include_router(projects_routes.router)
app.include_router(cors_routes.router)
app.include_router(notes_routes.router)
app.include_router(contacts_routes.router)
app.include_router(project_contacts_routes.router)
app.include_router(project_access_routes.router)
app.include_router(roster_routes.router)
app.include_router(dashboard_routes.router)
app.include_router(dashboard_routes.dashboards_router)
app.include_router(view_columns_routes.router)
app.include_router(views_routes.router)
app.include_router(metrics_routes.router)
app.include_router(saved_metrics_routes.router)
