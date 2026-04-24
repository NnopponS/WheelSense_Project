"""Tests for sim game seed data structure validation."""

from __future__ import annotations

import pytest

from app.sim.runtime.sim_game_seed import GAME_PATIENTS, GAME_NURSES, DASHBOARD_USERS, DEFAULT_PASSWORD


class TestSimGameSeedDataStructure:
    """Test sim game seed data structure constants."""

    def test_sim_game_seed_has_5_patients(self):
        """5 patients defined with English and Thai names."""
        assert len(GAME_PATIENTS) == 5
        
        # Verify names (include Thai in parentheses)
        first_names = [p.first_name for p in GAME_PATIENTS]
        assert any("Emika" in name for name in first_names)
        assert any("Somchai" in name for name in first_names)
        assert any("Rattana" in name for name in first_names)
        assert any("Krit" in name for name in first_names)
        assert any("Wichai" in name for name in first_names)

    def test_sim_game_seed_has_4_staff(self):
        """4 staff users defined with correct roles."""
        assert len(GAME_NURSES) == 4
        
        # Verify usernames
        usernames = [n.username for n in GAME_NURSES]
        assert "sarah.j" in usernames
        assert "michael.s" in usernames
        assert "jennifer.l" in usernames
        assert "david.k" in usernames
        
        # Verify roles
        roles = [n.role for n in GAME_NURSES]
        assert "head_nurse" in roles
        assert "supervisor" in roles
        assert "observer" in roles

    def test_sim_game_seed_has_admin_user(self):
        """Dashboard users: Admin 1, Head Nurse 1, Supervisor 1, Observer 2."""
        assert len(DASHBOARD_USERS) == 5
        
        # Verify roles
        roles = [role for _, role in DASHBOARD_USERS]
        assert roles.count("admin") == 1
        assert roles.count("head_nurse") == 1
        assert roles.count("supervisor") == 1
        assert roles.count("observer") == 2
        
        # Verify usernames
        usernames = [username for username, _ in DASHBOARD_USERS]
        assert "demo_admin" in usernames
        assert "demo_headnurse" in usernames
        assert "demo_supervisor" in usernames
        assert "demo_observer" in usernames
        assert "demo_observer2" in usernames

    def test_sim_game_seed_patient_username_format(self):
        """Patient names include Thai text in parentheses."""
        for patient in GAME_PATIENTS:
            # Names now include Thai text in parentheses like "Emika (เอมิกา)"
            # Just verify the data exists and is not empty
            assert patient.first_name
            assert patient.last_name
            # Extract English part (before parentheses)
            first_name_clean = patient.first_name.split(" (")[0]
            assert first_name_clean.isalpha()

    def test_sim_game_seed_staff_username_format(self):
        """Staff usernames follow firstname.lastname format."""
        for nurse in GAME_NURSES:
            # Verify format is firstname.lastname
            parts = nurse.username.split(".")
            assert len(parts) == 2
            assert parts[0].isalpha()
            assert parts[1].isalpha()
            assert len(parts[1]) >= 1  # Last name initial or full last name

    def test_sim_game_seed_default_password(self):
        """Default password is demo1234."""
        assert DEFAULT_PASSWORD == "demo1234"

    def test_sim_game_seed_patient_details_complete(self):
        """Each patient has complete details."""
        for patient in GAME_PATIENTS:
            assert patient.first_name
            assert patient.last_name
            assert patient.nickname
            assert patient.gender in ["male", "female"]
            assert patient.dob
            assert patient.care_level
            assert patient.mobility
            assert patient.game_room

    def test_sim_game_seed_staff_details_complete(self):
        """Each staff has complete details."""
        for nurse in GAME_NURSES:
            assert nurse.game_name
            assert nurse.username
            assert nurse.first_name
            assert nurse.last_name
            assert nurse.role in ["head_nurse", "supervisor", "observer"]
