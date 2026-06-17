"""Seed 30 demo projects against the DIV1 / CON / Design template.

One-shot seed, intentionally NOT idempotent on its own — it picks
project numbers in the 10000000-10001000 range and refuses to run if any
collide with an existing live project. Re-running is safe in the sense
that it'll abort with a clear message rather than double-seed.

Distribution per the maintainer's spec:
- ~10 last-year, ~10 this-year, ~10 next-year projects
- Total budget: $10,000 to $250,000 (rounded to nearest $100)
- Design budget: 70-80% of total budget
- Design spent: usually ~30-95% of design budget; occasionally
  100-130% (overruns)
- Progress %: close to (design_spent / design_budget), with
  occasional ±20% jitter and a few wildly off
- Milestone actuals: filled in for past planned dates, blank for some;
  always blank for future planned dates

Usage:
    docker compose exec backend python -m backend.scripts.seed_demo_projects
"""
from __future__ import annotations

import random
import sys
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.db.models import (
    Milestone,
    Project,
    Template,
    TemplateFieldDef,
    TemplateMilestoneDef,
    User,
)
from backend.app.db.session import SessionLocal

TEMPLATE_LABEL = "DIV1 / CON / Design"
SITES = [
    "Endor", "Naboo", "Hoth", "Tatooine", "Coruscant", "Dagobah", "Bespin",
    "Mustafar", "Kashyyyk", "Geonosis", "Yavin", "Alderaan", "Mandalore",
    "Kamino", "Felucia", "Lothal", "Jakku", "Crait", "Scarif", "Jedha",
    "Ord Mantell", "Ryloth", "Sullust", "Takodana", "Exegol", "Pasaana",
    "Kef Bir", "Ahch-To", "Cantonica", "Pillio",
]
RNG = random.Random(20260522)  # deterministic for reproducibility


def _round_to(value: float, step: int) -> int:
    return int(round(value / step) * step)


def _bucket_for(idx: int) -> str:
    """Even split across past / present / future."""
    return ["past", "present", "future"][idx % 3]


def _today() -> date:
    return date.today()


def _date_in_bucket(bucket: str) -> date:
    """Pick a date roughly centered in the bucket's year, with ±150 days
    of spread inside that year so milestones don't all land in January."""
    today = _today()
    if bucket == "past":
        anchor = date(today.year - 1, 6, 15)
    elif bucket == "present":
        anchor = today
    else:
        anchor = date(today.year + 1, 6, 15)
    return anchor + timedelta(days=RNG.randint(-150, 150))


def _lifecycle_for(bucket: str) -> str:
    if bucket == "past":
        return "cancelled" if RNG.random() < 0.1 else "complete"
    if bucket == "future":
        return "draft" if RNG.random() < 0.25 else "active"
    return "active"


def _bool_conditional_date(probability_true: float, when: date | None) -> dict:
    if when is None:
        return {"value": False, "date": None}
    if RNG.random() < probability_true:
        return {"value": True, "date": when.isoformat()}
    return {"value": False, "date": None}


def seed(db: Session) -> None:
    # Find the template by label so a UUID change won't break this script.
    template = db.execute(
        select(Template).where(
            Template.name == TEMPLATE_LABEL,
            Template.deleted_at.is_(None),
        )
    ).scalar_one_or_none()
    if template is None:
        raise RuntimeError(
            f"Template '{TEMPLATE_LABEL}' not found. Seed the taxonomy first."
        )

    field_defs = (
        db.execute(
            select(TemplateFieldDef).where(
                TemplateFieldDef.template_id == template.id,
                TemplateFieldDef.deleted_at.is_(None),
            )
        ).scalars().all()
    )
    milestone_defs = (
        db.execute(
            select(TemplateMilestoneDef).where(
                TemplateMilestoneDef.template_id == template.id,
                TemplateMilestoneDef.deleted_at.is_(None),
            ).order_by(TemplateMilestoneDef.order_index)
        ).scalars().all()
    )

    fd_by_name = {fd.name: fd for fd in field_defs}
    required_names = {
        "Region", "Site Name", "Phase", "Project Description",
        "Updates / Outstanding Items", "Progress", "Design Budget",
        "Design Spent", "Total Budget", "Total Spent",
        "NTP Received", "As-builts Received", "Kick-Off Meeting",
        "Lessons Learned",
    }
    missing = required_names - set(fd_by_name)
    if missing:
        raise RuntimeError(f"Template is missing expected fields: {sorted(missing)}")

    # Pick the bootstrap admin (or any live user) as created_by.
    user = db.execute(
        select(User).where(User.deleted_at.is_(None)).limit(1)
    ).scalar_one()

    # Refuse if project numbers in our chosen range already exist.
    existing_numbers = set(
        db.execute(
            select(Project.project_number).where(
                Project.project_number.in_(
                    [f"{10000000 + i:08d}" for i in range(30)]
                ),
                Project.deleted_at.is_(None),
            )
        ).scalars().all()
    )
    if existing_numbers:
        raise RuntimeError(
            f"Refusing to seed — project numbers already exist: "
            f"{sorted(existing_numbers)}"
        )

    today = _today()
    sites = list(SITES)
    RNG.shuffle(sites)

    for i in range(30):
        bucket = _bucket_for(i)
        site = sites[i]
        project_num = f"{10000000 + i:08d}"
        client_num = f"C{18000 + RNG.randint(0, 999)}-{RNG.randint(100, 999)}"
        title = f"{site} Rollout"

        # Budgets.
        total_budget = _round_to(RNG.uniform(10_000, 250_000), 100)
        design_pct = RNG.uniform(0.70, 0.80)
        design_budget = _round_to(total_budget * design_pct, 100)

        # Spent: usually a fraction of budget; ~15% are overruns (>100%).
        if RNG.random() < 0.15:
            design_spent_pct = RNG.uniform(1.00, 1.30)
        else:
            design_spent_pct = RNG.uniform(0.30, 0.95)
        design_spent = _round_to(design_budget * design_spent_pct, 100)
        # Total spent correlates with design spent but with some drift.
        total_spent_pct = design_spent_pct * RNG.uniform(0.90, 1.10)
        total_spent = _round_to(total_budget * total_spent_pct, 100)

        # Progress: usually close to spent/budget, occasionally far off.
        base_progress = design_spent_pct * 100
        if RNG.random() < 0.15:
            # Wildly off — design ran ahead/behind reality.
            jitter = RNG.uniform(-40, 40)
        else:
            jitter = RNG.uniform(-15, 15)
        progress = max(0, min(100, round(base_progress + jitter)))

        phase_choice = RNG.choices(
            ["30% Design", "60% Design", "90% Design", None],
            weights=[3, 4, 2, 1],
        )[0]
        region_choice = RNG.choices(["North", "South"], weights=[3, 1])[0]

        # Conditional-date custom fields. NTP usually true for active+.
        ntp_date = _date_in_bucket(bucket) - timedelta(days=RNG.randint(30, 120))
        kickoff_date = ntp_date + timedelta(days=RNG.randint(7, 30))
        ntp_received = _bool_conditional_date(
            probability_true=(0.95 if bucket != "future" else 0.5),
            when=ntp_date if ntp_date <= today else None,
        )
        kickoff_meeting = _bool_conditional_date(
            probability_true=(0.85 if bucket != "future" else 0.3),
            when=kickoff_date if kickoff_date <= today else None,
        )

        # Late-stage fields only fire for past-bucket projects.
        if bucket == "past":
            as_builts_received = _bool_conditional_date(
                probability_true=0.7,
                when=_date_in_bucket("past"),
            )
            lessons_learned = _bool_conditional_date(
                probability_true=0.4,
                when=_date_in_bucket("past"),
            )
        else:
            as_builts_received = {"value": False, "date": None}
            lessons_learned = {"value": False, "date": None}

        description_phrases = [
            "Website redesign and CMS migration.",
            "New customer onboarding portal, phase 1.",
            "Data warehouse migration, scope locked at 30% design.",
            "Mobile app rollout across three regions.",
            "Internal tooling upgrade with SSO integration.",
            "Office relocation and network buildout.",
            "Reporting platform refresh, full scope.",
            "Capacity expansion and performance tuning.",
            "Service rebuild with new API backend.",
            "Vendor system replacement; cutover planned.",
        ]
        updates_phrases = [
            "Awaiting client review of the latest draft.",
            "Vendor lead time slipped two weeks; recovery plan in place.",
            "Kickoff walkthrough rescheduled to next week.",
            "Cutover window confirmed; coordinating with ops.",
            "Outstanding review comments from QA; expected by Friday.",
            "On track.",
            "Pending Fabrikam approval on the proposed scope.",
            "Requirements review with client this Thursday.",
        ]

        cfv: dict = {
            str(fd_by_name["Region"].id): region_choice,
            str(fd_by_name["Site Name"].id): site,
            str(fd_by_name["Project Description"].id): RNG.choice(description_phrases),
            str(fd_by_name["Updates / Outstanding Items"].id): RNG.choice(updates_phrases),
            str(fd_by_name["Progress"].id): progress,
            str(fd_by_name["Design Budget"].id): design_budget,
            str(fd_by_name["Design Spent"].id): design_spent,
            str(fd_by_name["Total Budget"].id): total_budget,
            str(fd_by_name["Total Spent"].id): total_spent,
            str(fd_by_name["NTP Received"].id): ntp_received,
            str(fd_by_name["As-builts Received"].id): as_builts_received,
            str(fd_by_name["Kick-Off Meeting"].id): kickoff_meeting,
            str(fd_by_name["Lessons Learned"].id): lessons_learned,
        }
        if phase_choice is not None:
            cfv[str(fd_by_name["Phase"].id)] = phase_choice

        lifecycle = _lifecycle_for(bucket)
        project = Project(
            project_number=project_num,
            client_project_number=client_num,
            title=title,
            template_id=template.id,
            lifecycle_state=lifecycle,
            custom_field_values=cfv,
            created_by=user.id,
        )
        db.add(project)
        db.flush()  # need project.id for milestones

        # Generate milestones — planned dates spread across the bucket's
        # year, actuals filled for past planned dates (with ~25% blank to
        # simulate "still in flight").
        # Anchor for milestones: cluster around the bucket center.
        anchor = _date_in_bucket(bucket)
        for j, md in enumerate(milestone_defs):
            planned = anchor + timedelta(days=(j - 3) * RNG.randint(20, 45))
            actual: date | None = None
            if planned <= today and RNG.random() < 0.75:
                actual = planned + timedelta(days=RNG.randint(-7, 21))
            db.add(
                Milestone(
                    project_id=project.id,
                    template_milestone_def_id=md.id,
                    name=md.name,
                    direction=md.direction,
                    date_model=md.date_model,
                    planned_date=planned,
                    actual_date=actual if md.date_model == "planned_actual" else (
                        # For single-date milestones we store the effective
                        # date in planned_date and leave actual_date null.
                        None
                    ),
                    order_index=md.order_index,
                )
            )

        print(
            f"  [{i + 1:>2}/30] {project_num} {title:<40} "
            f"{lifecycle:>9} {bucket}"
        )

    db.commit()


def main() -> int:
    db = SessionLocal()
    try:
        seed(db)
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
