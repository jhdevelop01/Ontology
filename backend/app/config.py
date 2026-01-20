"""
Configuration settings for the UPW Predictive Maintenance System
"""
import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    """Base configuration"""
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')

    # Neo4j Configuration
    NEO4J_URI = os.environ.get('NEO4J_URI', 'bolt://localhost:7688')
    NEO4J_USER = os.environ.get('NEO4J_USER', 'neo4j')
    NEO4J_PASSWORD = os.environ.get('NEO4J_PASSWORD', 'upw_password_2024')

    # Ontology paths
    ONTOLOGY_DIR = os.environ.get('ONTOLOGY_DIR', '/ontology')
    CORE_ONTOLOGY_PATH = os.path.join(ONTOLOGY_DIR, 'core', 'upw-core.ttl')
    INSTANCE_DATA_PATH = os.path.join(ONTOLOGY_DIR, 'instances', 'sample-data.ttl')

    # ML Model Configuration
    MODEL_DIR = os.environ.get('MODEL_DIR', '/app/models')

    # Anomaly Detection Thresholds
    ANOMALY_THRESHOLD = float(os.environ.get('ANOMALY_THRESHOLD', '0.5'))

    # Energy Prediction Configuration
    ENERGY_PREDICTION_HORIZON = int(os.environ.get('ENERGY_PREDICTION_HORIZON', '96'))  # 15-min intervals for 24h
    ENERGY_LOOKBACK_DAYS = int(os.environ.get('ENERGY_LOOKBACK_DAYS', '10'))


class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True
    TESTING = False


class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False
    TESTING = False


class TestingConfig(Config):
    """Testing configuration"""
    DEBUG = True
    TESTING = True
    NEO4J_URI = 'bolt://localhost:7688'


config_by_name = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}
