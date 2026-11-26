import unittest
from app.services.excerpts import matching_excerpt


class ExcerptTests(unittest.TestCase):
    def test_literal_match_only(self):
        self.assertEqual(matching_excerpt("A cedar by the river", ["CEDAR"]), "A cedar by the river")
        self.assertIsNone(matching_excerpt("A cedar by the river", ["forest"]))

    def test_excerpt_limits_context(self):
        excerpt = matching_excerpt("a" * 200 + " needle " + "z" * 200, ["needle"], radius=10)
        self.assertTrue(excerpt.startswith("…"))
        self.assertTrue(excerpt.endswith("…"))
        self.assertIn("needle", excerpt)
        self.assertLess(len(excerpt), 40)

    def test_excerpt_prefers_cluster_of_query_terms(self):
        content = "The garden has a gate. " + "Quiet space. " * 30 + "Compost smells sour when it is too wet."
        excerpt = matching_excerpt(content, ["the", "compost", "smells", "sour"], radius=30)
        self.assertIn("Compost smells sour", excerpt)
