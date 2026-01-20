#!/usr/bin/env python3
"""
UPW Predictive Maintenance System - Application Entry Point
"""
import os
from app import create_app, socketio

app = create_app()

if __name__ == '__main__':
    debug = os.environ.get('FLASK_DEBUG', '0') == '1'
    host = os.environ.get('FLASK_HOST', '0.0.0.0')
    port = int(os.environ.get('FLASK_PORT', '5000'))

    print(f"Starting UPW Backend Server...")
    print(f"  Host: {host}")
    print(f"  Port: {port}")
    print(f"  Debug: {debug}")

    socketio.run(app, host=host, port=port, debug=debug, allow_unsafe_werkzeug=True)
