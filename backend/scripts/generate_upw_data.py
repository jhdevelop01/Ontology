#!/usr/bin/env python3
"""
UPW (Ultrapure Water) Process Data Generator

Generates comprehensive graph data for:
- Equipment hierarchy (RO, EDI, UV, Pumps, Tanks, Filters)
- Sensors with specifications
- Sensor observations (time series data)
- Maintenance records
- Anomaly detections
- Process areas and connections
"""
import os
import random
from datetime import datetime, timedelta
from neo4j import GraphDatabase

# Configuration
NEO4J_URI = os.environ.get('NEO4J_URI', 'bolt://localhost:7688')
NEO4J_USER = os.environ.get('NEO4J_USER', 'neo4j')
NEO4J_PASSWORD = os.environ.get('NEO4J_PASSWORD', 'upw_password_2024')


def create_driver():
    return GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))


def clear_database(session):
    """Clear all existing data"""
    print("Clearing existing data...")
    session.run("MATCH (n) DETACH DELETE n")
    print("Database cleared.")


def create_constraints(session):
    """Create necessary constraints and indexes"""
    print("Creating constraints...")
    constraints = [
        "CREATE CONSTRAINT equipment_id IF NOT EXISTS FOR (e:Equipment) REQUIRE e.equipmentId IS UNIQUE",
        "CREATE CONSTRAINT sensor_id IF NOT EXISTS FOR (s:Sensor) REQUIRE s.sensorId IS UNIQUE",
        "CREATE CONSTRAINT area_id IF NOT EXISTS FOR (a:ProcessArea) REQUIRE a.areaId IS UNIQUE",
    ]
    for constraint in constraints:
        try:
            session.run(constraint)
        except Exception as e:
            print(f"  Constraint may exist: {e}")
    print("Constraints created.")


def create_process_areas(session):
    """Create UPW process areas"""
    print("Creating process areas...")
    areas = [
        {"areaId": "AREA-PRE", "name": "전처리 구역", "nameEn": "Pretreatment Area", "description": "원수를 1차 정제하는 구역"},
        {"areaId": "AREA-RO", "name": "역삼투 구역", "nameEn": "RO Area", "description": "역삼투막을 통한 이온 제거 구역"},
        {"areaId": "AREA-EDI", "name": "EDI 구역", "nameEn": "EDI Area", "description": "전기탈이온 처리 구역"},
        {"areaId": "AREA-POLISH", "name": "연마 구역", "nameEn": "Polishing Area", "description": "최종 정제 및 살균 구역"},
        {"areaId": "AREA-STORAGE", "name": "저장/배관 구역", "nameEn": "Storage & Distribution", "description": "초순수 저장 및 공급 구역"},
    ]

    for area in areas:
        session.run("""
            CREATE (a:ProcessArea {
                areaId: $areaId,
                name: $name,
                nameEn: $nameEn,
                description: $description
            })
        """, area)

    # Create area connections (process flow)
    connections = [
        ("AREA-PRE", "AREA-RO", "FEEDS_INTO"),
        ("AREA-RO", "AREA-EDI", "FEEDS_INTO"),
        ("AREA-EDI", "AREA-POLISH", "FEEDS_INTO"),
        ("AREA-POLISH", "AREA-STORAGE", "FEEDS_INTO"),
        ("AREA-STORAGE", "AREA-POLISH", "RECIRCULATES_TO"),
    ]

    for source, target, rel_type in connections:
        session.run(f"""
            MATCH (a:ProcessArea {{areaId: $source}})
            MATCH (b:ProcessArea {{areaId: $target}})
            CREATE (a)-[:{rel_type}]->(b)
        """, {"source": source, "target": target})

    print(f"  Created {len(areas)} process areas")


def create_equipment(session):
    """Create UPW equipment with detailed specifications"""
    print("Creating equipment...")

    equipment_list = [
        # Pretreatment Equipment
        {
            "equipmentId": "MMF-001", "name": "다층여과기 A", "nameEn": "Multi-Media Filter A",
            "type": "MultiMediaFilter", "category": "Pretreatment",
            "manufacturer": "Pall Corporation", "model": "Aria AP-4",
            "installDate": "2022-01-15", "ratedPower": 5.5,
            "operatingHours": 18500, "healthScore": 88.5,
            "status": "Running", "area": "AREA-PRE",
            "specs": {"flowRate": 100, "filterMedia": "Sand/Anthracite/Garnet", "vesselDiameter": 1.2}
        },
        {
            "equipmentId": "ACF-001", "name": "활성탄 필터 A", "nameEn": "Activated Carbon Filter A",
            "type": "ActivatedCarbonFilter", "category": "Pretreatment",
            "manufacturer": "Calgon Carbon", "model": "Filtrasorb 400",
            "installDate": "2022-01-15", "ratedPower": 3.0,
            "operatingHours": 18500, "healthScore": 82.3,
            "status": "Running", "area": "AREA-PRE",
            "specs": {"flowRate": 100, "carbonType": "Granular Activated Carbon", "bedDepth": 1.5}
        },
        {
            "equipmentId": "SF-001", "name": "보안필터", "nameEn": "Security Filter",
            "type": "CartridgeFilter", "category": "Pretreatment",
            "manufacturer": "3M", "model": "Betapure NT-T",
            "installDate": "2022-02-01", "ratedPower": 0.5,
            "operatingHours": 18200, "healthScore": 95.0,
            "status": "Running", "area": "AREA-PRE",
            "specs": {"flowRate": 120, "poreSize": 5, "filterCount": 20}
        },

        # RO Equipment
        {
            "equipmentId": "RO-001", "name": "1차 RO 유닛", "nameEn": "Primary RO Unit",
            "type": "ReverseOsmosis", "category": "Treatment",
            "manufacturer": "Dow Chemical", "model": "FILMTEC BW30-400",
            "installDate": "2022-03-15", "ratedPower": 45.0,
            "operatingHours": 15000, "healthScore": 85.5,
            "status": "Running", "area": "AREA-RO",
            "specs": {"membraneCount": 36, "recovery": 75, "rejection": 99.5, "designFlux": 25}
        },
        {
            "equipmentId": "RO-002", "name": "2차 RO 유닛", "nameEn": "Secondary RO Unit",
            "type": "ReverseOsmosis", "category": "Treatment",
            "manufacturer": "Dow Chemical", "model": "FILMTEC XLE-440",
            "installDate": "2022-03-20", "ratedPower": 35.0,
            "operatingHours": 14800, "healthScore": 91.2,
            "status": "Running", "area": "AREA-RO",
            "specs": {"membraneCount": 24, "recovery": 85, "rejection": 99.7, "designFlux": 30}
        },
        {
            "equipmentId": "HP-001", "name": "RO 고압펌프", "nameEn": "RO High Pressure Pump",
            "type": "HighPressurePump", "category": "Treatment",
            "manufacturer": "Grundfos", "model": "CRN 90-4-2",
            "installDate": "2022-03-10", "ratedPower": 55.0,
            "operatingHours": 15200, "healthScore": 87.8,
            "status": "Running", "area": "AREA-RO",
            "specs": {"flowRate": 150, "head": 180, "efficiency": 78}
        },

        # EDI Equipment
        {
            "equipmentId": "EDI-001", "name": "EDI 모듈 A", "nameEn": "EDI Module A",
            "type": "Electrodeionization", "category": "Treatment",
            "manufacturer": "IONPURE", "model": "CEDI-LX",
            "installDate": "2022-04-01", "ratedPower": 25.0,
            "operatingHours": 14500, "healthScore": 78.2,
            "status": "Running", "area": "AREA-EDI",
            "specs": {"stackCount": 8, "cellPairs": 200, "productResistivity": 18.2}
        },
        {
            "equipmentId": "EDI-002", "name": "EDI 모듈 B", "nameEn": "EDI Module B",
            "type": "Electrodeionization", "category": "Treatment",
            "manufacturer": "IONPURE", "model": "CEDI-LX",
            "installDate": "2022-04-01", "ratedPower": 25.0,
            "operatingHours": 14500, "healthScore": 82.5,
            "status": "Running", "area": "AREA-EDI",
            "specs": {"stackCount": 8, "cellPairs": 200, "productResistivity": 18.2}
        },

        # Polishing Equipment
        {
            "equipmentId": "UV-001", "name": "UV 살균기 A", "nameEn": "UV Sterilizer A",
            "type": "UVSterilizer", "category": "Polishing",
            "manufacturer": "Trojan Technologies", "model": "TrojanUVSwift",
            "installDate": "2022-05-01", "ratedPower": 8.0,
            "operatingHours": 13800, "healthScore": 72.5,
            "status": "Warning", "area": "AREA-POLISH",
            "specs": {"lampCount": 4, "uvDose": 40, "wavelength": 254}
        },
        {
            "equipmentId": "UV-002", "name": "UV 살균기 B", "nameEn": "UV Sterilizer B",
            "type": "UVSterilizer", "category": "Polishing",
            "manufacturer": "Trojan Technologies", "model": "TrojanUVSwift",
            "installDate": "2022-05-01", "ratedPower": 8.0,
            "operatingHours": 13800, "healthScore": 94.0,
            "status": "Running", "area": "AREA-POLISH",
            "specs": {"lampCount": 4, "uvDose": 40, "wavelength": 254}
        },
        {
            "equipmentId": "MBP-001", "name": "혼상수지탑", "nameEn": "Mixed Bed Polisher",
            "type": "MixedBedPolisher", "category": "Polishing",
            "manufacturer": "Purolite", "model": "MB-400",
            "installDate": "2022-05-15", "ratedPower": 2.0,
            "operatingHours": 13500, "healthScore": 89.0,
            "status": "Running", "area": "AREA-POLISH",
            "specs": {"resinVolume": 500, "resinType": "Mixed Cation/Anion", "regenerationCycle": 720}
        },
        {
            "equipmentId": "UF-001", "name": "한외여과기", "nameEn": "Ultrafiltration Unit",
            "type": "Ultrafiltration", "category": "Polishing",
            "manufacturer": "Koch Membrane", "model": "HF-S Series",
            "installDate": "2022-06-01", "ratedPower": 12.0,
            "operatingHours": 13000, "healthScore": 91.5,
            "status": "Running", "area": "AREA-POLISH",
            "specs": {"membraneArea": 100, "poreSize": 0.02, "moduleCount": 12}
        },

        # Storage & Distribution
        {
            "equipmentId": "TANK-001", "name": "초순수 저장탱크 A", "nameEn": "UPW Storage Tank A",
            "type": "StorageTank", "category": "Storage",
            "manufacturer": "Entegris", "model": "PTFE-Lined",
            "installDate": "2022-02-01", "ratedPower": 0,
            "operatingHours": 18500, "healthScore": 96.0,
            "status": "Running", "area": "AREA-STORAGE",
            "specs": {"capacity": 10000, "material": "SS316L/PTFE", "blanketing": "Nitrogen"}
        },
        {
            "equipmentId": "TANK-002", "name": "초순수 저장탱크 B", "nameEn": "UPW Storage Tank B",
            "type": "StorageTank", "category": "Storage",
            "manufacturer": "Entegris", "model": "PTFE-Lined",
            "installDate": "2022-02-01", "ratedPower": 0,
            "operatingHours": 18500, "healthScore": 97.5,
            "status": "Running", "area": "AREA-STORAGE",
            "specs": {"capacity": 10000, "material": "SS316L/PTFE", "blanketing": "Nitrogen"}
        },
        {
            "equipmentId": "PUMP-001", "name": "순환펌프 A", "nameEn": "Circulation Pump A",
            "type": "CirculationPump", "category": "Distribution",
            "manufacturer": "Grundfos", "model": "CRN 45-3",
            "installDate": "2022-03-10", "ratedPower": 15.0,
            "operatingHours": 16000, "healthScore": 92.3,
            "status": "Running", "area": "AREA-STORAGE",
            "specs": {"flowRate": 200, "head": 45, "efficiency": 82}
        },
        {
            "equipmentId": "PUMP-002", "name": "순환펌프 B", "nameEn": "Circulation Pump B",
            "type": "CirculationPump", "category": "Distribution",
            "manufacturer": "Grundfos", "model": "CRN 45-3",
            "installDate": "2022-03-10", "ratedPower": 15.0,
            "operatingHours": 8000, "healthScore": 98.0,
            "status": "Standby", "area": "AREA-STORAGE",
            "specs": {"flowRate": 200, "head": 45, "efficiency": 82}
        },
        {
            "equipmentId": "PUMP-003", "name": "공급펌프", "nameEn": "Distribution Pump",
            "type": "DistributionPump", "category": "Distribution",
            "manufacturer": "Iwaki", "model": "MD-100",
            "installDate": "2022-04-01", "ratedPower": 22.0,
            "operatingHours": 14000, "healthScore": 88.0,
            "status": "Running", "area": "AREA-STORAGE",
            "specs": {"flowRate": 300, "head": 60, "efficiency": 75}
        },
    ]

    for eq in equipment_list:
        specs = eq.pop('specs')
        area = eq.pop('area')

        session.run("""
            MATCH (a:ProcessArea {areaId: $area})
            CREATE (e:Equipment $props)
            CREATE (e)-[:LOCATED_IN]->(a)
            SET e.specs = $specs
        """, {"props": eq, "area": area, "specs": str(specs)})

    # Create equipment connections (process flow)
    connections = [
        ("MMF-001", "ACF-001", "FEEDS"),
        ("ACF-001", "SF-001", "FEEDS"),
        ("SF-001", "HP-001", "FEEDS"),
        ("HP-001", "RO-001", "FEEDS"),
        ("RO-001", "RO-002", "FEEDS"),
        ("RO-002", "EDI-001", "FEEDS"),
        ("RO-002", "EDI-002", "FEEDS"),
        ("EDI-001", "UV-001", "FEEDS"),
        ("EDI-002", "UV-002", "FEEDS"),
        ("UV-001", "MBP-001", "FEEDS"),
        ("UV-002", "MBP-001", "FEEDS"),
        ("MBP-001", "UF-001", "FEEDS"),
        ("UF-001", "TANK-001", "FEEDS"),
        ("UF-001", "TANK-002", "FEEDS"),
        ("TANK-001", "PUMP-001", "FEEDS"),
        ("TANK-002", "PUMP-002", "FEEDS"),
        ("PUMP-001", "PUMP-003", "FEEDS"),
        ("PUMP-002", "PUMP-003", "FEEDS"),
    ]

    for source, target, rel_type in connections:
        session.run(f"""
            MATCH (a:Equipment {{equipmentId: $source}})
            MATCH (b:Equipment {{equipmentId: $target}})
            CREATE (a)-[:{rel_type}]->(b)
        """, {"source": source, "target": target})

    print(f"  Created {len(equipment_list)} equipment items")


def create_sensors(session):
    """Create sensors with detailed specifications"""
    print("Creating sensors...")

    sensor_definitions = [
        # RO-001 Sensors
        {"sensorId": "RO-001-PS-IN", "name": "RO1 입구압력", "type": "PressureSensor", "unit": "bar",
         "equipmentId": "RO-001", "min": 0, "max": 25, "normalMin": 10, "normalMax": 16, "warning": 18, "critical": 20},
        {"sensorId": "RO-001-PS-OUT", "name": "RO1 출구압력", "type": "PressureSensor", "unit": "bar",
         "equipmentId": "RO-001", "min": 0, "max": 20, "normalMin": 6, "normalMax": 12, "warning": 5, "critical": 3},
        {"sensorId": "RO-001-FS", "name": "RO1 투과수유량", "type": "FlowSensor", "unit": "m³/h",
         "equipmentId": "RO-001", "min": 0, "max": 120, "normalMin": 60, "normalMax": 90, "warning": 50, "critical": 40},
        {"sensorId": "RO-001-CS-IN", "name": "RO1 입수전도도", "type": "ConductivitySensor", "unit": "μS/cm",
         "equipmentId": "RO-001", "min": 0, "max": 500, "normalMin": 100, "normalMax": 300, "warning": 350, "critical": 400},
        {"sensorId": "RO-001-CS-OUT", "name": "RO1 투과수전도도", "type": "ConductivitySensor", "unit": "μS/cm",
         "equipmentId": "RO-001", "min": 0, "max": 20, "normalMin": 1, "normalMax": 8, "warning": 12, "critical": 15},
        {"sensorId": "RO-001-TS", "name": "RO1 수온", "type": "TemperatureSensor", "unit": "°C",
         "equipmentId": "RO-001", "min": 0, "max": 50, "normalMin": 20, "normalMax": 28, "warning": 32, "critical": 38},
        {"sensorId": "RO-001-PM", "name": "RO1 전력", "type": "PowerMeter", "unit": "kW",
         "equipmentId": "RO-001", "min": 0, "max": 60, "normalMin": 30, "normalMax": 45, "warning": 50, "critical": 55},

        # RO-002 Sensors
        {"sensorId": "RO-002-PS-IN", "name": "RO2 입구압력", "type": "PressureSensor", "unit": "bar",
         "equipmentId": "RO-002", "min": 0, "max": 20, "normalMin": 8, "normalMax": 14, "warning": 16, "critical": 18},
        {"sensorId": "RO-002-CS-OUT", "name": "RO2 투과수전도도", "type": "ConductivitySensor", "unit": "μS/cm",
         "equipmentId": "RO-002", "min": 0, "max": 10, "normalMin": 0.5, "normalMax": 3, "warning": 5, "critical": 8},
        {"sensorId": "RO-002-PM", "name": "RO2 전력", "type": "PowerMeter", "unit": "kW",
         "equipmentId": "RO-002", "min": 0, "max": 50, "normalMin": 25, "normalMax": 35, "warning": 40, "critical": 45},

        # EDI-001 Sensors
        {"sensorId": "EDI-001-CS-OUT", "name": "EDI1 출수전도도", "type": "ConductivitySensor", "unit": "MΩ·cm",
         "equipmentId": "EDI-001", "min": 0, "max": 20, "normalMin": 15, "normalMax": 18.2, "warning": 12, "critical": 8},
        {"sensorId": "EDI-001-VS", "name": "EDI1 전압", "type": "VoltageSensor", "unit": "V",
         "equipmentId": "EDI-001", "min": 0, "max": 600, "normalMin": 200, "normalMax": 400, "warning": 480, "critical": 550},
        {"sensorId": "EDI-001-AS", "name": "EDI1 전류", "type": "CurrentSensor", "unit": "A",
         "equipmentId": "EDI-001", "min": 0, "max": 80, "normalMin": 20, "normalMax": 50, "warning": 60, "critical": 70},
        {"sensorId": "EDI-001-PM", "name": "EDI1 전력", "type": "PowerMeter", "unit": "kW",
         "equipmentId": "EDI-001", "min": 0, "max": 35, "normalMin": 10, "normalMax": 25, "warning": 28, "critical": 32},

        # EDI-002 Sensors
        {"sensorId": "EDI-002-CS-OUT", "name": "EDI2 출수전도도", "type": "ConductivitySensor", "unit": "MΩ·cm",
         "equipmentId": "EDI-002", "min": 0, "max": 20, "normalMin": 15, "normalMax": 18.2, "warning": 12, "critical": 8},
        {"sensorId": "EDI-002-PM", "name": "EDI2 전력", "type": "PowerMeter", "unit": "kW",
         "equipmentId": "EDI-002", "min": 0, "max": 35, "normalMin": 10, "normalMax": 25, "warning": 28, "critical": 32},

        # UV-001 Sensors
        {"sensorId": "UV-001-UVI", "name": "UV1 강도", "type": "UVIntensitySensor", "unit": "mJ/cm²",
         "equipmentId": "UV-001", "min": 0, "max": 100, "normalMin": 35, "normalMax": 50, "warning": 30, "critical": 25},
        {"sensorId": "UV-001-TS", "name": "UV1 램프온도", "type": "TemperatureSensor", "unit": "°C",
         "equipmentId": "UV-001", "min": 0, "max": 150, "normalMin": 60, "normalMax": 90, "warning": 110, "critical": 130},
        {"sensorId": "UV-001-PM", "name": "UV1 전력", "type": "PowerMeter", "unit": "kW",
         "equipmentId": "UV-001", "min": 0, "max": 12, "normalMin": 6, "normalMax": 8, "warning": 9, "critical": 10},

        # UV-002 Sensors
        {"sensorId": "UV-002-UVI", "name": "UV2 강도", "type": "UVIntensitySensor", "unit": "mJ/cm²",
         "equipmentId": "UV-002", "min": 0, "max": 100, "normalMin": 35, "normalMax": 50, "warning": 30, "critical": 25},
        {"sensorId": "UV-002-PM", "name": "UV2 전력", "type": "PowerMeter", "unit": "kW",
         "equipmentId": "UV-002", "min": 0, "max": 12, "normalMin": 6, "normalMax": 8, "warning": 9, "critical": 10},

        # Pump Sensors
        {"sensorId": "PUMP-001-VBS", "name": "펌프1 진동", "type": "VibrationSensor", "unit": "mm/s",
         "equipmentId": "PUMP-001", "min": 0, "max": 30, "normalMin": 0, "normalMax": 5, "warning": 8, "critical": 12},
        {"sensorId": "PUMP-001-TS", "name": "펌프1 베어링온도", "type": "TemperatureSensor", "unit": "°C",
         "equipmentId": "PUMP-001", "min": 0, "max": 100, "normalMin": 30, "normalMax": 55, "warning": 65, "critical": 75},
        {"sensorId": "PUMP-001-AS", "name": "펌프1 전류", "type": "CurrentSensor", "unit": "A",
         "equipmentId": "PUMP-001", "min": 0, "max": 50, "normalMin": 15, "normalMax": 30, "warning": 38, "critical": 45},
        {"sensorId": "PUMP-001-PM", "name": "펌프1 전력", "type": "PowerMeter", "unit": "kW",
         "equipmentId": "PUMP-001", "min": 0, "max": 20, "normalMin": 10, "normalMax": 15, "warning": 17, "critical": 19},

        {"sensorId": "PUMP-003-FS", "name": "공급펌프 유량", "type": "FlowSensor", "unit": "m³/h",
         "equipmentId": "PUMP-003", "min": 0, "max": 400, "normalMin": 150, "normalMax": 280, "warning": 100, "critical": 50},
        {"sensorId": "PUMP-003-PM", "name": "공급펌프 전력", "type": "PowerMeter", "unit": "kW",
         "equipmentId": "PUMP-003", "min": 0, "max": 30, "normalMin": 15, "normalMax": 22, "warning": 25, "critical": 28},

        # Tank Sensors
        {"sensorId": "TANK-001-LS", "name": "탱크1 수위", "type": "LevelSensor", "unit": "%",
         "equipmentId": "TANK-001", "min": 0, "max": 100, "normalMin": 40, "normalMax": 90, "warning": 30, "critical": 20},
        {"sensorId": "TANK-001-CS", "name": "탱크1 전도도", "type": "ConductivitySensor", "unit": "MΩ·cm",
         "equipmentId": "TANK-001", "min": 0, "max": 20, "normalMin": 17, "normalMax": 18.2, "warning": 15, "critical": 12},
        {"sensorId": "TANK-001-TURB", "name": "탱크1 탁도", "type": "TurbiditySensor", "unit": "NTU",
         "equipmentId": "TANK-001", "min": 0, "max": 1, "normalMin": 0, "normalMax": 0.05, "warning": 0.1, "critical": 0.2},

        {"sensorId": "TANK-002-LS", "name": "탱크2 수위", "type": "LevelSensor", "unit": "%",
         "equipmentId": "TANK-002", "min": 0, "max": 100, "normalMin": 40, "normalMax": 90, "warning": 30, "critical": 20},
        {"sensorId": "TANK-002-CS", "name": "탱크2 전도도", "type": "ConductivitySensor", "unit": "MΩ·cm",
         "equipmentId": "TANK-002", "min": 0, "max": 20, "normalMin": 17, "normalMax": 18.2, "warning": 15, "critical": 12},

        # High Pressure Pump
        {"sensorId": "HP-001-PS-OUT", "name": "고압펌프 토출압", "type": "PressureSensor", "unit": "bar",
         "equipmentId": "HP-001", "min": 0, "max": 25, "normalMin": 12, "normalMax": 18, "warning": 20, "critical": 22},
        {"sensorId": "HP-001-PM", "name": "고압펌프 전력", "type": "PowerMeter", "unit": "kW",
         "equipmentId": "HP-001", "min": 0, "max": 70, "normalMin": 40, "normalMax": 55, "warning": 60, "critical": 65},

        # Filter Sensors
        {"sensorId": "MMF-001-DP", "name": "MMF 차압", "type": "DifferentialPressureSensor", "unit": "bar",
         "equipmentId": "MMF-001", "min": 0, "max": 2, "normalMin": 0.1, "normalMax": 0.5, "warning": 0.8, "critical": 1.2},
        {"sensorId": "ACF-001-DP", "name": "ACF 차압", "type": "DifferentialPressureSensor", "unit": "bar",
         "equipmentId": "ACF-001", "min": 0, "max": 2, "normalMin": 0.1, "normalMax": 0.4, "warning": 0.7, "critical": 1.0},
        {"sensorId": "UF-001-TMP", "name": "UF TMP", "type": "PressureSensor", "unit": "bar",
         "equipmentId": "UF-001", "min": 0, "max": 3, "normalMin": 0.3, "normalMax": 1.0, "warning": 1.5, "critical": 2.0},
    ]

    for sensor in sensor_definitions:
        eq_id = sensor.pop('equipmentId')
        session.run("""
            MATCH (e:Equipment {equipmentId: $equipmentId})
            CREATE (s:Sensor $props)
            CREATE (e)-[:HAS_SENSOR]->(s)
        """, {"equipmentId": eq_id, "props": sensor})

    print(f"  Created {len(sensor_definitions)} sensors")


def create_observations(session):
    """Create time-series observation data for sensors"""
    print("Creating sensor observations...")

    # Get all sensors
    result = session.run("""
        MATCH (s:Sensor)
        RETURN s.sensorId AS sensorId, s.normalMin AS normalMin, s.normalMax AS normalMax, s.unit AS unit
    """)
    sensors = [dict(record) for record in result]

    now = datetime.now()
    observation_count = 0

    for sensor in sensors:
        # Create 48 hours of data at 15-minute intervals (192 points)
        for i in range(192):
            timestamp = now - timedelta(minutes=15 * i)

            # Generate realistic values with some variation
            normal_min = sensor['normalMin'] or 0
            normal_max = sensor['normalMax'] or 100
            base_value = (normal_min + normal_max) / 2
            variation = (normal_max - normal_min) * 0.3

            # Add time-based patterns (higher during day)
            hour_factor = 1 + 0.1 * abs(12 - timestamp.hour) / 12

            # Random variation
            value = base_value * hour_factor + random.uniform(-variation, variation)
            value = max(sensor['normalMin'] or 0, min(value, (sensor['normalMax'] or 100) * 1.1))

            session.run("""
                MATCH (s:Sensor {sensorId: $sensorId})
                CREATE (o:Observation {
                    timestamp: datetime($timestamp),
                    value: $value,
                    unit: $unit,
                    quality: 'Good'
                })
                CREATE (s)-[:HAS_OBSERVATION]->(o)
            """, {
                "sensorId": sensor['sensorId'],
                "timestamp": timestamp.isoformat(),
                "value": round(value, 2),
                "unit": sensor['unit']
            })
            observation_count += 1

    print(f"  Created {observation_count} observations")


def create_maintenance_records(session):
    """Create maintenance history and schedules"""
    print("Creating maintenance records...")

    maintenance_records = [
        {"maintenanceId": "MAINT-001", "equipmentId": "RO-001", "type": "Preventive",
         "description": "RO 멤브레인 CIP 세정", "scheduledDate": "2026-01-25", "status": "Scheduled",
         "estimatedDuration": 4, "priority": "Medium"},
        {"maintenanceId": "MAINT-002", "equipmentId": "RO-001", "type": "Preventive",
         "description": "RO 멤브레인 교체", "scheduledDate": "2026-03-15", "status": "Planned",
         "estimatedDuration": 8, "priority": "High"},
        {"maintenanceId": "MAINT-003", "equipmentId": "UV-001", "type": "Corrective",
         "description": "UV 램프 교체 (강도 저하)", "scheduledDate": "2026-01-22", "status": "Urgent",
         "estimatedDuration": 2, "priority": "High"},
        {"maintenanceId": "MAINT-004", "equipmentId": "EDI-001", "type": "Preventive",
         "description": "EDI 스택 점검", "scheduledDate": "2026-02-01", "status": "Scheduled",
         "estimatedDuration": 3, "priority": "Medium"},
        {"maintenanceId": "MAINT-005", "equipmentId": "PUMP-001", "type": "Preventive",
         "description": "펌프 베어링 윤활", "scheduledDate": "2026-01-28", "status": "Scheduled",
         "estimatedDuration": 1, "priority": "Low"},
        {"maintenanceId": "MAINT-006", "equipmentId": "MMF-001", "type": "Preventive",
         "description": "다층여과기 역세척", "scheduledDate": "2026-01-21", "status": "In Progress",
         "estimatedDuration": 2, "priority": "Medium"},
        {"maintenanceId": "MAINT-007", "equipmentId": "ACF-001", "type": "Preventive",
         "description": "활성탄 교체", "scheduledDate": "2026-04-01", "status": "Planned",
         "estimatedDuration": 6, "priority": "High"},

        # Completed maintenance
        {"maintenanceId": "MAINT-008", "equipmentId": "RO-002", "type": "Preventive",
         "description": "RO 멤브레인 CIP 세정", "completedDate": "2026-01-10", "status": "Completed",
         "estimatedDuration": 4, "priority": "Medium"},
        {"maintenanceId": "MAINT-009", "equipmentId": "PUMP-002", "type": "Preventive",
         "description": "펌프 베어링 교체", "completedDate": "2025-12-20", "status": "Completed",
         "estimatedDuration": 3, "priority": "High"},
        {"maintenanceId": "MAINT-010", "equipmentId": "UV-002", "type": "Preventive",
         "description": "UV 램프 교체", "completedDate": "2025-12-15", "status": "Completed",
         "estimatedDuration": 2, "priority": "Medium"},
    ]

    for maint in maintenance_records:
        eq_id = maint.pop('equipmentId')
        session.run("""
            MATCH (e:Equipment {equipmentId: $equipmentId})
            CREATE (m:Maintenance $props)
            CREATE (m)-[:FOR_EQUIPMENT]->(e)
        """, {"equipmentId": eq_id, "props": maint})

    print(f"  Created {len(maintenance_records)} maintenance records")


def create_anomalies(session):
    """Create anomaly detection records"""
    print("Creating anomaly records...")

    anomalies = [
        {"anomalyId": "ANOM-001", "equipmentId": "UV-001", "sensorId": "UV-001-UVI",
         "type": "UV Lamp Degradation", "severity": 0.75, "detectedAt": "2026-01-18T14:30:00",
         "description": "UV 램프 강도 25% 감소 감지", "status": "Open", "recommendedAction": "UV 램프 즉시 교체 필요"},
        {"anomalyId": "ANOM-002", "equipmentId": "RO-001", "sensorId": "RO-001-PS-IN",
         "type": "Pressure Increase", "severity": 0.45, "detectedAt": "2026-01-19T09:15:00",
         "description": "RO 입구압력 상승 추세", "status": "Monitoring", "recommendedAction": "멤브레인 오염 모니터링"},
        {"anomalyId": "ANOM-003", "equipmentId": "EDI-001", "sensorId": "EDI-001-CS-OUT",
         "type": "Conductivity Rise", "severity": 0.55, "detectedAt": "2026-01-17T16:45:00",
         "description": "EDI 출수 전도도 품질 저하", "status": "Open", "recommendedAction": "EDI 스택 점검 필요"},
        {"anomalyId": "ANOM-004", "equipmentId": "PUMP-001", "sensorId": "PUMP-001-VBS",
         "type": "Vibration Anomaly", "severity": 0.35, "detectedAt": "2026-01-16T11:20:00",
         "description": "펌프 진동 패턴 변화 감지", "status": "Resolved", "recommendedAction": "베어링 윤활 완료"},
        {"anomalyId": "ANOM-005", "equipmentId": "ACF-001", "sensorId": "ACF-001-DP",
         "type": "Filter Clogging", "severity": 0.60, "detectedAt": "2026-01-20T08:00:00",
         "description": "활성탄 필터 차압 상승", "status": "Open", "recommendedAction": "필터 역세척 또는 교체 검토"},
    ]

    for anomaly in anomalies:
        eq_id = anomaly.pop('equipmentId')
        sensor_id = anomaly.pop('sensorId')
        session.run("""
            MATCH (e:Equipment {equipmentId: $equipmentId})
            MATCH (s:Sensor {sensorId: $sensorId})
            CREATE (a:Anomaly $props)
            CREATE (a)-[:DETECTED_ON]->(e)
            CREATE (a)-[:FROM_SENSOR]->(s)
        """, {"equipmentId": eq_id, "sensorId": sensor_id, "props": anomaly})

    print(f"  Created {len(anomalies)} anomaly records")


def create_failure_modes(session):
    """Create failure mode definitions"""
    print("Creating failure modes...")

    failure_modes = [
        {"failureModeId": "FM-001", "name": "멤브레인 오염", "nameEn": "Membrane Fouling",
         "description": "유기물, 무기물 스케일에 의한 멤브레인 성능 저하",
         "equipmentTypes": ["ReverseOsmosis", "Ultrafiltration"],
         "indicators": ["압력강 증가", "투과수량 감소", "염제거율 감소"]},
        {"failureModeId": "FM-002", "name": "멤브레인 손상", "nameEn": "Membrane Damage",
         "description": "물리적/화학적 원인에 의한 멤브레인 파손",
         "equipmentTypes": ["ReverseOsmosis", "Ultrafiltration"],
         "indicators": ["투과수 전도도 급상승", "차압 급감"]},
        {"failureModeId": "FM-003", "name": "수지 열화", "nameEn": "Resin Exhaustion",
         "description": "이온교환수지 교환용량 소진",
         "equipmentTypes": ["Electrodeionization", "MixedBedPolisher"],
         "indicators": ["출수 전도도 증가", "전류 증가"]},
        {"failureModeId": "FM-004", "name": "UV 램프 열화", "nameEn": "UV Lamp Degradation",
         "description": "UV 램프 수명 종료에 따른 살균 효율 저하",
         "equipmentTypes": ["UVSterilizer"],
         "indicators": ["UV 강도 감소", "소비전력 증가"]},
        {"failureModeId": "FM-005", "name": "베어링 마모", "nameEn": "Bearing Wear",
         "description": "펌프 베어링 마모에 의한 성능 저하",
         "equipmentTypes": ["CirculationPump", "HighPressurePump", "DistributionPump"],
         "indicators": ["진동 증가", "온도 상승", "소음 발생"]},
        {"failureModeId": "FM-006", "name": "필터 막힘", "nameEn": "Filter Clogging",
         "description": "필터 매체 오염에 의한 차압 상승",
         "equipmentTypes": ["MultiMediaFilter", "ActivatedCarbonFilter", "CartridgeFilter"],
         "indicators": ["차압 증가", "유량 감소"]},
    ]

    for fm in failure_modes:
        equipment_types = fm.pop('equipmentTypes')
        indicators = fm.pop('indicators')
        fm['equipmentTypes'] = str(equipment_types)
        fm['indicators'] = str(indicators)
        session.run("""
            CREATE (f:FailureMode $props)
        """, {"props": fm})

    # Link failure modes to equipment types
    links = [
        ("FM-001", "RO-001"), ("FM-001", "RO-002"), ("FM-001", "UF-001"),
        ("FM-002", "RO-001"), ("FM-002", "RO-002"),
        ("FM-003", "EDI-001"), ("FM-003", "EDI-002"), ("FM-003", "MBP-001"),
        ("FM-004", "UV-001"), ("FM-004", "UV-002"),
        ("FM-005", "PUMP-001"), ("FM-005", "PUMP-002"), ("FM-005", "PUMP-003"), ("FM-005", "HP-001"),
        ("FM-006", "MMF-001"), ("FM-006", "ACF-001"), ("FM-006", "SF-001"),
    ]

    for fm_id, eq_id in links:
        session.run("""
            MATCH (f:FailureMode {failureModeId: $fmId})
            MATCH (e:Equipment {equipmentId: $eqId})
            CREATE (e)-[:HAS_FAILURE_MODE]->(f)
        """, {"fmId": fm_id, "eqId": eq_id})

    print(f"  Created {len(failure_modes)} failure modes")


def print_summary(session):
    """Print database summary"""
    print("\n" + "="*60)
    print("Database Summary")
    print("="*60)

    queries = [
        ("Process Areas", "MATCH (n:ProcessArea) RETURN count(n) AS count"),
        ("Equipment", "MATCH (n:Equipment) RETURN count(n) AS count"),
        ("Sensors", "MATCH (n:Sensor) RETURN count(n) AS count"),
        ("Observations", "MATCH (n:Observation) RETURN count(n) AS count"),
        ("Maintenance Records", "MATCH (n:Maintenance) RETURN count(n) AS count"),
        ("Anomalies", "MATCH (n:Anomaly) RETURN count(n) AS count"),
        ("Failure Modes", "MATCH (n:FailureMode) RETURN count(n) AS count"),
        ("Total Relationships", "MATCH ()-[r]->() RETURN count(r) AS count"),
    ]

    for name, query in queries:
        result = session.run(query)
        count = result.single()['count']
        print(f"  {name}: {count}")

    print("\nEquipment by Area:")
    result = session.run("""
        MATCH (e:Equipment)-[:LOCATED_IN]->(a:ProcessArea)
        RETURN a.name AS area, count(e) AS count
        ORDER BY a.areaId
    """)
    for record in result:
        print(f"  - {record['area']}: {record['count']} 설비")

    print("="*60)


def main():
    print("="*60)
    print("UPW Process Data Generator")
    print("="*60)

    driver = create_driver()

    try:
        with driver.session() as session:
            clear_database(session)
            create_constraints(session)
            create_process_areas(session)
            create_equipment(session)
            create_sensors(session)
            create_observations(session)
            create_maintenance_records(session)
            create_anomalies(session)
            create_failure_modes(session)
            print_summary(session)

        print("\nData generation completed successfully!")

    except Exception as e:
        print(f"Error: {e}")
        raise
    finally:
        driver.close()


if __name__ == "__main__":
    main()
