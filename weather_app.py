"""Flask app that lets a user enter a city and see the current weather.

Weather data comes from the OpenWeatherMap "Current Weather Data" API:
https://openweathermap.org/current

Set the OPENWEATHER_API_KEY environment variable with a valid API key
before running this app, e.g.:

    export OPENWEATHER_API_KEY="your-key-here"
    python weather_app.py
"""

import os
import logging
import time

import requests
from flask import Flask, g, jsonify, render_template, request

app = Flask(__name__)
logger = logging.getLogger("weather.requests")
logger.setLevel(logging.INFO)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logger.addHandler(handler)
logger.propagate = False

OPENWEATHER_API_KEY = os.environ.get("OPENWEATHER_API_KEY")
OPENWEATHER_URL = "https://api.openweathermap.org/data/2.5/weather"
ICON_URL_TEMPLATE = "https://openweathermap.org/img/wn/{icon}@2x.png"
REQUEST_TIMEOUT_SECONDS = 5


@app.before_request
def start_request_timer() -> None:
    g.request_started_at = time.perf_counter()


@app.after_request
def log_request(response):
    """Log request metadata without recording query strings, form data, or headers."""
    latency_ms = (time.perf_counter() - g.request_started_at) * 1000
    logger.info(
        "request method=%s path=%s status=%s latency_ms=%.2f",
        request.method,
        request.path,
        response.status_code,
        latency_ms,
    )
    return response


def fetch_weather(city: str) -> dict:
    """Fetch current weather for a city from OpenWeatherMap.

    Returns a dict with either the weather data (key "weather") or an
    error message (key "error") intended for display to the user.
    """
    if not OPENWEATHER_API_KEY:
        return {
            "error": (
                "The server is missing an OpenWeatherMap API key. "
                "Set the OPENWEATHER_API_KEY environment variable and restart the app."
            )
        }

    params = {
        "q": city,
        "appid": OPENWEATHER_API_KEY,
        "units": "metric",
    }

    try:
        response = requests.get(OPENWEATHER_URL, params=params, timeout=REQUEST_TIMEOUT_SECONDS)
    except requests.exceptions.Timeout:
        return {"error": "The weather service took too long to respond. Please try again."}
    except requests.exceptions.RequestException:
        return {"error": "Could not reach the weather service. Please check your connection and try again."}

    if response.status_code == 404:
        return {"error": f'City "{city}" was not found. Check the spelling and try again.'}
    if response.status_code == 401:
        return {"error": "The weather service rejected the API key. Check OPENWEATHER_API_KEY."}
    if response.status_code != 200:
        return {"error": "The weather service returned an unexpected error. Please try again later."}

    data = response.json()
    try:
        weather_info = data["weather"][0]
        icon_code = weather_info["icon"]
        weather = {
            "city": data["name"],
            "country": data.get("sys", {}).get("country", ""),
            "description": weather_info["description"].capitalize(),
            "icon_url": ICON_URL_TEMPLATE.format(icon=icon_code),
            "temperature": round(data["main"]["temp"]),
            "feels_like": round(data["main"]["feels_like"]),
            "humidity": data["main"]["humidity"],
            "wind_speed": data["wind"]["speed"],
        }
    except (KeyError, IndexError):
        return {"error": "Unexpected response from the weather service. Please try again."}

    return {"weather": weather}


@app.get("/health")
def health():
    return jsonify(status="ok")


@app.route("/", methods=["GET", "POST"])
def index():
    city = ""
    weather = None
    error = None

    if request.method == "POST":
        city = request.form.get("city", "").strip()
        if not city:
            error = "Please enter a city name."
        else:
            result = fetch_weather(city)
            weather = result.get("weather")
            error = result.get("error")

    return render_template("weather.html", city=city, weather=weather, error=error)


if __name__ == "__main__":
    app.run(debug=True)
