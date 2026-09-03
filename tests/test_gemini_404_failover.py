import unittest, urllib.error, io
from unittest.mock import patch
from factory.ai_writer import WriterConfig, generate

def err404():
    return urllib.error.HTTPError("https://x",404,"x",{},io.BytesIO(b'{"error":"retired"}'))

class RetiredModelTests(unittest.TestCase):
    @patch("factory.ai_writer.gemini_available_models")
    @patch("factory.ai_writer._gemini_call")
    def test_404_skips_to_next_model(self,call,models):
        models.return_value=["gemini-3.6-flash","gemini-3.7-flash"]
        call.side_effect=[err404(),{"candidates":[{"content":{"parts":[{"text":"OK NEXT"}]}}]}]
        self.assertEqual(generate(WriterConfig("gemini","gemini-3.6-flash","k"),"p"),"OK NEXT")

    @patch("factory.ai_writer.gemini_available_models")
    def test_25_is_not_selected_from_catalog_fallback(self,models):
        models.return_value=["gemini-2.5-flash","gemini-3.7-flash"]
        from factory.ai_writer import choose_gemini_model
        chosen,_=choose_gemini_model("k","gemini-3.6-flash")
        self.assertEqual(chosen,"gemini-3.7-flash")
