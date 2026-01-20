"""
UPW Predictive Maintenance System - Flask Application
"""
from flask import Flask
from flask_cors import CORS
from flask_socketio import SocketIO

from .config import Config

socketio = SocketIO()


def create_app(config_class=Config):
    """Application factory pattern"""
    app = Flask(__name__)
    app.config.from_object(config_class)

    # Enable CORS
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # Initialize SocketIO for real-time updates
    socketio.init_app(app, cors_allowed_origins="*")

    # Register blueprints
    from .api import equipment, sensor, observation, anomaly, energy, ontology, maintenance

    app.register_blueprint(equipment.bp, url_prefix='/api/equipment')
    app.register_blueprint(sensor.bp, url_prefix='/api/sensors')
    app.register_blueprint(observation.bp, url_prefix='/api/observations')
    app.register_blueprint(anomaly.bp, url_prefix='/api/anomaly')
    app.register_blueprint(energy.bp, url_prefix='/api/energy')
    app.register_blueprint(ontology.bp, url_prefix='/api/ontology')
    app.register_blueprint(maintenance.bp, url_prefix='/api/maintenance')

    # Health check endpoint
    @app.route('/health')
    def health_check():
        return {'status': 'healthy', 'service': 'upw-backend'}

    return app
