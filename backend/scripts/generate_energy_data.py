"""
Generate 30 days of energy time-series data for 9 power meters and write to InfluxDB.

Equipment power profiles:
  RO-001-PM:   30-45 kW (high-pressure pump linked, daytime peak)
  RO-002-PM:   25-35 kW
  EDI-001-PM:  10-25 kW (stable)
  EDI-002-PM:  10-25 kW (stable)
  UV-001-PM:   6-8 kW   (very stable)
  UV-002-PM:   6-8 kW   (very stable)
  PUMP-001-PM: 10-15 kW
  PUMP-003-PM: 15-22 kW
  HP-001-PM:   40-55 kW (highest consumer)

Patterns:
  - Daytime (06:00-22:00) higher than nighttime
  - Weekend at 80% of weekday
  - Random noise for realism
  - 15-minute intervals → 96 points/day → 2,880 points/equipment over 30 days
"""
import sys
import os
import math
import random
from datetime import datetime, timedelta, timezone

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from influxdb_client import InfluxDBClient, Point, WritePrecision
from influxdb_client.client.write_api import SYNCHRONOUS

# InfluxDB connection
INFLUXDB_URL = os.environ.get('INFLUXDB_URL', 'http://localhost:8086')
INFLUXDB_TOKEN = os.environ.get('INFLUXDB_TOKEN', 'upw-influxdb-token-2024')
INFLUXDB_ORG = os.environ.get('INFLUXDB_ORG', 'upw')
INFLUXDB_BUCKET = os.environ.get('INFLUXDB_BUCKET', 'energy_metrics')

# Equipment power profiles: (base_min, base_max, daytime_boost, noise_factor)
EQUIPMENT_PROFILES = {
    "RO-001-PM": {"min": 30, "max": 45, "day_boost": 1.3, "noise": 0.08, "name": "RO Unit 1 Power"},
    "RO-002-PM": {"min": 25, "max": 35, "day_boost": 1.25, "noise": 0.07, "name": "RO Unit 2 Power"},
    "EDI-001-PM": {"min": 10, "max": 25, "day_boost": 1.15, "noise": 0.05, "name": "EDI Unit 1 Power"},
    "EDI-002-PM": {"min": 10, "max": 25, "day_boost": 1.15, "noise": 0.05, "name": "EDI Unit 2 Power"},
    "UV-001-PM": {"min": 6, "max": 8, "day_boost": 1.05, "noise": 0.03, "name": "UV Sterilizer 1 Power"},
    "UV-002-PM": {"min": 6, "max": 8, "day_boost": 1.05, "noise": 0.03, "name": "UV Sterilizer 2 Power"},
    "PUMP-001-PM": {"min": 10, "max": 15, "day_boost": 1.2, "noise": 0.06, "name": "Circulation Pump 1 Power"},
    "PUMP-003-PM": {"min": 15, "max": 22, "day_boost": 1.2, "noise": 0.06, "name": "Distribution Pump Power"},
    "HP-001-PM": {"min": 40, "max": 55, "day_boost": 1.35, "noise": 0.1, "name": "High Pressure Pump Power"},
}

DAYS = 30
INTERVAL_MINUTES = 15
INTERVALS_PER_DAY = 24 * 60 // INTERVAL_MINUTES  # 96


def generate_power_value(profile, hour, minute, day_of_week, day_index):
    """Generate a realistic power value based on time patterns."""
    base_min = profile["min"]
    base_max = profile["max"]
    day_boost = profile["day_boost"]
    noise = profile["noise"]

    # Base power (midpoint)
    base = (base_min + base_max) / 2
    amplitude = (base_max - base_min) / 2

    # Time-of-day pattern: sinusoidal with peak at 14:00
    hour_decimal = hour + minute / 60.0
    time_factor = math.sin(math.pi * (hour_decimal - 6) / 16)  # peaks around 14:00
    time_factor = max(0, time_factor)  # no negative

    # Daytime boost (06:00-22:00)
    if 6 <= hour < 22:
        power = base + amplitude * time_factor * day_boost
    else:
        # Nighttime: lower power
        power = base_min + amplitude * 0.2

    # Weekend reduction (Saturday=5, Sunday=6)
    if day_of_week >= 5:
        power *= 0.80

    # Slight daily variation (drift over 30 days)
    daily_drift = 1.0 + 0.03 * math.sin(2 * math.pi * day_index / 30)
    power *= daily_drift

    # Random noise
    power *= (1 + random.gauss(0, noise))

    # Clamp to min/max with some tolerance
    power = max(base_min * 0.85, min(base_max * 1.15, power))

    return round(power, 2)


def main():
    print(f"Connecting to InfluxDB at {INFLUXDB_URL}...")
    client = InfluxDBClient(url=INFLUXDB_URL, token=INFLUXDB_TOKEN, org=INFLUXDB_ORG)
    write_api = client.write_api(write_options=SYNCHRONOUS)

    # Health check
    health = client.health()
    print(f"InfluxDB status: {health.status}")

    now = datetime.now(timezone.utc)
    start_time = now - timedelta(days=DAYS)
    total_points = 0

    for eq_id, profile in EQUIPMENT_PROFILES.items():
        print(f"\nGenerating data for {eq_id} ({profile['name']})...")
        points = []

        for day in range(DAYS):
            current_day = start_time + timedelta(days=day)
            day_of_week = current_day.weekday()

            for interval in range(INTERVALS_PER_DAY):
                ts = current_day + timedelta(minutes=interval * INTERVAL_MINUTES)
                hour = ts.hour
                minute = ts.minute

                power = generate_power_value(profile, hour, minute, day_of_week, day)

                point = (
                    Point("energy_consumption")
                    .tag("equipment_id", eq_id)
                    .field("power_kw", power)
                    .time(ts, WritePrecision.S)
                )
                points.append(point)

            # Write in daily batches to avoid memory issues
            if len(points) >= INTERVALS_PER_DAY * 5:
                write_api.write(bucket=INFLUXDB_BUCKET, record=points)
                total_points += len(points)
                points = []

        # Write remaining points
        if points:
            write_api.write(bucket=INFLUXDB_BUCKET, record=points)
            total_points += len(points)

        print(f"  -> {DAYS * INTERVALS_PER_DAY} points written for {eq_id}")

    print(f"\n{'='*50}")
    print(f"Total data points written: {total_points}")
    print(f"Equipment count: {len(EQUIPMENT_PROFILES)}")
    print(f"Date range: {start_time.strftime('%Y-%m-%d')} to {now.strftime('%Y-%m-%d')}")
    print(f"Interval: {INTERVAL_MINUTES} minutes")
    print(f"Points per equipment: {DAYS * INTERVALS_PER_DAY}")
    print("Done!")

    client.close()


if __name__ == "__main__":
    main()
