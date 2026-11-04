import {useEffect, useRef, useState} from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

// Set VITE_API_BASE_URL in frontend/.env for production.
const API_BASE_URL = (
    import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api"
).replace(/\/+$/, "");
const API_URL = `${API_BASE_URL}/weather/`;

function getWeather(code) {
    if (code === 0) return ["Clear Sky", "☀️"];
    if ([1, 2].includes(code)) return ["Partly Cloudy", "🌤️"];
    if (code === 3) return ["Overcast", "☁️"];
    if ([45, 48].includes(code)) return ["Foggy", "🌫️"];
    if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code))
        return ["Rainy", "🌧️"];
    if ([71, 73, 75, 77, 85, 86].includes(code))
        return ["Snowy", "❄️"];
    if ([95, 96, 99].includes(code))
        return ["Thunderstorm", "⛈️"];

    return ["Cloudy", "🌥️"];
}

function getHeroTheme(code, isDay) {
    // Thunderstorms keep their storm styling even after sunset.
    if ([95, 96, 99].includes(code)) return "hero-thunderstorm";
    if (isDay === 0) return "hero-night";
    if (code === 0) return "hero-clear";
    if ([1, 2, 3].includes(code)) return "hero-cloudy";
    if ([45, 48].includes(code)) return "hero-fog";
    if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "hero-rain";
    if ([71, 73, 75, 77, 85, 86].includes(code)) return "hero-snow";
    return "hero-cloudy";
}

function getUVLevel(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
        return "Unavailable";
    }

    const uv = Number(value);
    if (uv <= 2) return "Low";
    if (uv <= 5) return "Moderate";
    if (uv <= 7) return "High";
    if (uv <= 10) return "Very High";
    return "Extreme";
}

function WeatherMap({ location, onLocationSelect }) {
    const mapElement = useRef(null);
    const mapInstance = useRef(null);
    const markerInstance = useRef(null);
    const onLocationSelectRef = useRef(onLocationSelect);

    useEffect(() => {
        onLocationSelectRef.current = onLocationSelect;
    }, [onLocationSelect]);

    useEffect(() => {
        if (!mapElement.current || mapInstance.current) return;

        const map = L.map(mapElement.current, {
            scrollWheelZoom: true,
        }).setView([20, 0], 2);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19,
        }).addTo(map);

        map.on("click", (event) => {
            const latitude = event.latlng.lat;
            const longitude = event.latlng.lng;

            // Move the pin immediately so the user gets instant feedback.
            const clickedPoint = [latitude, longitude];
            if (!markerInstance.current) {
                markerInstance.current = L.marker(clickedPoint).addTo(map);
            } else {
                markerInstance.current.setLatLng(clickedPoint);
            }

            markerInstance.current
                .bindPopup(
                    `<strong>Selected location</strong><br/>` +
                    `${latitude.toFixed(4)}, ${longitude.toFixed(4)}<br/>` +
                    `<span>Loading weather...</span>`
                )
                .openPopup();

            map.setView(clickedPoint, Math.max(map.getZoom(), 8), { animate: true });

            // A single click both places the pin and loads its weather.
            onLocationSelectRef.current({
                latitude,
                longitude,
                name: "Pinned map location",
                country: "",
            });
        });

        mapInstance.current = map;

        return () => {
            map.remove();
            mapInstance.current = null;
            markerInstance.current = null;
        };
    }, []);

    useEffect(() => {
        const map = mapInstance.current;
        const latitude = Number(location?.latitude);
        const longitude = Number(location?.longitude);

        if (!map || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

        const coordinates = [latitude, longitude];

        if (!markerInstance.current) {
            markerInstance.current = L.marker(coordinates).addTo(map);
        } else {
            markerInstance.current.setLatLng(coordinates);
        }

        markerInstance.current.bindPopup(
            `<strong>${String(location?.name || "Selected location").replace(/[<>&"]/g, "")}</strong>`
        );
        map.setView(coordinates, 7, { animate: true });
    }, [location?.latitude, location?.longitude, location?.name]);

    return (
        <div className="weather-map" ref={mapElement} aria-label="Interactive weather map" />
    );
}

function App() {
    const [search, setSearch] = useState("");
    const [weather, setWeather] = useState(null);
    const [selectedDate, setSelectedDate] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [localTime, setLocalTime] = useState("");
    const [suggestions, setSuggestions] = useState([]);
    const [suggestionLoading, setSuggestionLoading] = useState(false);
    const [locating, setLocating] = useState(false);
    const [favorites, setFavorites] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem("skycast-favorites") || "[]");
        } catch {
            return [];
        }
    });
    const [temperatureUnit, setTemperatureUnit] = useState(() => {
        return localStorage.getItem("skycast-temperature-unit") || "C";
    });
    const [activePage, setActivePage] = useState("weather");
    const [theme, setTheme] = useState(() => {
        return localStorage.getItem("skycast-theme") || "dark";
    });
    const [defaultLocation, setDefaultLocation] = useState(() => {
        return localStorage.getItem("skycast-default-location") || "Chennai";
    });
    const [defaultLocationInput, setDefaultLocationInput] = useState(() => {
        return localStorage.getItem("skycast-default-location") || "Chennai";
    });
    const [refreshInterval, setRefreshInterval] = useState(() => {
        return localStorage.getItem("skycast-refresh-interval") || "0";
    });
    const [settingsMessage, setSettingsMessage] = useState("");
    function convertTemperature(value) {
        if (value === null || value === undefined || Number.isNaN(Number(value))) {
            return "--";
        }

        const temperature = Number(value);
        return temperatureUnit === "F"
            ? Math.round((temperature * 9) / 5 + 32)
            : Math.round(temperature);
    }

    function changeTemperatureUnit(unit) {
        setTemperatureUnit(unit);
        localStorage.setItem("skycast-temperature-unit", unit);
    }

    function changeTheme(nextTheme) {
        setTheme(nextTheme);
        localStorage.setItem("skycast-theme", nextTheme);
    }

    function saveDefaultLocation(e) {
        e.preventDefault();
        const value = defaultLocationInput.trim();

        if (!value) {
            setSettingsMessage("Please enter a city name.");
            return;
        }

        setDefaultLocation(value);
        localStorage.setItem("skycast-default-location", value);
        setSettingsMessage(`Default location saved as ${value}.`);
    }

    function changeRefreshInterval(value) {
        setRefreshInterval(value);
        localStorage.setItem("skycast-refresh-interval", value);
    }

    function resetSettings() {
        setTemperatureUnit("C");
        setTheme("dark");
        setDefaultLocation("Chennai");
        setDefaultLocationInput("Chennai");
        setRefreshInterval("0");

        localStorage.setItem("skycast-temperature-unit", "C");
        localStorage.setItem("skycast-theme", "dark");
        localStorage.setItem("skycast-default-location", "Chennai");
        localStorage.setItem("skycast-refresh-interval", "0");

        setSettingsMessage("Your preferences have been restored to default.");
    }

    function toggleFavorite() {
        if (!weather?.location) return;

        const location = {
            name: weather.location.name,
            country: weather.location.country || "",
            latitude: weather.location.latitude,
            longitude: weather.location.longitude,
        };

        const exists = favorites.some(
            (item) =>
                Number(item.latitude) === Number(location.latitude) &&
                Number(item.longitude) === Number(location.longitude)
        );

        const updatedFavorites = exists
            ? favorites.filter(
                (item) =>
                    Number(item.latitude) !== Number(location.latitude) ||
                    Number(item.longitude) !== Number(location.longitude)
            )
            : [...favorites, location];

        setFavorites(updatedFavorites);
        localStorage.setItem("skycast-favorites", JSON.stringify(updatedFavorites));
    }

    function loadFavorite(location) {
        fetchWeather(location);
    }

    const currentIsFavorite = weather?.location
        ? favorites.some(
            (item) =>
                Number(item.latitude) === Number(weather.location.latitude) &&
                Number(item.longitude) === Number(weather.location.longitude)
        )
        : false;

    useEffect(() => {
        const timezone = weather?.location?.timezone;

        if (!timezone) return;

        const updateClock = () => {
            setLocalTime(
                new Date().toLocaleString("en-IN", {
                    timeZone: timezone,
                    dateStyle: "short",
                    timeStyle: "medium",
                })
            );
        };

        updateClock();

        const timer = setInterval(updateClock, 1000);

        return () => clearInterval(timer);
    }, [weather?.location?.timezone]);

    // Dynamic worldwide location suggestions
    useEffect(() => {
        const query = search.trim();

        if (query.length < 2) {
            setSuggestions([]);
            setSuggestionLoading(false);
            return;
        }

        const controller = new AbortController();
        const timer = setTimeout(async () => {
            try {
                setSuggestionLoading(true);
                const response = await fetch(
                    `${API_BASE_URL}/suggestions/?q=${encodeURIComponent(query)}`,
                    { signal: controller.signal }
                );
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || "Unable to load suggestions.");
                }

                setSuggestions(data.results || []);
            } catch (err) {
                if (err.name !== "AbortError") setSuggestions([]);
            } finally {
                if (!controller.signal.aborted) setSuggestionLoading(false);
            }
        }, 350);

        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [search]);

    // Fetch weather data from Django API
    async function fetchWeather(location) {
        const params = new URLSearchParams();

        if (typeof location === "string") {
            if (!location.trim()) return;
            params.set("city", location.trim());
        } else {
            params.set("latitude", location.latitude);
            params.set("longitude", location.longitude);
            params.set("name", location.name || "Selected location");
            params.set("country", location.country || "");
        }

        setLoading(true);
        setError("");
        setSuggestions([]);

        try {
            const response = await fetch(`${API_URL}?${params.toString()}`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Unable to fetch weather.");
            }

            setWeather(data);
            setSelectedDate(data.daily?.time?.[0] || "");
            setSearch("");
        } catch (err) {
            setError(err.message || "Something went wrong.");
        } finally {
            setLoading(false);
        }
    }

    // Automatically refresh the currently displayed location when enabled.
    useEffect(() => {
        const minutes = Number(refreshInterval);
        const location = weather?.location;

        if (!minutes || !location?.latitude || !location?.longitude) return;

        const timer = setInterval(() => {
            fetchWeather({
                latitude: location.latitude,
                longitude: location.longitude,
                name: location.name,
                country: location.country,
            });
        }, minutes * 60 * 1000);

        return () => clearInterval(timer);
    }, [
        refreshInterval,
        weather?.location?.latitude,
        weather?.location?.longitude,
        weather?.location?.name,
        weather?.location?.country,
    ]);

    // Resolve a clicked map pin to a readable place name before loading its weather.
    async function handleMapLocationSelect(pinnedLocation) {
        const { latitude, longitude } = pinnedLocation;
        let name = "Pinned location";
        let country = "";

        try {
            const response = await fetch(
                `https://photon.komoot.io/reverse?lat=${latitude}&lon=${longitude}`
            );

            if (response.ok) {
                const data = await response.json();
                const place = data.features?.[0]?.properties;

                if (place) {
                    name = place.city || place.name || place.district ||
                        place.county || place.state || name;
                    country = place.country || "";
                }
            }
        } catch {
            // The exact coordinates still allow the weather lookup to succeed.
        }

        await fetchWeather({ latitude, longitude, name, country });
    }

    // Detect the user's location using browser permission.
    function useMyLocation() {
        if (!navigator.geolocation) {
            setError("Geolocation is not supported by your browser.");
            return;
        }

        setLocating(true);
        setError("");
        setSuggestions([]);

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const latitude = position.coords.latitude;
                const longitude = position.coords.longitude;
                let name = "My Location";
                let country = "";

                // Reverse geocoding is used only to obtain a readable place name.
                try {
                    const response = await fetch(
                        `https://photon.komoot.io/reverse?lat=${latitude}&lon=${longitude}`
                    );

                    if (response.ok) {
                        const data = await response.json();
                        const place = data.features?.[0]?.properties;

                        if (place) {
                            name = place.name || place.city || place.district ||
                                place.state || name;
                            country = place.country || "";
                        }
                    }
                } catch {
                    // Weather lookup can still use the coordinates.
                }

                await fetchWeather({ latitude, longitude, name, country });
                setLocating(false);
            },
            (geoError) => {
                if (geoError.code === 1) {
                    setError("Location permission denied. Please allow location access.");
                } else if (geoError.code === 2) {
                    setError("Your location is currently unavailable.");
                } else if (geoError.code === 3) {
                    setError("Location request timed out. Please try again.");
                } else {
                    setError("Unable to detect your location.");
                }
                setLocating(false);
            },
            {
                enableHighAccuracy: false,
                timeout: 15000,
                maximumAge: 300000,
            }
        );
    }

    // Load default weather
    useEffect(() => {
        fetchWeather(defaultLocation);
    }, []);

    // Handle city search
    function handleSearch(e) {
        e.preventDefault();
        fetchWeather(search);
    }

    if (loading && !weather) {
        return (
            <div className="loading-screen">
                Loading weather... 🌦️
            </div>
        );
    }

    const current = weather?.current;
    const hourly = weather?.hourly;
    const daily = weather?.daily;
    const selectedDayIndex = daily?.time?.indexOf(selectedDate) ?? -1;
    const safeSelectedDayIndex = selectedDayIndex >= 0 ? selectedDayIndex : 0;
    const selectedDayHours = hourly?.time
        ? hourly.time.reduce((indices, time, index) => {
            if (time.slice(0, 10) === (daily?.time?.[safeSelectedDayIndex] || "")) {
                indices.push(index);
            }
            return indices;
        }, [])
        : [];
    const selectedDayCondition = daily
        ? getWeather(daily.weather_code[safeSelectedDayIndex])
        : ["Forecast", "🌤️"];

    const condition = getWeather(current?.weather_code);

    // Find the next available hourly forecast
    const startHour = hourly && current
        ? Math.max(
            0,
            hourly.time.findIndex(
                (time) => time >= current.time
            )
        )
        : 0;

    // Get the next eight hours
    const hourlyForecast = hourly
        ? hourly.time.slice(startHour, startHour + 8)
        : [];

    // UV index and visibility are supplied as hourly values by Open-Meteo.
    // Use the hourly entry matching the current local hour where available.
    const matchingHourIndex = hourly && current?.time
        ? hourly.time.findIndex((time) => time.slice(0, 13) === current.time.slice(0, 13))
        : -1;
    const currentHourIndex = matchingHourIndex >= 0 ? matchingHourIndex : startHour;

    const currentUV = hourly?.uv_index?.[currentHourIndex];
    const currentVisibility = hourly?.visibility?.[currentHourIndex];
    const hasCurrentUV = currentUV !== null && currentUV !== undefined &&
        Number.isFinite(Number(currentUV));
    const hasCurrentVisibility = currentVisibility !== null && currentVisibility !== undefined &&
        Number.isFinite(Number(currentVisibility));
    const uvLevel = getUVLevel(currentUV);
    const visibilityKm = hasCurrentVisibility
        ? (Number(currentVisibility) / 1000).toFixed(1)
        : "--";

    return (
        <div className={`app ${theme === "light" ? "light-theme" : ""}`}>

            {/* Sidebar */}
            <aside className="sidebar">

                <div className="brand">
                    <span className="brand-icon">☀</span>
                    <span>SkyCast</span>
                </div>

                <p className="nav-label">MENU</p>

                <button
                    type="button"
                    className={`nav-item ${activePage === "weather" ? "active" : ""}`}
                    onClick={() => setActivePage("weather")}
                >
                    🌤️ <span>Weather</span>
                </button>

                <button
                    type="button"
                    className={`nav-item ${activePage === "daily-forecast" ? "active" : ""}`}
                    onClick={() => setActivePage("daily-forecast")}
                    disabled={!weather?.daily}
                >
                    📅 <span>Daily Forecast</span>
                </button>

                <button
                    type="button"
                    className={`nav-item ${activePage === "locations" ? "active" : ""}`}
                    onClick={() => setActivePage("locations")}
                >
                    📍 <span>Locations</span>
                    <span className="nav-count">{favorites.length}</span>
                </button>

                <button
                    type="button"
                    className={`nav-item ${activePage === "settings" ? "active" : ""}`}
                    onClick={() => setActivePage("settings")}
                >
                    ⚙️ <span>Settings</span>
                </button>

                <div className="sidebar-bottom">

                    <div className="weather-tip">
                        <span>🌈</span>
                        <h4>Weather Tip</h4>
                        <p>
                            Stay updated with your local weather forecast.
                        </p>
                    </div>

                    <p className="sidebar-footer">
                        SkyCast Weather App
                    </p>

                </div>
            </aside>

            {/* Main Content */}
            <main className="main-content">

                {/* Header */}
                <header className="topbar">

                    <div>
                        <p className="eyebrow">
                            WEATHER DASHBOARD
                        </p>
                        <h2>Good day!</h2>
                    </div>

                    <div className="temperature-unit-switch" aria-label="Temperature unit">
                        <button
                            type="button"
                            className={temperatureUnit === "C" ? "unit-button active" : "unit-button"}
                            onClick={() => changeTemperatureUnit("C")}
                            aria-pressed={temperatureUnit === "C"}
                        >
                            °C
                        </button>
                        <button
                            type="button"
                            className={temperatureUnit === "F" ? "unit-button active" : "unit-button"}
                            onClick={() => changeTemperatureUnit("F")}
                            aria-pressed={temperatureUnit === "F"}
                        >
                            °F
                        </button>
                    </div>

                    <form
                        className="search-form"
                        onSubmit={handleSearch}
                    >
                        <span>🔍</span>

                        <div className="search-input-wrapper">
                            <input
                                type="text"
                                placeholder="Search city or area..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                autoComplete="off"
                            />

                            {search.trim().length >= 2 && (
                                <div className="suggestions-dropdown">
                                    {suggestionLoading && (
                                        <div className="suggestion-message">
                                            Searching locations...
                                        </div>
                                    )}

                                    {!suggestionLoading && suggestions.length === 0 && (
                                        <div className="suggestion-message">
                                            No matching locations found.
                                        </div>
                                    )}

                                    {!suggestionLoading && suggestions.map((place, index) => (
                                        <button
                                            type="button"
                                            className="suggestion-item"
                                            key={`${place.name}-${place.latitude}-${index}`}
                                            onClick={() => fetchWeather(place)}
                                        >
                                            <span className="suggestion-pin">📍</span>
                                            <span className="suggestion-text">
                                                <strong>{place.name}</strong>
                                                <small>{place.description || place.country}</small>
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <button
                            type="button"
                            className="location-button"
                            onClick={useMyLocation}
                            disabled={locating}
                        >
                            {locating ? "Locating..." : "📍 My Location"}
                        </button>

                        <button type="submit">
                            Search
                        </button>
                    </form>

                </header>

                {/* Error Message */}
                {error && (
                    <div className="error-message">
                        {error}
                    </div>
                )}

                {/* Loading Message */}
                {loading && weather && (
                    <p className="refresh-message">
                        Updating weather...
                    </p>
                )}

                {activePage === "locations" && (
                    <section className="page-section locations-page">
                        <div className="page-heading">
                            <div>
                                <p className="eyebrow">YOUR WEATHER PLACES</p>
                                <h1>Locations</h1>
                                <p className="page-description">
                                    Manage your favourite places and quickly check their weather.
                                </p>
                            </div>
                            <span className="locations-total">
                                {favorites.length} {favorites.length === 1 ? "location" : "locations"}
                            </span>
                        </div>

                        {favorites.length > 0 ? (
                            <div className="locations-grid">
                                {favorites.map((place) => (
                                    <article
                                        className="location-card"
                                        key={`${place.latitude}-${place.longitude}`}
                                    >
                                        <div className="location-card-top">
                                            <span className="location-card-icon">📍</span>
                                            <button
                                                type="button"
                                                className="remove-favorite"
                                                onClick={() => {
                                                    const updatedFavorites = favorites.filter(
                                                        (item) =>
                                                            Number(item.latitude) !== Number(place.latitude) ||
                                                            Number(item.longitude) !== Number(place.longitude)
                                                    );
                                                    setFavorites(updatedFavorites);
                                                    localStorage.setItem(
                                                        "skycast-favorites",
                                                        JSON.stringify(updatedFavorites)
                                                    );
                                                }}
                                                aria-label={`Remove ${place.name} from favourites`}
                                                title="Remove location"
                                            >
                                                ×
                                            </button>
                                        </div>
                                        <h2>{place.name}</h2>
                                        <p>{place.country || "Saved location"}</p>
                                        <div className="location-coordinates">
                                            {Number(place.latitude).toFixed(2)}, {Number(place.longitude).toFixed(2)}
                                        </div>
                                        <button
                                            type="button"
                                            className="view-location-button"
                                            onClick={() => {
                                                setActivePage("weather");
                                                fetchWeather(place);
                                            }}
                                        >
                                            View weather <span>→</span>
                                        </button>
                                    </article>
                                ))}
                            </div>
                        ) : (
                            <div className="empty-locations">
                                <span>☆</span>
                                <h2>No favourite locations yet</h2>
                                <p>
                                    Search for a city on the Weather page and add it to your favourites.
                                </p>
                                <button
                                    type="button"
                                    className="view-location-button"
                                    onClick={() => setActivePage("weather")}
                                >
                                    Go to Weather
                                </button>
                            </div>
                        )}
                    </section>
                )}

                {activePage === "settings" && (
                    <section className="page-section settings-page">
                        <div className="page-heading">
                            <div>
                                <p className="eyebrow">PERSONALIZE SKYCAST</p>
                                <h1>Settings</h1>
                                <p className="page-description">
                                    Customize how SkyCast looks and keeps you updated.
                                </p>
                            </div>
                        </div>

                        <div className="settings-list">
                            <div className="settings-card">
                                <div className="settings-card-copy">
                                    <span className="settings-icon">🌡️</span>
                                    <div>
                                        <h2>Temperature unit</h2>
                                        <p>Choose how temperatures appear across SkyCast.</p>
                                    </div>
                                </div>
                                <div className="temperature-unit-switch" aria-label="Temperature unit">
                                    <button
                                        type="button"
                                        className={temperatureUnit === "C" ? "unit-button active" : "unit-button"}
                                        onClick={() => changeTemperatureUnit("C")}
                                        aria-pressed={temperatureUnit === "C"}
                                    >
                                        °C
                                    </button>
                                    <button
                                        type="button"
                                        className={temperatureUnit === "F" ? "unit-button active" : "unit-button"}
                                        onClick={() => changeTemperatureUnit("F")}
                                        aria-pressed={temperatureUnit === "F"}
                                    >
                                        °F
                                    </button>
                                </div>
                            </div>

                            <div className="settings-card">
                                <div className="settings-card-copy">
                                    <span className="settings-icon">🎨</span>
                                    <div>
                                        <h2>Appearance</h2>
                                        <p>Choose your preferred dashboard theme.</p>
                                    </div>
                                </div>
                                <div className="theme-options" role="group" aria-label="Appearance theme">
                                    <button
                                        type="button"
                                        className={`theme-option ${theme === "dark" ? "selected" : ""}`}
                                        onClick={() => changeTheme("dark")}
                                        aria-pressed={theme === "dark"}
                                    >
                                        🌙 Dark
                                    </button>
                                    <button
                                        type="button"
                                        className={`theme-option ${theme === "light" ? "selected" : ""}`}
                                        onClick={() => changeTheme("light")}
                                        aria-pressed={theme === "light"}
                                    >
                                        ☀️ Light
                                    </button>
                                </div>
                            </div>

                            <form className="settings-card settings-location-form" onSubmit={saveDefaultLocation}>
                                <div className="settings-card-copy">
                                    <span className="settings-icon">📍</span>
                                    <div>
                                        <h2>Default location</h2>
                                        <p>SkyCast loads this city when you open the app.</p>
                                    </div>
                                </div>
                                <div className="settings-location-controls">
                                    <input
                                        type="text"
                                        value={defaultLocationInput}
                                        onChange={(e) => setDefaultLocationInput(e.target.value)}
                                        placeholder="Enter a city, e.g. Chennai"
                                        aria-label="Default city"
                                    />
                                    <button type="submit" className="settings-save-button">
                                        Save
                                    </button>
                                </div>
                                <p className="settings-current-value">
                                    Current default: <strong>{defaultLocation}</strong>
                                </p>
                            </form>

                            <div className="settings-card">
                                <div className="settings-card-copy">
                                    <span className="settings-icon">🔄</span>
                                    <div>
                                        <h2>Weather refresh</h2>
                                        <p>Automatically refresh the currently selected location.</p>
                                    </div>
                                </div>
                                <select
                                    className="settings-select"
                                    value={refreshInterval}
                                    onChange={(e) => changeRefreshInterval(e.target.value)}
                                    aria-label="Weather refresh interval"
                                >
                                    <option value="0">Off</option>
                                    <option value="5">Every 5 minutes</option>
                                    <option value="10">Every 10 minutes</option>
                                    <option value="30">Every 30 minutes</option>
                                </select>
                            </div>
                        </div>

                        {settingsMessage && (
                            <p className="settings-feedback" role="status">{settingsMessage}</p>
                        )}

                        <div className="settings-reset-area">
                            <div>
                                <h2>Reset preferences</h2>
                                <p>Restore the default SkyCast settings on this device.</p>
                            </div>
                            <button
                                type="button"
                                className="reset-settings-button"
                                onClick={resetSettings}
                            >
                                Reset to defaults
                            </button>
                        </div>

                        <p className="settings-note">
                            Your preferences are stored in this browser and remain saved after refreshing.
                        </p>
                    </section>
                )}

                {activePage === "daily-forecast" && weather && current && hourly && daily && (
                    <section className="page-section daily-forecast-page">
                        <div className="page-heading">
                            <div>
                                <p className="eyebrow">YOUR WEATHER OUTLOOK</p>
                                <h1>Daily Forecast</h1>
                                <p className="page-description">
                                    Detailed weather predictions for {weather.location.name}.
                                </p>
                            </div>
                            <button
                                type="button"
                                className="back-to-weather-button"
                                onClick={() => setActivePage("weather")}
                            >
                                ← Back to Weather
                            </button>
                        </div>

                        <div className="daily-forecast-picker">
                            {daily.time.map((date, index) => {
                                const [description, icon] = getWeather(daily.weather_code[index]);
                                return (
                                    <button
                                        type="button"
                                        key={date}
                                        className={`daily-forecast-tab ${selectedDate === date ? "active" : ""}`}
                                        onClick={() => setSelectedDate(date)}
                                    >
                                        <span>{index === 0 ? "Today" : new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" })}</span>
                                        <strong>{icon}</strong>
                                        <small>{convertTemperature(daily.temperature_2m_max[index])}° / {convertTemperature(daily.temperature_2m_min[index])}°</small>
                                    </button>
                                );
                            })}
                        </div>

                        <section className="section daily-detail-panel">
                            <div className="daily-detail-hero">
                                <div>
                                    <p className="eyebrow">SELECTED DAY</p>
                                    <h2>
                                        {new Date(`${daily.time[safeSelectedDayIndex]}T12:00:00`).toLocaleDateString("en-US", {
                                            weekday: "long", month: "long", day: "numeric"
                                        })}
                                    </h2>
                                    <p>{selectedDayCondition[0]}</p>
                                </div>
                                <span className="daily-detail-icon">{selectedDayCondition[1]}</span>
                            </div>

                            <div className="daily-detail-stats">
                                <Detail icon="🌡️" label="Highest temperature" value={`${convertTemperature(daily.temperature_2m_max[safeSelectedDayIndex])}°${temperatureUnit}`} />
                                <Detail icon="❄️" label="Lowest temperature" value={`${convertTemperature(daily.temperature_2m_min[safeSelectedDayIndex])}°${temperatureUnit}`} />
                                <Detail icon="🌅" label="Sunrise" value={daily.sunrise?.[safeSelectedDayIndex]?.slice(11, 16) || "--"} />
                                <Detail icon="🌇" label="Sunset" value={daily.sunset?.[safeSelectedDayIndex]?.slice(11, 16) || "--"} />
                            </div>
                        </section>

                        <section className="section">
                            <div className="section-heading">
                                <div>
                                    <p className="eyebrow">HOUR BY HOUR</p>
                                    <h2>Hourly forecast</h2>
                                </div>
                            </div>
                            <div className="hourly-grid daily-page-hourly">
                                {selectedDayHours.map((index) => {
                                    const [hourDescription, hourIcon] = getWeather(hourly.weather_code[index]);
                                    const uv = hourly.uv_index?.[index];
                                    const visibility = hourly.visibility?.[index];
                                    return (
                                        <div className="hour-card" key={hourly.time[index]}>
                                            <p>{hourly.time[index].slice(11, 16)}</p>
                                            <span className="forecast-icon">{hourIcon}</span>
                                            <h3>{convertTemperature(hourly.temperature_2m[index])}°</h3>
                                            <small>{hourDescription}</small>
                                            <small>💧 {hourly.precipitation_probability?.[index] ?? "--"}% rain</small>
                                            <small>☀️ UV {uv == null ? "--" : Number(uv).toFixed(1)}</small>
                                            <small>👁️ {visibility == null ? "--" : `${(Number(visibility) / 1000).toFixed(1)} km`}</small>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    </section>
                )}

                {activePage === "weather" && weather && current && hourly && daily && (
                    <>

                        {/* Current Weather */}
                        <section className={`hero-card ${getHeroTheme(current?.weather_code, current?.is_day)}`}>

                            <div className="hero-info">

                                <p className="eyebrow">
                                    CURRENT WEATHER
                                </p>

                                <h1>
                                    {weather.location.name}
                                </h1>

                                <p className="country">
                                    {weather.location.country}
                                </p>

                                <button
                                    type="button"
                                    className={`favorite-toggle ${currentIsFavorite ? "saved" : ""}`}
                                    onClick={toggleFavorite}
                                    aria-pressed={currentIsFavorite}
                                >
                                    {currentIsFavorite ? "★ Saved to favourites" : "☆ Add to favourites"}
                                </button>

                                <div className="temperature">
                                    {convertTemperature(current.temperature_2m)}
                                    <span>°{temperatureUnit}</span>
                                </div>

                                <h3>{condition[0]}</h3>

                                <p className="feels-like">
                                    Feels like{" "}
                                    {convertTemperature(current.apparent_temperature)}°{temperatureUnit}
                                </p>

                            </div>

                            <div className="hero-icon">
                                {condition[1]}
                            </div>

                            <div className="hero-date">
                                Local time: {localTime}
                            </div>

                        </section>

                        {/* Weather Highlights */}
                        <section className="section">

                            <div className="section-heading">
                                <div>
                                    <p className="eyebrow">
                                        WEATHER DETAILS
                                    </p>
                                    <h2>Today's Highlights</h2>
                                </div>
                            </div>

                            <div className="details-grid">

                                <Detail
                                    icon="💧"
                                    label="Humidity"
                                    value={`${current.relative_humidity_2m}%`}
                                />

                                <Detail
                                    icon="💨"
                                    label="Wind Speed"
                                    value={`${current.wind_speed_10m} km/h`}
                                />

                                <Detail
                                    icon="🌡️"
                                    label="Pressure"
                                    value={`${current.pressure_msl} hPa`}
                                />

                                <Detail
                                    icon="🌧️"
                                    label="Precipitation"
                                    value={`${current.precipitation} mm`}
                                />

                                <Detail
                                    icon="☀️"
                                    label="UV Index"
                                    value={hasCurrentUV
                                        ? `${Number(currentUV).toFixed(1)} · ${uvLevel}`
                                        : "--"}
                                />

                                <Detail
                                    icon="👁️"
                                    label="Visibility"
                                    value={visibilityKm === "--" ? "--" : `${visibilityKm} km`}
                                />

                            </div>
                            <p className="weather-data-note">
                                UV Index and visibility are based on the latest available hourly forecast.
                            </p>
                        </section>

                        {/* Hourly Forecast */}
                        <section className="section">

                            <div className="section-heading">
                                <div>
                                    <p className="eyebrow">
                                        NEXT HOURS
                                    </p>
                                    <h2>Hourly Forecast</h2>
                                </div>
                            </div>

                            <div className="hourly-grid">

                                {hourlyForecast.map((time) => {

                                    const index =
                                        hourly.time.indexOf(time);

                                    const [description, icon] =
                                        getWeather(
                                            hourly.weather_code[index]
                                        );

                                    return (
                                        <div
                                            className="hour-card"
                                            key={time}
                                        >

                                            <p>
                                                {time.slice(11, 16)}
                                            </p>

                                            <span className="forecast-icon">
                                                {icon}
                                            </span>

                                            <h3>
                                                {convertTemperature(
                                                    hourly.temperature_2m[index]
                                                )}°
                                            </h3>

                                            <small>
                                                {description}
                                            </small>

                                            <small>
                                                💧{" "}
                                                {hourly.precipitation_probability[index]}%
                                            </small>

                                        </div>
                                    );
                                })}

                            </div>
                        </section>

                        {/* Seven Day Forecast */}
                        <section className="section">

                            <div className="section-heading">
                                <div>
                                    <p className="eyebrow">
                                        UPCOMING DAYS
                                    </p>
                                    <h2>7-Day Forecast</h2>
                                </div>
                            </div>

                            <div className="daily-list">

                                {daily.time.map((date, index) => {

                                    const [description, icon] =
                                        getWeather(
                                            daily.weather_code[index]
                                        );

                                    return (
                                        <button
                                            type="button"
                                            className={`daily-row ${selectedDate === date ? "selected" : ""}`}
                                            key={date}
                                            onClick={() => {
                                                setSelectedDate(date);
                                                setActivePage("daily-forecast");
                                            }}
                                            aria-pressed={selectedDate === date}
                                        >

                                            <strong>
                                                {index === 0
                                                    ? "Today"
                                                    : new Date(
                                                        date + "T12:00:00"
                                                    ).toLocaleDateString(
                                                        "en-US",
                                                        {
                                                            weekday: "short"
                                                        }
                                                    )}
                                            </strong>

                                            <span className="daily-condition">
                                                {icon} {description}
                                            </span>

                                            <span className="daily-temp">

                                                {convertTemperature(
                                                    daily.temperature_2m_max[index]
                                                )}°

                                                <span>
                                                    / {convertTemperature(
                                                        daily.temperature_2m_min[index]
                                                    )}°
                                                </span>

                                            </span>

                                        </button>
                                    );
                                })}

                            </div>
                            <p className="forecast-selection-hint">
                                Select a day to view its predicted weather and hourly forecast.
                            </p>
                        </section>

                        {/* Interactive Weather Map */}
                        <section className="section map-section">
                            <div className="section-heading">
                                <div>
                                    <p className="eyebrow">EXPLORE THE WORLD</p>
                                    <h2>Weather Map</h2>
                                    <p className="page-description">
                                        Tap or click any point to drop a pin and instantly load its weather.
                                    </p>
                                </div>
                            </div>
                            <WeatherMap
                                location={weather.location}
                                onLocationSelect={handleMapLocationSelect}
                            />
                        </section>

                        {/* Sunrise and Sunset */}
                        <section className="sun-grid">

                            <div className="sun-card">

                                <span>🌅</span>

                                <div>
                                    <p>Sunrise</p>
                                    <h3>
                                        {daily.sunrise[0].slice(11, 16)}
                                    </h3>
                                </div>

                            </div>

                            <div className="sun-card">

                                <span>🌇</span>

                                <div>
                                    <p>Sunset</p>
                                    <h3>
                                        {daily.sunset[0].slice(11, 16)}
                                    </h3>
                                </div>

                            </div>

                        </section>

                    </>
                )}

                {/* Footer */}
                <footer>
                    SkyCast © 2026 · Weather data powered by Open-Meteo
                    <br />
                    Location search © OpenStreetMap contributors
                </footer>

            </main>
        </div>
    );
}

// Reusable Weather Detail Component
function Detail({icon, label, value}) {

    return (
        <div className="detail-card">

            <span>{icon}</span>

            <p>{label}</p>

            <h3>{value}</h3>

        </div>
    );
}

export default App;
