"""Unit tests for the Collin & Wade Barthel calculator."""

from __future__ import annotations

import unittest

from adl_index import classify_tier, score_index, score_timeline


ELEANOR_STAFF = {
    "bowels": 2,
    "bladder": 2,
    "grooming": 1,
    "toilet_use": 2,
    "feeding": 2,
    "transfers": 3,
    "mobility": 1,
    "dressing": 2,
    "stairs": 0,
    "bathing": 1,
}


class GoldStandardTests(unittest.TestCase):
    def test_eleanor_sums_to_16_tier_1(self) -> None:
        result = score_index(ELEANOR_STAFF, name="Eleanor Price", patient_id=69)
        self.assertEqual(result.total, 16)
        self.assertEqual(result.tier, 1)
        self.assertEqual(result.method, "staff")

    def test_tier_bands(self) -> None:
        self.assertEqual(classify_tier(20)[0], 1)
        self.assertEqual(classify_tier(12)[0], 1)
        self.assertEqual(classify_tier(11)[0], 2)
        self.assertEqual(classify_tier(5)[0], 2)
        self.assertEqual(classify_tier(4)[0], 3)
        self.assertEqual(classify_tier(0)[0], 3)

    def test_rejects_out_of_range(self) -> None:
        bad = dict(ELEANOR_STAFF, bathing=2)
        with self.assertRaises(ValueError):
            score_index(bad)

    def test_sam_total_dependence(self) -> None:
        sam = {
            "bowels": 0,
            "bladder": 0,
            "grooming": 0,
            "toilet_use": 0,
            "feeding": 1,
            "transfers": 0,
            "mobility": 0,
            "dressing": 0,
            "stairs": 0,
            "bathing": 0,
        }
        result = score_index(sam, name="Samuel Ortiz")
        self.assertEqual(result.total, 1)
        self.assertEqual(result.tier, 3)


class TimelineProxyTests(unittest.TestCase):
    def test_timeline_tiers_match_personas(self) -> None:
        results = {r.patient_id: r for r in score_timeline()}
        expected = {69: 1, 70: 1, 71: 2, 72: 2, 73: 3, 74: 3}
        self.assertEqual(set(results), set(expected))
        for pid, tier in expected.items():
            self.assertEqual(
                results[pid].tier,
                tier,
                f"patient {pid} {results[pid].name}: "
                f"proxy {results[pid].total} tier {results[pid].tier} != {tier}",
            )


if __name__ == "__main__":
    unittest.main()
