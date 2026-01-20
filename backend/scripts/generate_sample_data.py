#!/usr/bin/env python3
"""
Generate Sample Sensor Data

Creates realistic sensor data for testing the UPW predictive maintenance system.
"""
import os
import random
from datetime import datetime, timedelta
from neo4j import GraphDatabase
import numpy as np

# Configuration
NEO4J_URI = os.environ.get('NEO4J_URI', 'bolt://localhost:7687')
NEO4J_USER = os.environ.get('NEO4J_USER', 'neo4j')
NEO4J_PASSWORD = os.environ.get('NEO4J_PASSWORD', 'upw_password_2024')


# Sensor configurations with realistic patterns
SENSOR_CONFIGS = {
    'RO-001-PS-IN': {
        'base': 12.0, 'noise': 0.5, 'unit': 'bar',
        'daily_variation': 1.0, 'trend': 0.001  # Slight increase over time
    },
    'RO-001-PS-OUT': {
        'base': 8.0, 'noise': 0.3, 'unit': 'bar',
        'daily_variation': 0.5, 'trend': -0.001  # Slight decrease (membrane aging)
    },
    'RO-001-FS': {
        'base': 50.0, 'noise': 2.0, 'unit': 'm³/h',
        'daily_variation': 5.0, 'trend': -0.002  # Flow decreases as membrane fouls
    },
    'RO-001-CS': {
        'base': 3.0, 'noise': 0.5, 'unit': 'μS/cm',
        'daily_variation': 0.3, 'trend': 0.001  # Conductivity increases with membrane wear
    },
    'RO-001-TS': {
        'base': 25.0, 'noise': 1.0, 'unit': '°C',
        'daily_variation': 3.0, 'trend': 0
    },
    'RO-001-PM': {
        'base': 38.0, 'noise': 2.0, 'unit': 'kW',
        'daily_variation': 5.0, 'trend': 0.001
    },
    'EDI-001-CS-OUT': {
        'base': 0.5, 'noise': 0.1, 'unit': 'μS/cm',
        'daily_variation': 0.1, 'trend': 0.0005
    },
    'EDI-001-VS': {
        'base': 10.0, 'noise': 0.5, 'unit': 'V',
        'daily_variation': 1.0, 'trend': 0.001
    },
    'EDI-001-AS': {
        'base': 20.0, 'noise': 1.0, 'unit': 'A',
        'daily_variation': 2.0, 'trend': 0.0005
    },
    'EDI-001-PS': {
        'base': 0.35, 'noise': 0.05, 'unit': 'bar',
        'daily_variation': 0.05, 'trend': 0.0002
    },
    'EDI-001-PM': {
        'base': 18.0, 'noise': 1.0, 'unit': 'kW',
        'daily_variation': 2.0, 'trend': 0.0005
    },
    'UV-001-UIS': {
        'base': 85.0, 'noise': 2.0, 'unit': '%',
        'daily_variation': 1.0, 'trend': -0.005  # UV lamp degrades over time
    },
    'UV-001-FS': {
        'base': 40.0, 'noise': 2.0, 'unit': 'm³/h',
        'daily_variation': 5.0, 'trend': 0
    },
    'UV-001-TS': {
        'base': 32.0, 'noise': 2.0, 'unit': '°C',
        'daily_variation': 3.0, 'trend': 0
    },
    'UV-001-PM': {
        'base': 6.5, 'noise': 0.3, 'unit': 'kW',
        'daily_variation': 0.5, 'trend': 0.001
    },
    'PUMP-001-VBS': {
        'base': 2.5, 'noise': 0.3, 'unit': 'mm/s',
        'daily_variation': 0.3, 'trend': 0.001  # Vibration increases with bearing wear
    },
    'PUMP-001-TS': {
        'base': 35.0, 'noise': 2.0, 'unit': '°C',
        'daily_variation': 5.0, 'trend': 0.0005
    },
    'PUMP-001-AS': {
        'base': 16.0, 'noise': 1.0, 'unit': 'A',
        'daily_variation': 2.0, 'trend': 0.0003
    },
    'PUMP-001-PM': {
        'base': 12.0, 'noise': 0.5, 'unit': 'kW',
        'daily_variation': 1.5, 'trend': 0.0003
    },
    'TANK-001-LS': {
        'base': 65.0, 'noise': 5.0, 'unit': '%',
        'daily_variation': 15.0, 'trend': 0
    },
    'TANK-001-CS': {
        'base': 0.2, 'noise': 0.05, 'unit': 'μS/cm',
        'daily_variation': 0.05, 'trend': 0.0001
    },
    'TANK-001-TBS': {
        'base': 0.02, 'noise': 0.005, 'unit': 'NTU',
        'daily_variation': 0.005, 'trend': 0.00005
    },
}


def generate_sensor_value(config: dict, timestamp: datetime, day_offset: int) -> float:
    """Generate a realistic sensor value"""
    base = config['base']
    noise = config['noise']
    daily_var = config['daily_variation']
    trend = config['trend']

    # Time-of-day pattern (sinusoidal)
    hour = timestamp.hour + timestamp.minute / 60
    daily_factor = np.sin((hour - 6) * np.pi / 12)  # Peak around noon

    # Day-of-week pattern (lower on weekends)
    dow = timestamp.weekday()
    weekend_factor = 0.9 if dow >= 5 else 1.0

    # Calculate value
    value = (
        base +
        daily_var * daily_factor * weekend_factor +
        trend * day_offset * 96 +  # Trend accumulates over time
        random.gauss(0, noise)
    )

    return max(0, value)  # Ensure non-negative


def create_observations(driver, days: int = 10, interval_minutes: int = 15):
    """Create observations for all sensors"""
    print(f"Generating {days} days of sensor data...")

    end_time = datetime.utcnow()
    start_time = end_time - timedelta(days=days)
    intervals_per_day = 24 * 60 // interval_minutes

    total_observations = len(SENSOR_CONFIGS) * days * intervals_per_day
    print(f"Total observations to create: {total_observations}")

    with driver.session() as session:
        # First, get equipment-sensor mappings
        result = session.run("""
            MATCH (e:Resource)-[:upw__hasSensor]->(s:Resource)
            WHERE s.upw__sensorId IS NOT NULL
            RETURN e.upw__equipmentId AS equipmentId, s.upw__sensorId AS sensorId
        """)
        sensor_equipment_map = {r['sensorId']: r['equipmentId'] for r in result}

        batch_size = 500
        observations = []
        count = 0

        for sensor_id, config in SENSOR_CONFIGS.items():
            equipment_id = sensor_equipment_map.get(sensor_id)
            if not equipment_id:
                print(f"Warning: No equipment found for sensor {sensor_id}")
                continue

            current_time = start_time
            day_offset = 0

            while current_time <= end_time:
                value = generate_sensor_value(config, current_time, day_offset)
                obs_id = f"OBS-{sensor_id}-{current_time.strftime('%Y%m%d%H%M%S')}"

                observations.append({
                    'uri': f"http://example.org/upw#{obs_id}",
                    'sensorId': sensor_id,
                    'equipmentId': equipment_id,
                    'value': round(value, 3),
                    'unit': config['unit'],
                    'timestamp': current_time.isoformat()
                })

                if len(observations) >= batch_size:
                    _save_batch(session, observations)
                    count += len(observations)
                    print(f"  Saved {count} observations...")
                    observations = []

                current_time += timedelta(minutes=interval_minutes)
                if current_time.hour == 0 and current_time.minute == 0:
                    day_offset += 1

        # Save remaining
        if observations:
            _save_batch(session, observations)
            count += len(observations)

        print(f"Total observations created: {count}")


def _save_batch(session, observations):
    """Save a batch of observations to Neo4j"""
    session.run("""
        UNWIND $observations AS obs
        MATCH (s:Resource {upw__sensorId: obs.sensorId})
        MATCH (e:Resource {upw__equipmentId: obs.equipmentId})
        CREATE (o:Resource {
            uri: obs.uri,
            upw__hasResult: obs.value,
            upw__resultTime: obs.timestamp,
            upw__hasUnit: obs.unit
        })
        CREATE (s)-[:upw__hasObservation]->(o)
        CREATE (o)-[:upw__hasFeatureOfInterest]->(e)
        CREATE (o)-[:upw__madeBySensor]->(s)
    """, observations=observations)


def main():
    print("=" * 60)
    print("UPW - Generate Sample Sensor Data")
    print("=" * 60)

    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))

    try:
        create_observations(driver, days=10, interval_minutes=15)
        print("\nSample data generation complete!")
    except Exception as e:
        print(f"Error: {e}")
        return 1
    finally:
        driver.close()

    return 0


if __name__ == '__main__':
    exit(main())
