"""add_routine_task_tables

Revision ID: aa1bb2cc3dd4
Revises: 1aac0f420dfc
Create Date: 2026-04-15 18:44:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'aa1bb2cc3dd4'
down_revision: Union[str, None] = '1aac0f420dfc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── routine_tasks ─────────────────────────────────────────────────────────
    op.create_table(
        'routine_tasks',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('workspace_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=256), nullable=False),
        sa.Column('label', sa.String(length=64), nullable=True, server_default=''),
        sa.Column('category', sa.String(length=64), nullable=True, server_default='general'),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('assigned_user_id', sa.Integer(), nullable=True),
        sa.Column('assigned_role', sa.String(length=32), nullable=True),
        sa.Column('created_by_user_id', sa.Integer(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['assigned_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['created_by_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_routine_tasks_workspace_user', 'routine_tasks', ['workspace_id', 'assigned_user_id'], unique=False)
    op.create_index(op.f('ix_routine_tasks_is_active'), 'routine_tasks', ['is_active'], unique=False)
    op.create_index(op.f('ix_routine_tasks_workspace_id'), 'routine_tasks', ['workspace_id'], unique=False)

    # ── routine_task_logs ─────────────────────────────────────────────────────
    op.create_table(
        'routine_task_logs',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('workspace_id', sa.Integer(), nullable=False),
        sa.Column('routine_task_id', sa.Integer(), nullable=False),
        sa.Column('assigned_user_id', sa.Integer(), nullable=True),
        sa.Column('shift_date', sa.Date(), nullable=False),
        sa.Column('status', sa.String(length=16), nullable=False, server_default='pending'),
        sa.Column('note', sa.Text(), nullable=True, server_default=''),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['assigned_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['routine_task_id'], ['routine_tasks.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_routine_logs_workspace_date', 'routine_task_logs', ['workspace_id', 'shift_date'], unique=False)
    op.create_index('ix_routine_logs_task_date', 'routine_task_logs', ['routine_task_id', 'shift_date'], unique=False)
    op.create_index(op.f('ix_routine_task_logs_assigned_user_id'), 'routine_task_logs', ['assigned_user_id'], unique=False)
    op.create_index(op.f('ix_routine_task_logs_shift_date'), 'routine_task_logs', ['shift_date'], unique=False)
    op.create_index(op.f('ix_routine_task_logs_status'), 'routine_task_logs', ['status'], unique=False)
    op.create_index(op.f('ix_routine_task_logs_workspace_id'), 'routine_task_logs', ['workspace_id'], unique=False)
    op.create_index(op.f('ix_routine_task_logs_routine_task_id'), 'routine_task_logs', ['routine_task_id'], unique=False)

    # ── patient_fix_routines ──────────────────────────────────────────────────
    op.create_table(
        'patient_fix_routines',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('workspace_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=256), nullable=False),
        sa.Column('description', sa.Text(), nullable=True, server_default=''),
        sa.Column(
            'patient_ids',
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'),
            nullable=False,
            server_default='[]',
        ),
        sa.Column(
            'target_roles',
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'),
            nullable=False,
            server_default='[]',
        ),
        sa.Column('schedule_type', sa.String(length=32), nullable=False, server_default='daily'),
        sa.Column('recurrence_rule', sa.String(length=256), nullable=True, server_default=''),
        sa.Column(
            'steps',
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'),
            nullable=False,
            server_default='[]',
        ),
        sa.Column('created_by_user_id', sa.Integer(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['created_by_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_patient_fix_routines_workspace', 'patient_fix_routines', ['workspace_id', 'is_active'], unique=False)
    op.create_index(op.f('ix_patient_fix_routines_workspace_id'), 'patient_fix_routines', ['workspace_id'], unique=False)
    op.create_index(op.f('ix_patient_fix_routines_is_active'), 'patient_fix_routines', ['is_active'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_patient_fix_routines_is_active'), table_name='patient_fix_routines')
    op.drop_index(op.f('ix_patient_fix_routines_workspace_id'), table_name='patient_fix_routines')
    op.drop_index('ix_patient_fix_routines_workspace', table_name='patient_fix_routines')
    op.drop_table('patient_fix_routines')

    op.drop_index(op.f('ix_routine_task_logs_routine_task_id'), table_name='routine_task_logs')
    op.drop_index(op.f('ix_routine_task_logs_workspace_id'), table_name='routine_task_logs')
    op.drop_index(op.f('ix_routine_task_logs_status'), table_name='routine_task_logs')
    op.drop_index(op.f('ix_routine_task_logs_shift_date'), table_name='routine_task_logs')
    op.drop_index(op.f('ix_routine_task_logs_assigned_user_id'), table_name='routine_task_logs')
    op.drop_index('ix_routine_logs_task_date', table_name='routine_task_logs')
    op.drop_index('ix_routine_logs_workspace_date', table_name='routine_task_logs')
    op.drop_table('routine_task_logs')

    op.drop_index(op.f('ix_routine_tasks_workspace_id'), table_name='routine_tasks')
    op.drop_index(op.f('ix_routine_tasks_is_active'), table_name='routine_tasks')
    op.drop_index('ix_routine_tasks_workspace_user', table_name='routine_tasks')
    op.drop_table('routine_tasks')
