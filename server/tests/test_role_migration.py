import importlib.util
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text


MIGRATION_PATH = (
    Path(__file__).parents[1]
    / "alembic"
    / "versions"
    / "ia2b3c4d5e6f_merge_head_nurse_into_supervisor.py"
)


def load_migration():
    spec = importlib.util.spec_from_file_location("role_migration", MIGRATION_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_role_migration_is_complete_idempotent_and_revokes_legacy_sessions(monkeypatch) -> None:
    migration = load_migration()
    expected = {
        ("care_directives", "target_role"),
        ("care_schedules", "assigned_role"),
        ("care_tasks", "assigned_role"),
        ("care_workflow_job_assignees", "role_hint"),
        ("caregivers", "role"),
        ("handover_notes", "target_role"),
        ("role_messages", "recipient_role"),
        ("routine_tasks", "assigned_role"),
        ("support_ticket_comments", "author_role"),
        ("support_tickets", "reporter_role"),
        ("tasks", "assigned_role"),
        ("users", "role"),
    }
    assert set(migration.ROLE_COLUMNS) == expected

    with create_engine("sqlite://").begin() as connection:
        for table, column in migration.ROLE_COLUMNS:
            connection.execute(text(f'CREATE TABLE "{table}" (id INTEGER PRIMARY KEY, "{column}" TEXT)'))
            connection.execute(
                text(f'INSERT INTO "{table}" (id, "{column}") VALUES (1, :legacy), (2, :canonical)'),
                {"legacy": "head_nurse", "canonical": "supervisor"},
            )
        connection.execute(text("CREATE TABLE auth_sessions (id TEXT, user_id INTEGER, revoked_at TIMESTAMP)"))
        connection.execute(text("INSERT INTO auth_sessions VALUES ('legacy', 1, NULL), ('canonical', 2, NULL)"))
        monkeypatch.setattr(migration.op, "get_bind", lambda: connection)

        migration.upgrade()
        first_revoked_at = connection.scalar(
            text("SELECT revoked_at FROM auth_sessions WHERE id = 'legacy'")
        )
        migration.upgrade()

        for table, column in migration.ROLE_COLUMNS:
            assert connection.scalar(
                text(f'SELECT COUNT(*) FROM "{table}" WHERE "{column}" = :legacy'),
                {"legacy": "head_nurse"},
            ) == 0
            assert connection.scalar(
                text(f'SELECT COUNT(*) FROM "{table}" WHERE "{column}" = :canonical'),
                {"canonical": "supervisor"},
            ) == 2
        assert first_revoked_at is not None
        assert connection.scalar(
            text("SELECT revoked_at FROM auth_sessions WHERE id = 'legacy'")
        ) == first_revoked_at
        assert connection.scalar(
            text("SELECT revoked_at FROM auth_sessions WHERE id = 'canonical'")
        ) is None


def test_role_migration_refuses_lossy_downgrade() -> None:
    migration = load_migration()
    with pytest.raises(RuntimeError, match="cannot distinguish"):
        migration.downgrade()
