"""
InfluxDB service for time-series energy data
"""
from influxdb_client import InfluxDBClient, Point, WritePrecision
from influxdb_client.client.write_api import SYNCHRONOUS
from datetime import datetime, timezone
from ..config import Config


class InfluxDBService:
    _client = None
    _write_api = None
    _query_api = None

    @classmethod
    def _get_client(cls):
        if cls._client is None:
            cls._client = InfluxDBClient(
                url=Config.INFLUXDB_URL,
                token=Config.INFLUXDB_TOKEN,
                org=Config.INFLUXDB_ORG
            )
            cls._write_api = cls._client.write_api(write_options=SYNCHRONOUS)
            cls._query_api = cls._client.query_api()
        return cls._client

    @classmethod
    def write_energy_data(cls, equipment_id, power_kw, timestamp=None):
        """Write a single energy data point"""
        cls._get_client()
        if timestamp is None:
            timestamp = datetime.now(timezone.utc)

        point = (
            Point("energy_consumption")
            .tag("equipment_id", equipment_id)
            .field("power_kw", float(power_kw))
            .time(timestamp, WritePrecision.S)
        )
        cls._write_api.write(bucket=Config.INFLUXDB_BUCKET, record=point)

    @classmethod
    def write_energy_batch(cls, records):
        """Write batch energy data points
        records: list of dicts with keys: equipment_id, power_kw, timestamp
        """
        cls._get_client()
        points = []
        for rec in records:
            point = (
                Point("energy_consumption")
                .tag("equipment_id", rec["equipment_id"])
                .field("power_kw", float(rec["power_kw"]))
                .time(rec["timestamp"], WritePrecision.S)
            )
            points.append(point)

        cls._write_api.write(bucket=Config.INFLUXDB_BUCKET, record=points)

    @classmethod
    def query_energy_data(cls, equipment_id, start="-24h", stop="now()"):
        """Query energy data for a specific equipment"""
        cls._get_client()
        query = f'''
        from(bucket: "{Config.INFLUXDB_BUCKET}")
          |> range(start: {start}, stop: {stop})
          |> filter(fn: (r) => r._measurement == "energy_consumption")
          |> filter(fn: (r) => r.equipment_id == "{equipment_id}")
          |> filter(fn: (r) => r._field == "power_kw")
          |> sort(columns: ["_time"])
        '''
        tables = cls._query_api.query(query, org=Config.INFLUXDB_ORG)
        results = []
        for table in tables:
            for record in table.records:
                results.append({
                    "equipmentId": record.values.get("equipment_id"),
                    "timestamp": record.get_time().isoformat(),
                    "powerKw": record.get_value()
                })
        return results

    @classmethod
    def query_all_equipment_energy(cls, start="-24h", stop="now()"):
        """Query energy data for all equipment grouped by equipment_id"""
        cls._get_client()
        query = f'''
        from(bucket: "{Config.INFLUXDB_BUCKET}")
          |> range(start: {start}, stop: {stop})
          |> filter(fn: (r) => r._measurement == "energy_consumption")
          |> filter(fn: (r) => r._field == "power_kw")
          |> sort(columns: ["_time"])
        '''
        tables = cls._query_api.query(query, org=Config.INFLUXDB_ORG)
        grouped = {}
        for table in tables:
            for record in table.records:
                eq_id = record.values.get("equipment_id")
                if eq_id not in grouped:
                    grouped[eq_id] = []
                grouped[eq_id].append({
                    "timestamp": record.get_time().isoformat(),
                    "powerKw": record.get_value()
                })
        return grouped

    @classmethod
    def get_equipment_energy_summary(cls, start="-7d", stop="now()"):
        """Get energy summary per equipment (total, avg, max, min)"""
        cls._get_client()

        # Mean
        query_mean = f'''
        from(bucket: "{Config.INFLUXDB_BUCKET}")
          |> range(start: {start}, stop: {stop})
          |> filter(fn: (r) => r._measurement == "energy_consumption")
          |> filter(fn: (r) => r._field == "power_kw")
          |> group(columns: ["equipment_id"])
          |> mean()
        '''
        # Max
        query_max = f'''
        from(bucket: "{Config.INFLUXDB_BUCKET}")
          |> range(start: {start}, stop: {stop})
          |> filter(fn: (r) => r._measurement == "energy_consumption")
          |> filter(fn: (r) => r._field == "power_kw")
          |> group(columns: ["equipment_id"])
          |> max()
        '''
        # Min
        query_min = f'''
        from(bucket: "{Config.INFLUXDB_BUCKET}")
          |> range(start: {start}, stop: {stop})
          |> filter(fn: (r) => r._measurement == "energy_consumption")
          |> filter(fn: (r) => r._field == "power_kw")
          |> group(columns: ["equipment_id"])
          |> min()
        '''
        # Sum (approximate total energy = sum of power * interval)
        query_sum = f'''
        from(bucket: "{Config.INFLUXDB_BUCKET}")
          |> range(start: {start}, stop: {stop})
          |> filter(fn: (r) => r._measurement == "energy_consumption")
          |> filter(fn: (r) => r._field == "power_kw")
          |> group(columns: ["equipment_id"])
          |> sum()
        '''
        # Count
        query_count = f'''
        from(bucket: "{Config.INFLUXDB_BUCKET}")
          |> range(start: {start}, stop: {stop})
          |> filter(fn: (r) => r._measurement == "energy_consumption")
          |> filter(fn: (r) => r._field == "power_kw")
          |> group(columns: ["equipment_id"])
          |> count()
        '''

        means = cls._query_api.query(query_mean, org=Config.INFLUXDB_ORG)
        maxes = cls._query_api.query(query_max, org=Config.INFLUXDB_ORG)
        mins = cls._query_api.query(query_min, org=Config.INFLUXDB_ORG)
        sums = cls._query_api.query(query_sum, org=Config.INFLUXDB_ORG)
        counts = cls._query_api.query(query_count, org=Config.INFLUXDB_ORG)

        summary = {}
        for table in means:
            for record in table.records:
                eq_id = record.values.get("equipment_id")
                summary[eq_id] = {"equipmentId": eq_id, "avgKw": round(record.get_value(), 2)}

        for table in maxes:
            for record in table.records:
                eq_id = record.values.get("equipment_id")
                if eq_id in summary:
                    summary[eq_id]["maxKw"] = round(record.get_value(), 2)

        for table in mins:
            for record in table.records:
                eq_id = record.values.get("equipment_id")
                if eq_id in summary:
                    summary[eq_id]["minKw"] = round(record.get_value(), 2)

        for table in sums:
            for record in table.records:
                eq_id = record.values.get("equipment_id")
                if eq_id in summary:
                    # total kWh = sum of power_kw * (15min / 60) = sum * 0.25
                    summary[eq_id]["totalKwh"] = round(record.get_value() * 0.25, 2)

        for table in counts:
            for record in table.records:
                eq_id = record.values.get("equipment_id")
                if eq_id in summary:
                    summary[eq_id]["dataPoints"] = int(record.get_value())

        return list(summary.values())
