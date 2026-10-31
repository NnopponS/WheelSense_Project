"""Normalize MQTT-registered mobile devices to hardware_type mobile_phone.

Revision ID: e7f8a9b0c1d2
Revises: d6e7f8a9b0c1
Create Date: 2026-04-17

"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "e7f8a9b0c1d2"
down_revision: Union[str, None] = "d6e7f8a9b0c1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE devices
        SET hardware_type = 'mobile_phone'
        WHERE hardware_type = 'mobile_app'
        """
    )
    op.execute(
        """
        UPDATE devices
        SET device_type = 'mobile_phone'
        WHERE device_type = 'mobile_app'
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE devices
        SET hardware_type = 'mobile_app'
        WHERE hardware_type = 'mobile_phone'
          AND device_type = 'mobile_phone'
        """
    )
    op.execute(
        """
        UPDATE devices
        SET device_type = 'mobile_app'
        WHERE device_type = 'mobile_phone'
        """
    )
