#!/usr/bin/env python3
"""
Neo4j Initialization Script

Sets up Neo4j with n10s (neosemantics) plugin and imports ontology files.
"""
import os
import time
from neo4j import GraphDatabase

# Configuration
NEO4J_URI = os.environ.get('NEO4J_URI', 'bolt://localhost:7687')
NEO4J_USER = os.environ.get('NEO4J_USER', 'neo4j')
NEO4J_PASSWORD = os.environ.get('NEO4J_PASSWORD', 'upw_password_2024')

ONTOLOGY_DIR = os.environ.get('ONTOLOGY_DIR', '/ontology')


def wait_for_neo4j(driver, max_retries=30, delay=2):
    """Wait for Neo4j to be ready"""
    print("Waiting for Neo4j to be ready...")
    for i in range(max_retries):
        try:
            with driver.session() as session:
                session.run("RETURN 1")
            print("Neo4j is ready!")
            return True
        except Exception as e:
            print(f"Attempt {i + 1}/{max_retries}: {e}")
            time.sleep(delay)
    return False


def init_n10s(session):
    """Initialize n10s (neosemantics) configuration"""
    print("Initializing n10s configuration...")

    # Create constraint for Resource URIs
    try:
        session.run("CREATE CONSTRAINT n10s_unique_uri IF NOT EXISTS FOR (r:Resource) REQUIRE r.uri IS UNIQUE")
        print("Created URI constraint")
    except Exception as e:
        print(f"Constraint may already exist: {e}")

    # Initialize n10s graph config
    try:
        session.run("""
            CALL n10s.graphconfig.init({
                handleVocabUris: 'MAP',
                handleMultival: 'ARRAY',
                keepLangTag: false,
                keepCustomDataTypes: true,
                applyNeo4jNaming: true
            })
        """)
        print("n10s graph config initialized")
    except Exception as e:
        print(f"Graph config may already exist: {e}")

    # Add namespace prefixes
    namespaces = [
        ('upw', 'http://example.org/upw#'),
        ('sosa', 'http://www.w3.org/ns/sosa/'),
        ('ssn', 'http://www.w3.org/ns/ssn/'),
        ('saref', 'https://saref.etsi.org/core/'),
        ('iof', 'https://spec.industrialontologies.org/ontology/maintenance/'),
        ('rdfs', 'http://www.w3.org/2000/01/rdf-schema#'),
        ('owl', 'http://www.w3.org/2002/07/owl#'),
        ('xsd', 'http://www.w3.org/2001/XMLSchema#'),
        ('rdf', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'),
    ]

    for prefix, uri in namespaces:
        try:
            session.run("CALL n10s.nsprefixes.add($prefix, $uri)", prefix=prefix, uri=uri)
            print(f"Added namespace: {prefix} -> {uri}")
        except Exception as e:
            print(f"Namespace {prefix} may already exist: {e}")


def import_ontology(session, file_path: str, format: str = 'Turtle'):
    """Import an ontology file into Neo4j"""
    print(f"Importing {file_path}...")

    if not os.path.exists(file_path):
        print(f"File not found: {file_path}")
        return False

    try:
        # Read file content
        with open(file_path, 'r') as f:
            rdf_content = f.read()

        # Import using inline data
        result = session.run(
            "CALL n10s.rdf.import.inline($rdf, $format)",
            rdf=rdf_content,
            format=format
        )
        record = result.single()
        if record:
            print(f"Imported: {record['triplesLoaded']} triples")
        return True
    except Exception as e:
        print(f"Error importing {file_path}: {e}")
        return False


def verify_import(session):
    """Verify that ontology was imported correctly"""
    print("\nVerifying import...")

    # Count nodes
    result = session.run("MATCH (n:Resource) RETURN count(n) AS count")
    node_count = result.single()['count']
    print(f"Total Resource nodes: {node_count}")

    # Count relationships
    result = session.run("MATCH ()-[r]->() RETURN count(r) AS count")
    rel_count = result.single()['count']
    print(f"Total relationships: {rel_count}")

    # List equipment
    result = session.run("""
        MATCH (e:Resource)
        WHERE e.upw__equipmentId IS NOT NULL
        RETURN e.upw__equipmentId AS id, e.upw__equipmentName AS name
        ORDER BY e.upw__equipmentId
    """)
    print("\nEquipment found:")
    for record in result:
        print(f"  - {record['id']}: {record['name']}")

    # List sensors
    result = session.run("""
        MATCH (s:Resource)
        WHERE s.upw__sensorId IS NOT NULL
        RETURN count(s) AS count
    """)
    sensor_count = result.single()['count']
    print(f"\nTotal sensors: {sensor_count}")


def main():
    """Main initialization function"""
    print("=" * 60)
    print("UPW Ontology - Neo4j Initialization")
    print("=" * 60)

    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))

    try:
        if not wait_for_neo4j(driver):
            print("Failed to connect to Neo4j")
            return 1

        with driver.session() as session:
            # Initialize n10s
            init_n10s(session)

            # Import ontology files
            ontology_files = [
                (os.path.join(ONTOLOGY_DIR, 'core', 'upw-core.ttl'), 'Turtle'),
                (os.path.join(ONTOLOGY_DIR, 'instances', 'sample-data.ttl'), 'Turtle'),
            ]

            for file_path, format in ontology_files:
                import_ontology(session, file_path, format)

            # Verify import
            verify_import(session)

        print("\n" + "=" * 60)
        print("Initialization complete!")
        print("=" * 60)
        return 0

    except Exception as e:
        print(f"Error: {e}")
        return 1
    finally:
        driver.close()


if __name__ == '__main__':
    exit(main())
