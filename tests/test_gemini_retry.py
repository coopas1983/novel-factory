import unittest
from unittest.mock import patch
import urllib.error, io
from factory.ai_writer import WriterConfig, generate

def err(code):
    return urllib.error.HTTPError("https://x",code,"x",{},io.BytesIO(b'{"error":"busy"}'))

class RetryTests(unittest.TestCase):
    @patch("factory.ai_writer.time.sleep")
    @patch("factory.ai_writer.gemini_available_models")
    @patch("factory.ai_writer._gemini_call")
    def test_503_retries_then_succeeds(self,call,models,sleep):
        models.return_value=["gemini-3.6-flash"]
        call.side_effect=[err(503),err(503),{"candidates":[{"content":{"parts":[{"text":"OK"}]}}]}]
        self.assertEqual(generate(WriterConfig("gemini","gemini-3.6-flash","k"),"p"),"OK")
        self.assertEqual(call.call_count,3)

    @patch("factory.ai_writer.time.sleep")
    @patch("factory.ai_writer.gemini_available_models")
    @patch("factory.ai_writer._gemini_call")
    def test_failover_to_second_model(self,call,models,sleep):
        models.return_value=["gemini-3.6-flash","gemini-3.7-flash"]
        call.side_effect=[err(503),err(503),err(503),
                          {"candidates":[{"content":{"parts":[{"text":"FALLBACK"}]}}]}]
        self.assertEqual(generate(WriterConfig("gemini","gemini-3.6-flash","k"),"p"),"FALLBACK")
