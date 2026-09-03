import unittest
from unittest.mock import patch
from factory.ai_writer import choose_gemini_model

class GeminiModelSelectionTests(unittest.TestCase):
    @patch("factory.ai_writer.gemini_available_models")
    def test_preferred_when_available(self,m):
        m.return_value=["gemini-3.6-flash","gemini-3.7-flash"]
        chosen,_=choose_gemini_model("x","gemini-3.6-flash")
        self.assertEqual(chosen,"gemini-3.6-flash")

    @patch("factory.ai_writer.gemini_available_models")
    def test_fallback_when_preferred_missing(self,m):
        m.return_value=["gemini-3.7-flash"]
        chosen,_=choose_gemini_model("x","gemini-2.5-flash")
        self.assertEqual(chosen,"gemini-3.7-flash")

    @patch("factory.ai_writer.gemini_available_models")
    def test_fail_closed_if_no_generation_model(self,m):
        m.return_value=[]
        with self.assertRaises(RuntimeError):
            choose_gemini_model("x","gemini-3.6-flash")
