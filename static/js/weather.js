class WeatherService {
    constructor() {
        this.apiKey = 'e9c9bbbf714c447e77c2f0026a199bb3'; // Get free API key from openweathermap.org
        this.defaultLocation = 'Swindon';
        this.updateInterval = 30 * 60 * 1000; // 30 minutes
    }

    init(location = this.defaultLocation) {
        this.currentLocation = "Swindon"
        this.updateWeather();
        
        // Update weather every 30 minutes
        setInterval(() => {
            this.updateWeather();
        }, this.updateInterval);
    }

    async updateWeather() {
        try {
            if (!this.apiKey || this.apiKey === 'key') {
                this.showMockWeather();
                return;
            }

            const response = await fetch(
                `https://api.weatherapi.com/v1/current.json?key=242c325b9df64e8d804165822251606&q=Swindon&aqi=no`
            );
            
            if (!response.ok) {
                throw new Error('Weather API request failed');
            }

            const data = await response.json();
            this.displayWeather(data);
            
        } catch (error) {
            console.error('Weather update failed:', error);
            this.showMockWeather();
        }
    }

    displayWeather(data) {
        const iconElement = document.getElementById('weather-icon');
        const tempElement = document.getElementById('temperature');
        const descElement = document.getElementById('weather-desc');
        const locationElement = document.getElementById('location');

        // Map some common weatherapi codes to emojis
        const weatherCodeToEmoji = {
            1000: '☀️', // Sunny/Clear
            1003: '⛅', // Partly cloudy
            1006: '☁️', // Cloudy
            1009: '☁️', // Overcast
            1030: '🌫️', // Mist
            1063: '🌦️', // Patchy rain possible
            1066: '🌨️', // Patchy snow possible
            1069: '🌧️', // Patchy sleet possible
            1072: '🌧️', // Patchy freezing drizzle possible
            1087: '⛈️', // Thundery outbreaks possible
            1114: '🌨️', // Blowing snow
            1117: '❄️', // Blizzard
            1135: '🌫️', // Fog
            1147: '🌫️', // Freezing fog
            1150: '🌦️', // Patchy light drizzle
            1153: '🌦️', // Light drizzle
            1180: '🌦️', // Patchy light rain
            1183: '🌧️', // Light rain
            1192: '🌧️', // Heavy rain
            1195: '🌧️', // Heavy rain
            1201: '🌨️', // Moderate or heavy freezing rain
            1210: '🌨️', // Patchy light snow
            1213: '🌨️', // Light snow
            1240: '🌦️', // Light rain shower
            1243: '🌧️', // Moderate or heavy rain shower
            1273: '⛈️', // Patchy light rain with thunder
            1276: '⛈️', // Moderate or heavy rain with thunder
            1282: '⛈️', // Moderate or heavy snow with thunder
        };

        const current = data.current;
        const location = data.location;

        const emoji = weatherCodeToEmoji[current.condition.code] || '🌤️';

        iconElement.textContent = emoji;
        tempElement.textContent = `${Math.round(current.temp_c)}°C`;
        descElement.textContent = current.condition.text;
        locationElement.textContent = location && location.name ? location.name : this.currentLocation;
    }

    showMockWeather() {
        // Show demo weather when API is not available
        const icons = ['☀️', '⛅', '☁️', '🌧️', '⛈️', '❄️'];
        const descriptions = ['Sunny', 'Partly Cloudy', 'Cloudy', 'Rainy', 'Stormy', 'Snowy'];
        
        const randomIndex = Math.floor(Math.random() * icons.length);
        const randomTemp = Math.floor(Math.random() * 30) + 55; // 5-35°C
        
        document.getElementById('weather-icon').textContent = icons[randomIndex];
        document.getElementById('temperature').textContent = `error ${randomTemp}°C`;
        document.getElementById('weather-desc').textContent = descriptions[randomIndex];
        document.getElementById('location').textContent = this.currentLocation;
    }

    updateLocation(newLocation) {
        this.currentLocation = newLocation;
        this.updateWeather();
    }
}

window.weatherService = new WeatherService();