"""TDD tests for database separation between production and simulation modes.

User Journeys:
1. As a developer, I want production and simulation databases to have
different names and ports, so they never conflict when running simultaneously.

2. As an operator, I want to switch between modes using ENV_MODE environment
variable, so the backend connects to the correct database automatically.

3. As a DBA, I want clear database naming (wheelsense_prod vs wheelsense_sim),
so I can easily identify and manage each environment.
"""

from __future__ import annotations

import os
import pytest
from unittest.mock import patch


# ─────────────────────────────────────────────────────────────────────────────
# Unit Tests: Database Configuration
# ─────────────────────────────────────────────────────────────────────────────

class TestDatabaseSeparation:
    """Unit tests for database name and port separation."""

    def test_production_mode_uses_prod_database_name(self):
        """Production mode should use 'wheelsense_prod' database name."""
        with patch.dict(os.environ, {"ENV_MODE": "production"}, clear=False):
            from app.config import Settings
            
            settings = Settings()
            
            assert "wheelsense_prod" in settings.database_url
            assert "wheelsense_prod" in settings.database_url_sync

    def test_simulation_mode_uses_sim_database_name(self):
        """Simulation mode should use 'wheelsense_sim' database name."""
        with patch.dict(os.environ, {"ENV_MODE": "simulator"}, clear=False):
            from app.config import Settings
            
            settings = Settings()
            
            assert "wheelsense_sim" in settings.database_url
            assert "wheelsense_sim" in settings.database_url_sync

    def test_production_mode_uses_correct_port(self):
        """Production mode should use port 5433 (mapped to 5432 in container)."""
        with patch.dict(os.environ, {"ENV_MODE": "production"}, clear=False):
            from app.config import Settings
            
            settings = Settings()
            
            assert ":5433/" in settings.database_url or ":5433" in settings.database_url_sync

    def test_simulation_mode_uses_correct_port(self):
        """Simulation mode should use port 5432."""
        with patch.dict(os.environ, {"ENV_MODE": "simulator"}, clear=False):
            from app.config import Settings
            
            settings = Settings()
            
            assert ":5432/" in settings.database_url

    def test_different_modes_have_different_database_names(self):
        """Production and simulation should never use the same database name."""
        with patch.dict(os.environ, {"ENV_MODE": "production"}, clear=False):
            from app.config import Settings as ProdSettings
            prod_settings = ProdSettings()
            prod_db = prod_settings.database_url

        with patch.dict(os.environ, {"ENV_MODE": "simulator"}, clear=False):
            from app.config import Settings as SimSettings
            sim_settings = SimSettings()
            sim_db = sim_settings.database_url

        # Database names must be different
        assert prod_db != sim_db
        assert "prod" in prod_db.lower()
        assert "sim" in sim_db.lower()


class TestDockerComposeSeparation:
    """Integration tests for Docker Compose database configuration."""

    def test_prod_compose_uses_correct_database_name(self):
        """docker-compose.data-prod.yml should use 'wheelsense_prod' database."""
        import yaml
        
        compose_path = os.path.join(
            os.path.dirname(__file__), "..", "docker-compose.data-prod.yml"
        )
        
        with open(compose_path, "r") as f:
            compose = yaml.safe_load(f)
        
        # Find database service
        db_service = None
        for service_name, service_config in compose.get("services", {}).items():
            if "postgres" in service_name.lower() or "db" in service_name.lower():
                db_service = service_config
                break
        
        assert db_service is not None, "Database service not found"
        
        env = db_service.get("environment", {})
        assert env.get("POSTGRES_DB") == "wheelsense_prod", \
            f"Expected 'wheelsense_prod', got '{env.get('POSTGRES_DB')}'"

    def test_sim_compose_uses_correct_database_name(self):
        """docker-compose.data-sim.yml should use 'wheelsense_sim' database."""
        import yaml
        
        compose_path = os.path.join(
            os.path.dirname(__file__), "..", "docker-compose.data-sim.yml"
        )
        
        with open(compose_path, "r") as f:
            compose = yaml.safe_load(f)
        
        # Find database service
        db_service = None
        for service_name, service_config in compose.get("services", {}).items():
            if "postgres" in service_name.lower() or "db" in service_name.lower():
                db_service = service_config
                break
        
        assert db_service is not None, "Database service not found"
        
        env = db_service.get("environment", {})
        assert env.get("POSTGRES_DB") == "wheelsense_sim", \
            f"Expected 'wheelsense_sim', got '{env.get('POSTGRES_DB')}'"

    def test_prod_compose_uses_correct_port_mapping(self):
        """Production should map host port 5433 to container port 5432."""
        import yaml
        
        compose_path = os.path.join(
            os.path.dirname(__file__), "..", "docker-compose.data-prod.yml"
        )
        
        with open(compose_path, "r") as f:
            compose = yaml.safe_load(f)
        
        db_service = None
        for service_name, service_config in compose.get("services", {}).items():
            if "postgres" in service_name.lower() or "db" in service_name.lower():
                db_service = service_config
                break
        
        assert db_service is not None
        
        ports = db_service.get("ports", [])
        assert "5433:5432" in ports, f"Expected '5433:5432' in ports, got {ports}"

    def test_sim_compose_uses_correct_port_mapping(self):
        """Simulation should map host port 5432 to container port 5432."""
        import yaml
        
        compose_path = os.path.join(
            os.path.dirname(__file__), "..", "docker-compose.data-sim.yml"
        )
        
        with open(compose_path, "r") as f:
            compose = yaml.safe_load(f)
        
        db_service = None
        for service_name, service_config in compose.get("services", {}).items():
            if "postgres" in service_name.lower() or "db" in service_name.lower():
                db_service = service_config
                break
        
        assert db_service is not None
        
        ports = db_service.get("ports", [])
        assert "5432:5432" in ports, f"Expected '5432:5432' in ports, got {ports}"

    def test_compose_files_have_distinct_volume_names(self):
        """Volume names should be distinct to prevent data collision."""
        import yaml
        
        # Check production volumes
        prod_path = os.path.join(
            os.path.dirname(__file__), "..", "docker-compose.data-prod.yml"
        )
        with open(prod_path, "r") as f:
            prod_compose = yaml.safe_load(f)
        
        prod_volumes = set(prod_compose.get("volumes", {}).keys())
        
        # Check simulation volumes
        sim_path = os.path.join(
            os.path.dirname(__file__), "..", "docker-compose.data-sim.yml"
        )
        with open(sim_path, "r") as f:
            sim_compose = yaml.safe_load(f)
        
        sim_volumes = set(sim_compose.get("volumes", {}).keys())
        
        # Volumes should be completely separate (no overlap)
        assert len(prod_volumes & sim_volumes) == 0, \
            f"Volume names overlap: {prod_volumes & sim_volumes}"
        
        # Should have meaningful names
        assert any("prod" in v.lower() for v in prod_volumes), \
            f"No prod volume found in {prod_volumes}"
        assert any("sim" in v.lower() for v in sim_volumes), \
            f"No sim volume found in {sim_volumes}"


class TestEnvModeValidation:
    """Tests for ENV_MODE validation and behavior."""

    def test_sim_mode_variations_normalized(self):
        """Various sim variations should all be normalized to 'simulator'."""
        from app.config import Settings
        
        sim_variations = ["sim", "SIM", "simulator", "SIMULATOR", "dev", "demo"]
        
        for variation in sim_variations:
            with patch.dict(os.environ, {"ENV_MODE": variation}, clear=False):
                settings = Settings()
                assert settings.is_simulator_mode is True, \
                    f"Expected '{variation}' to be recognized as simulator mode"

    def test_prod_mode_variations_normalized(self):
        """Various prod variations should all be normalized to 'production'."""
        from app.config import Settings
        
        prod_variations = ["prod", "PROD", "production", "PRODUCTION", "live"]
        
        for variation in prod_variations:
            with patch.dict(os.environ, {"ENV_MODE": variation}, clear=False):
                settings = Settings()
                assert settings.is_simulator_mode is False, \
                    f"Expected '{variation}' to be recognized as production mode"


class TestDatabaseConnectionConsistency:
    """Integration tests for end-to-end database connection."""

    def test_database_url_matches_env_mode(self):
        """Database URL must match the configured ENV_MODE."""
        from app.config import Settings
        
        # Test production
        with patch.dict(os.environ, {"ENV_MODE": "production"}, clear=False):
            prod_settings = Settings()
            assert "prod" in prod_settings.database_url.lower()
            assert not prod_settings.is_simulator_mode
        
        # Test simulation
        with patch.dict(os.environ, {"ENV_MODE": "simulator"}, clear=False):
            sim_settings = Settings()
            assert "sim" in sim_settings.database_url.lower()
            assert sim_settings.is_simulator_mode

    def test_database_urls_are_different_between_modes(self):
        """Production and simulation URLs must be completely different."""
        from app.config import Settings
        
        with patch.dict(os.environ, {"ENV_MODE": "production"}, clear=False):
            prod_settings = Settings()
            prod_url = prod_settings.database_url
        
        with patch.dict(os.environ, {"ENV_MODE": "simulator"}, clear=False):
            sim_settings = Settings()
            sim_url = sim_settings.database_url
        
        # URLs should be different in at least database name or port
        assert prod_url != sim_url, \
            f"URLs should be different: prod='{prod_url}', sim='{sim_url}'"
