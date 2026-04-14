"""Drop deprecated skin_temperature from vital_readings.

Revision ID: v6w7x8y9z0a1
Revises: u5v6w7x8y9z0
Create Date: 2026-04-13
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "v6w7x8y9z0a1"
down_revision: Union[str, None] = "u5v6w7x8y9z0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("vital_readings", "skin_temperature")


def downgrade() -> None:
    op.add_column(
        "vital_readings",
        sa.Column("skin_temperature", sa.Float(), nullable=True),
    )
