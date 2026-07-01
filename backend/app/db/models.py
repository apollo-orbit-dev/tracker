import uuid
from datetime import date, datetime, time

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.db.base import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "lifecycle_state IN ('active', 'deactivated', 'pending')",
            name="lifecycle_state_valid",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String, nullable=False)
    lifecycle_state: Mapped[str] = mapped_column(
        String, nullable=False, default="active", server_default="active"
    )
    okta_subject: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    user_roles: Mapped[list["UserRole"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        foreign_keys="UserRole.user_id",
    )
    auth_providers: Mapped[list["AuthProvider"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    project_role_assignments: Mapped[list["ProjectRoleAssignment"]] = (
        relationship(
            back_populates="user",
            cascade="all, delete-orphan",
            foreign_keys="ProjectRoleAssignment.user_id",
        )
    )


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    label: Mapped[str] = mapped_column(String, nullable=False)

    user_roles: Mapped[list["UserRole"]] = relationship(back_populates="role")


class UserRole(Base):
    __tablename__ = "user_roles"
    __table_args__ = (
        CheckConstraint(
            "(role_id IN ('admin', 'viewer') AND department_id IS NULL)"
            " OR "
            "(role_id IN ('viewer', 'project_editor', 'department_manager') "
            "AND department_id IS NOT NULL)",
            name="department_scope",
        ),
        # NULLS NOT DISTINCT means the admin-NULL-dept row counts as a
        # single fixed slot per user (PG 15+).
        Index(
            "uq_user_roles_user_role_dept",
            "user_id",
            "role_id",
            "department_id",
            unique=True,
            postgresql_nulls_not_distinct=True,
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    role_id: Mapped[str] = mapped_column(
        String, ForeignKey("roles.id"), nullable=False, index=True
    )
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("departments.id"),
        nullable=True,
        index=True,
    )
    granted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    granted_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    user: Mapped["User"] = relationship(
        back_populates="user_roles",
        foreign_keys=[user_id],
    )
    role: Mapped["Role"] = relationship(back_populates="user_roles")


class AuthProvider(Base):
    __tablename__ = "auth_providers"
    __table_args__ = (
        UniqueConstraint("user_id", "provider", name="user_provider"),
        CheckConstraint(
            "provider IN ('local', 'okta')",
            name="provider_valid",
        ),
        CheckConstraint(
            "(provider = 'local' AND password_hash IS NOT NULL AND okta_subject IS NULL)"
            " OR "
            "(provider = 'okta' AND okta_subject IS NOT NULL AND password_hash IS NULL)",
            name="provider_payload_matches",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    provider: Mapped[str] = mapped_column(String, nullable=False)
    password_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    okta_subject: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    user: Mapped["User"] = relationship(back_populates="auth_providers")


# ---- taxonomy ------------------------------------------------------------
# departments / clients / disciplines share the same column shape: code +
# name plus audit + soft-delete metadata. Each is its own table so FK
# references in later phases (templates, projects, role scope) are simple
# and explicit.


class _TaxonomyMixin:
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    code: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )


class Department(_TaxonomyMixin, Base):
    __tablename__ = "departments"


class Client(_TaxonomyMixin, Base):
    __tablename__ = "clients"

    department_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("departments.id"),
        nullable=False,
        index=True,
    )


class Discipline(_TaxonomyMixin, Base):
    __tablename__ = "disciplines"

    department_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("departments.id"),
        nullable=False,
        index=True,
    )


# ---- template builder ----------------------------------------------------
# Field-type catalog. Source of truth is the DB CHECK constraint on
# template_field_defs.field_type; this frozenset mirrors it for use in
# Pydantic schemas and tests. Keep in sync with migration 0003.
FIELD_TYPES: frozenset[str] = frozenset({
    # text-shaped
    "short_text", "long_text", "url", "email", "phone",
    # number-shaped
    "integer", "decimal", "currency", "percent", "auto_number",
    # date-shaped
    "date", "date_planned_actual", "date_range", "duration",
    # choice
    "single_select", "multi_select",
    # boolean (with optional conditional follow-up)
    "boolean", "boolean_conditional_date", "boolean_conditional_text",
    # references
    "user_picker_single", "user_picker_multi", "contact_picker",
    "project_reference", "client_reference",
})

SELECT_FIELD_TYPES: frozenset[str] = frozenset({"single_select", "multi_select"})

MILESTONE_DIRECTIONS: frozenset[str] = frozenset(
    {"outbound", "inbound", "internal", "external"}
)
MILESTONE_DATE_MODELS: frozenset[str] = frozenset({"single", "planned_actual"})


from sqlalchemy import Boolean, Integer, SmallInteger  # noqa: E402
from sqlalchemy.dialects.postgresql import JSONB  # noqa: E402


class Template(Base):
    __tablename__ = "templates"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    department_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("departments.id"), nullable=False
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id"), nullable=False
    )
    discipline_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("disciplines.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    field_defs: Mapped[list["TemplateFieldDef"]] = relationship(
        back_populates="template",
        cascade="all, delete-orphan",
    )
    milestone_defs: Mapped[list["TemplateMilestoneDef"]] = relationship(
        back_populates="template",
        cascade="all, delete-orphan",
    )


class TemplateFieldDef(Base):
    __tablename__ = "template_field_defs"
    __table_args__ = (
        CheckConstraint(
            "field_type IN ("
            "'short_text','long_text','url','email','phone',"
            "'integer','decimal','currency','percent','auto_number',"
            "'date','date_planned_actual','date_range','duration',"
            "'single_select','multi_select',"
            "'boolean','boolean_conditional_date','boolean_conditional_text',"
            "'user_picker_single','user_picker_multi','contact_picker',"
            "'project_reference','client_reference'"
            ")",
            name="field_type_valid",
        ),
        CheckConstraint(
            "(field_type IN ('single_select','multi_select') AND options IS NOT NULL)"
            " OR "
            "(field_type NOT IN ('single_select','multi_select') AND options IS NULL)",
            name="options_for_select",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("templates.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    field_type: Mapped[str] = mapped_column(String, nullable=False)
    required: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    # Phase 5.2: surface this field's value in the at-a-glance contexts
    # (projects-list peek panel + project detail right sidebar).
    is_project_metric: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    order_index: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    options: Mapped[dict | None] = mapped_column(
        JSONB(none_as_null=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    template: Mapped["Template"] = relationship(back_populates="field_defs")


class TemplateMilestoneDef(Base):
    __tablename__ = "template_milestone_defs"
    __table_args__ = (
        CheckConstraint(
            "direction IN ('outbound','inbound','internal','external')",
            name="direction_valid",
        ),
        CheckConstraint(
            "date_model IN ('single','planned_actual')",
            name="date_model_valid",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("templates.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    direction: Mapped[str] = mapped_column(String, nullable=False)
    date_model: Mapped[str] = mapped_column(String, nullable=False)
    order_index: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    template: Mapped["Template"] = relationship(back_populates="milestone_defs")


# ---- projects + milestones ----------------------------------------------
# A project instantiates a template. On create, one Milestone is auto-spawned
# per live TemplateMilestoneDef. Custom field values land in a JSONB column
# keyed by field-def UUID.

from sqlalchemy import Date  # noqa: E402


class Project(Base):
    __tablename__ = "projects"
    __table_args__ = (
        CheckConstraint(
            "lifecycle_state IN ('draft','active','on_hold','complete','cancelled')",
            name="lifecycle_state_valid",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_number: Mapped[str] = mapped_column(String, nullable=False)
    client_project_number: Mapped[str | None] = mapped_column(String, nullable=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("templates.id"), nullable=False, index=True
    )
    lifecycle_state: Mapped[str] = mapped_column(
        String,
        nullable=False,
        default="draft",
        server_default="draft",
        index=True,
    )
    custom_field_values: Mapped[dict] = mapped_column(
        JSONB(none_as_null=True),
        nullable=False,
        default=dict,
        server_default="{}",
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    template: Mapped["Template"] = relationship()
    milestones: Mapped[list["Milestone"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
    )
    role_assignments: Mapped[list["ProjectRoleAssignment"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
    )


class ProjectRoleAssignment(Base):
    """Per-project read-only access grant (Phase 3.0.3).

    Row presence on `(user_id, project_id)` confers viewer semantics on
    that project regardless of the user's department scope. There is no
    `role_id` column — the table itself encodes the read-only intent so
    it can't accidentally escalate. Edit checks intentionally do not
    consult this table.
    """

    __tablename__ = "project_role_assignments"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        primary_key=True,
    )
    granted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    granted_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    user: Mapped["User"] = relationship(
        back_populates="project_role_assignments",
        foreign_keys=[user_id],
    )
    project: Mapped["Project"] = relationship(
        back_populates="role_assignments",
    )


class Milestone(Base):
    __tablename__ = "milestones"
    __table_args__ = (
        CheckConstraint(
            "direction IN ('outbound','inbound','internal','external')",
            name="direction_valid",
        ),
        CheckConstraint(
            "date_model IN ('single','planned_actual')",
            name="date_model_valid",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    template_milestone_def_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("template_milestone_defs.id"),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    direction: Mapped[str] = mapped_column(String, nullable=False)
    date_model: Mapped[str] = mapped_column(String, nullable=False)
    planned_date: Mapped[date | None] = mapped_column(
        Date, nullable=True, index=True
    )
    actual_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    order_index: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    project: Mapped["Project"] = relationship(back_populates="milestones")


# ---- change order requests (CORs) ----------------------------------------

COR_STATUSES: frozenset[str] = frozenset(
    {"draft", "submitted", "approved", "rejected", "cancelled"}
)


from sqlalchemy import Numeric, Text  # noqa: E402


class COR(Base):
    __tablename__ = "cors"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft','submitted','approved','rejected','cancelled')",
            name="status_valid",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    number: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(String, nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    submitted_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    approved_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(
        String, nullable=False, default="draft", server_default="draft", index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )


# ---- assignments ---------------------------------------------------------

ASSIGNMENT_STATUSES: frozenset[str] = frozenset(
    {"open", "in_progress", "done", "cancelled"}
)


class Assignment(Base):
    __tablename__ = "assignments"
    __table_args__ = (
        CheckConstraint(
            "status IN ('open','in_progress','done','cancelled')",
            name="assignment_status_valid",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    milestone_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("milestones.id"),
        nullable=True,
    )
    assignee_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    description: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(
        String, nullable=False, default="open", server_default="open", index=True
    )
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    assignee: Mapped["User"] = relationship(foreign_keys=[assignee_user_id])
    milestone: Mapped["Milestone | None"] = relationship()


# ---- events (Phase 14) ---------------------------------------------------

from sqlalchemy import Time  # noqa: E402


class Event(Base):
    __tablename__ = "events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    department_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("departments.id"), nullable=False, index=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    about_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    all_day: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    start_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    end_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    recurrence: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    about_user: Mapped["User | None"] = relationship(foreign_keys=[about_user_id])
    overrides: Mapped[list["EventOccurrenceOverride"]] = relationship(
        back_populates="event", cascade="all, delete-orphan")


class EventOccurrenceOverride(Base):
    __tablename__ = "event_occurrence_overrides"
    __table_args__ = (
        CheckConstraint("status IN ('cancelled','modified')", name="event_override_status_valid"),
        UniqueConstraint("event_id", "original_date", name="uq_event_override_occurrence"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    original_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    override_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    override_title: Mapped[str | None] = mapped_column(String, nullable=True)
    override_description: Mapped[str | None] = mapped_column(String, nullable=True)
    override_all_day: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    override_start_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    override_end_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    event: Mapped["Event"] = relationship(back_populates="overrides")


# ---- forms (Phase 17) ----------------------------------------------------

FORM_FIELD_TYPES: frozenset[str] = frozenset(
    {"short_text", "long_text", "integer", "decimal",
     "currency", "date", "single_select", "boolean", "user"}
)
FORM_TARGET_ENTITIES: frozenset[str] = frozenset(
    {"cor", "assignment", "milestone", "event", "intake"}
)
FORM_STATUSES: frozenset[str] = frozenset({"draft", "active", "archived"})
FORM_SUBMISSION_STATUSES: frozenset[str] = frozenset(
    {"pending", "approved", "rejected"}
)


class Form(Base):
    __tablename__ = "forms"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft','active','archived')", name="form_status_valid"
        ),
        CheckConstraint(
            "target_entity IS NULL OR target_entity IN "
            "('cor','assignment','milestone','event','intake')",
            name="form_target_entity_valid",
        ),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    department_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("departments.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    target_entity: Mapped[str | None] = mapped_column(String, nullable=True)
    # Bound template for the `intake` target (the new project's Dept×Client×
    # Discipline); NULL for every other target. Phase 20.5.
    target_template_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("templates.id"), nullable=True
    )
    status: Mapped[str] = mapped_column(
        String, nullable=False, default="draft", server_default="draft"
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    fields: Mapped[list["FormField"]] = relationship(
        back_populates="form", cascade="all, delete-orphan"
    )


class FormField(Base):
    __tablename__ = "form_fields"
    __table_args__ = (
        CheckConstraint(
            "field_type IN ('short_text','long_text','integer','decimal',"
            "'currency','date','single_select','boolean','user')",
            name="form_field_type_valid",
        ),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    form_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("forms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    field_type: Mapped[str] = mapped_column(String, nullable=False)
    required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    help_text: Mapped[str | None] = mapped_column(String(500), nullable=True)
    placeholder: Mapped[str | None] = mapped_column(String(200), nullable=True)
    options: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    target_key: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    form: Mapped["Form"] = relationship(back_populates="fields")


class FormSubmission(Base):
    __tablename__ = "form_submissions"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending','approved','rejected')", name="form_submission_status_valid"
        ),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    form_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("forms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    submitted_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    values: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    target_project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True
    )
    status: Mapped[str] = mapped_column(
        String, nullable=False, default="pending", server_default="pending", index=True
    )
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    pushed_entity_type: Mapped[str | None] = mapped_column(String, nullable=True)
    pushed_entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


# ---- notes ---------------------------------------------------------------


class Note(Base):
    __tablename__ = "notes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        index=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    author: Mapped["User"] = relationship(foreign_keys=[created_by])


# ---- contacts ------------------------------------------------------------


class Contact(Base):
    __tablename__ = "contacts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    department_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("departments.id"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str | None] = mapped_column(String, nullable=True)
    phone: Mapped[str | None] = mapped_column(String, nullable=True)
    organization: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )


# ---- project_contacts (M2M) ----------------------------------------------


class ProjectContact(Base):
    __tablename__ = "project_contacts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    contact_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("contacts.id"),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    contact: Mapped["Contact"] = relationship()


# ---- dashboards + widgets (Phases 2.1–2.4) -------------------------------


class UserDashboard(Base):
    """Phase 2.4: a user can have multiple named dashboards (tabs).
    Each dashboard owns its widget set + ordering + sizing + configs.
    """

    __tablename__ = "user_dashboards"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    order_index: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

WIDGET_TYPES: frozenset[str] = frozenset(
    {
        "lifecycle",
        "milestone_lookahead",
        "cor_summary",
        "recent_activity",
        "field_aggregate",
        "my_assignments",
    }
)

BLOCK_TYPES: frozenset[str] = frozenset(
    {"metric", "chart", "breakdown", "table", "text"}
)

BLOCK_ACCENTS: frozenset[str] = frozenset(
    {"indigo", "blue", "emerald", "amber", "rose", "slate"}
)

# Numeric field types eligible for the field_aggregate widget.
NUMERIC_FIELD_TYPES: frozenset[str] = frozenset(
    {"integer", "decimal", "currency", "percent"}
)


class UserDashboardWidget(Base):
    __tablename__ = "user_dashboard_widgets"
    __table_args__ = (
        CheckConstraint(
            "widget_type IN ("
            "'lifecycle','milestone_lookahead','cor_summary','recent_activity',"
            "'field_aggregate','my_assignments'"
            ")",
            name="widget_type_valid",
        ),
        CheckConstraint("width IN (1, 2)", name="width_valid"),
        CheckConstraint("column_pos IN (0, 1)", name="column_pos_valid"),
        # Partial unique: enforce one-of-each PER DASHBOARD only for
        # unconfigured widgets (the 2.0 set). Configurable widgets
        # (field_aggregate) can appear multiple times with different
        # configs. Phase 2.4 scoped this to (dashboard_id, widget_type)
        # — a user can have the same widget on multiple tabs.
        Index(
            "uq_user_dashboard_widgets_dashboard_type_unconfigured",
            "dashboard_id",
            "widget_type",
            unique=True,
            postgresql_where=text("config IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # Kept after 2.4 for the existence-hiding 404 logic in widget
    # PATCH/DELETE — same value as `dashboard.user_id` but cheaper to
    # check directly than to join.
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dashboard_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("user_dashboards.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    widget_type: Mapped[str] = mapped_column(String, nullable=False)
    order_index: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    width: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default="1"
    )
    # Phase 2.11: which column a half-width widget renders in. Ignored
    # when width == 2 (spans both columns).
    column_pos: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
        default=0,
        server_default="0",
    )
    # User-overridable header text. Null falls back to the widget
    # library's default label on the frontend.
    title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    config: Mapped[dict | None] = mapped_column(
        JSONB(none_as_null=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class UserProjectViewColumns(Base):
    """Per-user-per-template column prefs for the viewing list.

    Stores the ordered list of visible column keys + the current sort
    selection (built-in columns only). One row per (user_id, template_id).
    """
    __tablename__ = "user_project_view_columns"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "template_id",
            name="uq_user_project_view_columns_user_template",
        ),
        CheckConstraint(
            "sort_direction IN ('asc', 'desc') OR sort_direction IS NULL",
            name="sort_direction_valid",
        ),
        CheckConstraint(
            "(sort_key IS NULL) = (sort_direction IS NULL)",
            name="sort_key_direction_paired",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("templates.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    columns: Mapped[list[str]] = mapped_column(
        JSONB(none_as_null=False),
        nullable=False,
        default=list,
        server_default="[]",
    )
    sort_key: Mapped[str | None] = mapped_column(String, nullable=True)
    sort_direction: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


# ---- audit log (Phase 3.1) ----------------------------------------------


from sqlalchemy import BigInteger, Text  # noqa: E402


class AuditLog(Base):
    """Append-only record of mutating operations across the system.

    One row per user-level operation. `changes` JSONB carries the
    operation-specific shape (a per-field diff for `update`, `from`/`to`
    for `transition`, role payload for `grant`/`revoke`, initial values
    for `create`, empty dict for `delete`). `project_id` is denormalized
    on sub-entity rows (milestone/cor/note/project_role_assignment) so
    "everything for project X" is a single indexed query.
    """

    __tablename__ = "audit_log"
    __table_args__ = (
        CheckConstraint(
            "entity_type IN ("
            "'project', 'milestone', 'cor', 'note', "
            "'user_role', 'project_role_assignment', 'assignment', 'app_setting', 'event', "
            "'form', 'form_submission'"
            ")",
            name="entity_type_valid",
        ),
        CheckConstraint(
            "operation IN ("
            "'create', 'update', 'delete', 'transition', 'grant', 'revoke'"
            ")",
            name="operation_valid",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger, primary_key=True, autoincrement=True
    )
    entity_type: Mapped[str] = mapped_column(Text, nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    operation: Mapped[str] = mapped_column(Text, nullable=False)
    changes: Mapped[dict] = mapped_column(JSONB, nullable=False)
    changed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[dict] = mapped_column(JSONB, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )


# ---- custom views (Phase 7.1) -------------------------------------------


class CustomView(Base):
    __tablename__ = "custom_views"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # Sub-phase D wires publishing; the column exists from day one so
    # visibility logic never needs a second migration.
    published_department_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("departments.id"),
        nullable=True,
        index=True,
    )
    # View-level scope bar defaults (sub-phase D). JSONB so keys can grow.
    scope: Mapped[dict | None] = mapped_column(
        JSONB(none_as_null=True), nullable=True
    )
    order_index: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    blocks: Mapped[list["CustomViewBlock"]] = relationship(
        back_populates="view", cascade="all, delete-orphan"
    )


class CustomViewBlock(Base):
    __tablename__ = "custom_view_blocks"
    __table_args__ = (
        CheckConstraint(
            "block_type IN ('metric','chart','breakdown','table','text')",
            name="block_type_valid",
        ),
        CheckConstraint("width IN (1, 2, 4)", name="block_width_valid"),
        CheckConstraint(
            "accent IN ('indigo','blue','emerald','amber','rose','slate')",
            name="block_accent_valid",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    view_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("custom_views.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    block_type: Mapped[str] = mapped_column(String, nullable=False)
    title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    order_index: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    width: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default="1"
    )
    accent: Mapped[str] = mapped_column(
        String(20), nullable=False, default="indigo", server_default="indigo"
    )
    config: Mapped[dict | None] = mapped_column(
        JSONB(none_as_null=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    view: Mapped["CustomView"] = relationship(back_populates="blocks")


class SavedMetric(Base):
    """A personal, reusable metric definition (Phase 7.9). Applying one
    copies the config into a block — no live link — so these are
    lightweight owner-scoped rows with hard delete (mirrors widgets)."""

    __tablename__ = "saved_metrics"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    config: Mapped[dict] = mapped_column(JSONB(none_as_null=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
