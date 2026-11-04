
import requests

from django.http import JsonResponse
from django.views.decorators.http import require_GET


@require_GET
def search_locations(request):
    query = request.GET.get("q", "").strip()

    if len(query) < 2:
        return JsonResponse({"results": []})

    try:
        response = requests.get(
            "https://photon.komoot.io/api/",
            params={
                "q": query,
                "limit": 8,
                "lang": "en",
            },
            headers={"User-Agent": "SkyCastWeatherApp/1.0"},
            timeout=10,
        )
        response.raise_for_status()

        features = response.json().get("features", [])
        results = []

        for feature in features:
            properties = feature.get("properties", {})
            coordinates = feature.get("geometry", {}).get("coordinates", [])

            if len(coordinates) != 2 or not properties.get("name"):
                continue

            name = properties.get("name", "")
            city = properties.get("city", "")
            district = properties.get("district", "")
            state = properties.get("state", "")
            country = properties.get("country", "")

            # Build a readable location description.
            context = []
            for part in [city, district, state, country]:
                if part and part != name and part not in context:
                    context.append(part)

            results.append({
                "name": name,
                "description": ", ".join(context),
                "country": country,
                "latitude": coordinates[1],
                "longitude": coordinates[0],
                "type": properties.get("type", ""),
            })

        return JsonResponse({"results": results})

    except requests.RequestException:
        return JsonResponse(
            {"error": "Location suggestions are temporarily unavailable."},
            status=503,
        )


@require_GET
def get_weather(request):
    city = request.GET.get("city", "").strip()
    name = request.GET.get("name", "").strip()
    country = request.GET.get("country", "").strip()

    latitude = request.GET.get("latitude")
    longitude = request.GET.get("longitude")

    try:
        # Use the selected suggestion's exact coordinates when provided.
        if latitude is not None and longitude is not None:
            latitude = float(latitude)
            longitude = float(longitude)

            if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
                return JsonResponse(
                    {"error": "Invalid location coordinates."},
                    status=400,
                )

            location_name = name or city or "Selected location"
            location_country = country

        else:
            if not city:
                return JsonResponse(
                    {"error": "Please provide a city name."},
                    status=400,
                )

            # Find coordinates for a manually submitted city name.
            geo_response = requests.get(
                "https://geocoding-api.open-meteo.com/v1/search",
                params={
                    "name": city,
                    "count": 1,
                    "language": "en",
                    "format": "json",
                },
                timeout=10,
            )
            geo_response.raise_for_status()

            results = geo_response.json().get("results", [])

            if not results:
                return JsonResponse(
                    {"error": "City not found."},
                    status=404,
                )

            location = results[0]
            latitude = location["latitude"]
            longitude = location["longitude"]
            location_name = location["name"]
            location_country = location.get("country", "")

        # Fetch the weather forecast.
        weather_response = requests.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": latitude,
                "longitude": longitude,
                "current": (
                    "temperature_2m,"
                    "relative_humidity_2m,"
                    "apparent_temperature,"
                    "is_day,"
                    "precipitation,"
                    "weather_code,"
                    "wind_speed_10m,"
                    "pressure_msl"
                ),
                "hourly": (
                    "temperature_2m,"
                    "precipitation_probability,"
                    "weather_code,"
                    "uv_index,"
                    "visibility"
                ),
                "daily": (
                    "weather_code,"
                    "temperature_2m_max,"
                    "temperature_2m_min,"
                    "sunrise,"
                    "sunset"
                ),
                "timezone": "auto",
                "forecast_days": 7,
            },
            timeout=10,
        )
        weather_response.raise_for_status()

        weather_data = weather_response.json()

        return JsonResponse({
            "location": {
                "name": location_name,
                "country": location_country,
                "latitude": latitude,
                "longitude": longitude,
                "timezone": weather_data.get("timezone"),
            },
            "current": weather_data.get("current", {}),
            "hourly": weather_data.get("hourly", {}),
            "daily": weather_data.get("daily", {}),
        })

    except (requests.RequestException, ValueError):
        return JsonResponse(
            {"error": "Unable to retrieve weather data. Please try again."},
            status=503,
        )
