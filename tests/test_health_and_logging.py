"""Health endpoint and request-logging tests for both web services."""

import logging
import unittest

from fastapi.testclient import TestClient

from calculate import app as calculator_app
from weather_app import app as weather_app


class HealthAndLoggingTests(unittest.TestCase):
    def test_calculator_health_and_request_log(self):
        with self.assertLogs("calculator.requests", level=logging.INFO) as logs:
            with TestClient(calculator_app) as client:
                response = client.get("/health?api_key=secret-value")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})
        message = logs.output[0]
        self.assertIn("method=GET", message)
        self.assertIn("path=/health", message)
        self.assertIn("status=200", message)
        self.assertIn("latency_ms=", message)
        self.assertNotIn("secret-value", message)

    def test_weather_health_and_request_log(self):
        with self.assertLogs("weather.requests", level=logging.INFO) as logs:
            with weather_app.test_client() as client:
                response = client.get("/health?api_key=secret-value")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"status": "ok"})
        message = logs.output[0]
        self.assertIn("method=GET", message)
        self.assertIn("path=/health", message)
        self.assertIn("status=200", message)
        self.assertIn("latency_ms=", message)
        self.assertNotIn("secret-value", message)


if __name__ == "__main__":
    unittest.main()
