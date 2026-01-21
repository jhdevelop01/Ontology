import axios from 'axios';
import type {
  ApiResponse,
  Equipment,
  Sensor,
  Observation,
  Anomaly,
  AnomalyResult,
  EnergyPredictionResult,
  MaintenanceSchedule,
  MaintenanceRecommendation,
  OntologyClass,
  GraphData,
  OntologyStats,
  ProcessFlowData,
  ProcessArea,
} from '../types';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Equipment API
export const equipmentApi = {
  getAll: async (): Promise<ApiResponse<Equipment[]>> => {
    const response = await api.get('/equipment');
    return response.data;
  },

  getById: async (id: string): Promise<ApiResponse<Equipment>> => {
    const response = await api.get(`/equipment/${id}`);
    return response.data;
  },

  getSensors: async (id: string): Promise<ApiResponse<Sensor[]>> => {
    const response = await api.get(`/equipment/${id}/sensors`);
    return response.data;
  },

  getHealth: async (id: string): Promise<ApiResponse<{ healthScore: number; healthStatus: string }>> => {
    const response = await api.get(`/equipment/${id}/health`);
    return response.data;
  },

  updateHealth: async (id: string, healthScore: number, healthStatus: string): Promise<ApiResponse<void>> => {
    const response = await api.put(`/equipment/${id}/health`, { healthScore, healthStatus });
    return response.data;
  },
};

// Sensor API
export const sensorApi = {
  getAll: async (): Promise<ApiResponse<Sensor[]>> => {
    const response = await api.get('/sensors');
    return response.data;
  },

  getById: async (id: string): Promise<ApiResponse<Sensor>> => {
    const response = await api.get(`/sensors/${id}`);
    return response.data;
  },

  getObservations: async (
    id: string,
    start?: string,
    end?: string,
    limit?: number
  ): Promise<ApiResponse<Observation[]>> => {
    const params = new URLSearchParams();
    if (start) params.append('start', start);
    if (end) params.append('end', end);
    if (limit) params.append('limit', limit.toString());
    const response = await api.get(`/sensors/${id}/observations?${params}`);
    return response.data;
  },
};

// Observation API
export const observationApi = {
  create: async (data: {
    sensorId: string;
    equipmentId: string;
    value: number;
    unit?: string;
    timestamp?: string;
  }): Promise<ApiResponse<{ uri: string }>> => {
    const response = await api.post('/observations', data);
    return response.data;
  },

  createBatch: async (observations: Array<{
    sensorId: string;
    equipmentId: string;
    value: number;
    unit?: string;
    timestamp?: string;
  }>): Promise<ApiResponse<{ created: number; failed: number }>> => {
    const response = await api.post('/observations/batch', { observations });
    return response.data;
  },
};

// Anomaly API
export const anomalyApi = {
  detect: async (equipmentId: string): Promise<ApiResponse<AnomalyResult>> => {
    const response = await api.post('/anomaly/detect', { equipmentId });
    return response.data;
  },

  detectAll: async (): Promise<ApiResponse<{
    total_equipment: number;
    anomalies_found: number;
    results: AnomalyResult[];
  }>> => {
    const response = await api.post('/anomaly/detect/all');
    return response.data;
  },

  getHistory: async (
    equipmentId?: string,
    start?: string,
    limit?: number
  ): Promise<ApiResponse<Anomaly[]>> => {
    const params = new URLSearchParams();
    if (equipmentId) params.append('equipmentId', equipmentId);
    if (start) params.append('start', start);
    if (limit) params.append('limit', limit.toString());
    const response = await api.get(`/anomaly/history?${params}`);
    return response.data;
  },
};

// Energy API
export const energyApi = {
  predict: async (targetDate?: string): Promise<ApiResponse<EnergyPredictionResult>> => {
    const response = await api.post('/energy/predict', { targetDate });
    return response.data;
  },

  getHistory: async (date?: string, limit?: number): Promise<ApiResponse<any[]>> => {
    const params = new URLSearchParams();
    if (date) params.append('date', date);
    if (limit) params.append('limit', limit.toString());
    const response = await api.get(`/energy/history?${params}`);
    return response.data;
  },

  getAccuracy: async (date?: string): Promise<ApiResponse<{
    date: string;
    sampleCount: number;
    metrics: { mae: number; rmse: number; mape: number };
  }>> => {
    const params = new URLSearchParams();
    if (date) params.append('date', date);
    const response = await api.get(`/energy/accuracy?${params}`);
    return response.data;
  },
};

// Maintenance API
export const maintenanceApi = {
  getSchedule: async (equipmentId?: string): Promise<ApiResponse<MaintenanceSchedule[]>> => {
    const params = new URLSearchParams();
    if (equipmentId) params.append('equipmentId', equipmentId);
    const response = await api.get(`/maintenance/schedule?${params}`);
    return response.data;
  },

  recommend: async (equipmentId: string): Promise<ApiResponse<MaintenanceRecommendation>> => {
    const response = await api.post('/maintenance/recommend', { equipmentId });
    return response.data;
  },

  recommendAll: async (): Promise<ApiResponse<{
    recommendations: MaintenanceRecommendation[];
    summary: { total: number; high_priority: number; medium_priority: number; low_priority: number };
  }>> => {
    const response = await api.post('/maintenance/recommend/all');
    return response.data;
  },
};

// Ontology API
export const ontologyApi = {
  getClasses: async (): Promise<ApiResponse<OntologyClass[]>> => {
    const response = await api.get('/ontology/classes');
    return response.data;
  },

  getGraph: async (center?: string, depth?: number): Promise<ApiResponse<GraphData>> => {
    const params = new URLSearchParams();
    if (center) params.append('center', center);
    if (depth) params.append('depth', depth.toString());
    const response = await api.get(`/ontology/graph?${params}`);
    return response.data;
  },

  getStats: async (): Promise<ApiResponse<OntologyStats>> => {
    const response = await api.get('/ontology/stats');
    return response.data;
  },

  getProcessFlow: async (): Promise<ApiResponse<ProcessFlowData>> => {
    const response = await api.get('/ontology/process-flow');
    return response.data;
  },

  getAreas: async (): Promise<ApiResponse<ProcessArea[]>> => {
    const response = await api.get('/ontology/areas');
    return response.data;
  },

  // Cypher query execution
  executeCypher: async (query: string): Promise<ApiResponse<{
    data: any[];
    columns: string[];
    count: number;
  }>> => {
    const response = await api.post('/ontology/cypher', { query });
    return response.data;
  },

  // Class hierarchy
  getHierarchy: async (): Promise<ApiResponse<{
    flat: Array<{ name: string; count: number; parents: string[]; children: string[] }>;
    tree: any[];
  }>> => {
    const response = await api.get('/ontology/hierarchy');
    return response.data;
  },

  // Node search
  searchNodes: async (query: string, nodeType?: string, limit?: number): Promise<ApiResponse<any[]>> => {
    const params = new URLSearchParams();
    if (query) params.append('q', query);
    if (nodeType) params.append('type', nodeType);
    if (limit) params.append('limit', limit.toString());
    const response = await api.get(`/ontology/search?${params}`);
    return response.data;
  },

  // Relationship types
  getRelationshipTypes: async (): Promise<ApiResponse<Array<{ type: string; count: number }>>> => {
    const response = await api.get('/ontology/relationships');
    return response.data;
  },

  // Node details
  getNodeDetails: async (nodeId: string): Promise<ApiResponse<{
    id: string;
    labels: string[];
    name: string;
    properties: Record<string, any>;
    outgoing: Array<{ type: string; target: string; targetLabels: string[]; targetName: string }>;
    incoming: Array<{ type: string; source: string; sourceLabels: string[]; sourceName: string }>;
  }>> => {
    const response = await api.get(`/ontology/node/${encodeURIComponent(nodeId)}`);
    return response.data;
  },

  // Path finding
  findPath: async (sourceId: string, targetId: string, maxDepth?: number): Promise<ApiResponse<{
    nodes: Array<{ id: string; labels: string[]; name: string }>;
    relationships: Array<{ type: string; source: string; target: string }>;
    length: number;
  } | null>> => {
    const params = new URLSearchParams();
    params.append('source', sourceId);
    params.append('target', targetId);
    if (maxDepth) params.append('maxDepth', maxDepth.toString());
    const response = await api.get(`/ontology/path?${params}`);
    return response.data;
  },

  // Export ontology
  exportOntology: async (format: 'json' | 'cypher' = 'json'): Promise<ApiResponse<any>> => {
    const response = await api.get(`/ontology/export?format=${format}`);
    return response.data;
  },

  // CRUD Operations
  createNode: async (labels: string[], properties: Record<string, any>): Promise<ApiResponse<any>> => {
    const response = await api.post('/ontology/node', { labels, properties });
    return response.data;
  },

  updateNode: async (nodeId: string, properties: Record<string, any>): Promise<ApiResponse<any>> => {
    const response = await api.put(`/ontology/node/${encodeURIComponent(nodeId)}`, { properties });
    return response.data;
  },

  deleteNode: async (nodeId: string): Promise<ApiResponse<void>> => {
    const response = await api.delete(`/ontology/node/${encodeURIComponent(nodeId)}`);
    return response.data;
  },

  createRelationship: async (
    sourceId: string,
    targetId: string,
    type: string,
    properties?: Record<string, any>
  ): Promise<ApiResponse<any>> => {
    const response = await api.post('/ontology/relationship', {
      sourceId,
      targetId,
      type,
      properties: properties || {},
    });
    return response.data;
  },
};

// Reasoning API
export const reasoningApi = {
  // Get all inference rules
  getRules: async (): Promise<ApiResponse<Array<{
    id: string;
    name: string;
    description: string;
    category: string;
  }>>> => {
    const response = await api.get('/ontology/reasoning/rules');
    return response.data;
  },

  // Get a specific rule by ID
  getRule: async (ruleId: string): Promise<ApiResponse<{
    id: string;
    name: string;
    description: string;
    category: string;
  }>> => {
    const response = await api.get(`/ontology/reasoning/rules/${ruleId}`);
    return response.data;
  },

  // Check what a rule would infer without applying it
  checkRule: async (ruleId: string): Promise<ApiResponse<{
    rule: { id: string; name: string; description: string };
    candidates: any[];
    count: number;
  }>> => {
    const response = await api.post(`/ontology/reasoning/rules/${ruleId}/check`);
    return response.data;
  },

  // Apply a specific rule
  applyRule: async (ruleId: string): Promise<ApiResponse<{
    rule: string;
    message: string;
    inferred: any[];
    count: number;
  }>> => {
    const response = await api.post(`/ontology/reasoning/rules/${ruleId}/apply`);
    return response.data;
  },

  // Run all inference rules
  runAll: async (): Promise<ApiResponse<{
    timestamp: string;
    totalInferred: number;
    results: Array<{
      ruleId: string;
      ruleName: string;
      status: string;
      count: number;
      message: string;
    }>;
  }>> => {
    const response = await api.post('/ontology/reasoning/run');
    return response.data;
  },

  // Get all inferred facts
  getInferred: async (limit?: number): Promise<ApiResponse<{
    nodes: any[];
    relationships: any[];
    nodeCount: number;
    relationshipCount: number;
  }>> => {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    const response = await api.get(`/ontology/reasoning/inferred?${params}`);
    return response.data;
  },

  // Clear all inferred facts
  clearInferred: async (): Promise<ApiResponse<{
    message: string;
    deletedNodes: number;
    deletedRelationships: number;
  }>> => {
    const response = await api.delete('/ontology/reasoning/inferred');
    return response.data;
  },

  // Get inference statistics
  getStats: async (): Promise<ApiResponse<{
    totalInferredNodes: number;
    totalInferredRelationships: number;
    nodesByType: Array<{ label: string; count: number }>;
    relationshipsByType: Array<{ type: string; count: number }>;
  }>> => {
    const response = await api.get('/ontology/reasoning/stats');
    return response.data;
  },

  // Run rule with trace - 추론 과정 추적
  runRuleWithTrace: async (ruleId: string): Promise<ApiResponse<{
    id: string;
    ruleId: string;
    ruleName: string;
    ruleDescription: string;
    startedAt: string;
    completedAt: string | null;
    result: 'SUCCESS' | 'NO_MATCH' | 'ERROR' | 'PENDING';
    steps: Array<{
      stepNumber: number;
      type: 'MATCH' | 'FILTER' | 'CHECK' | 'INFERENCE' | 'RESULT';
      description: string;
      descriptionDetail?: string;
      query?: string;
      resultSummary?: string;
      dataCount: number;
      data: any[];
      timestamp: string;
    }>;
    evidence: Array<{
      id: string;
      type: 'NODE' | 'RELATIONSHIP' | 'PROPERTY';
      nodeId: string;
      label: string;
      propertyName: string;
      propertyValue: any;
      description: string;
    }>;
    inferredCount: number;
    inferredItems: any[];
    summary: string;
  }>> => {
    const response = await api.post(`/ontology/reasoning/rules/${ruleId}/run-with-trace`);
    return response.data;
  },
};

// Test Data API
export const testDataApi = {
  // 시나리오 목록 조회
  getScenarios: async (): Promise<ApiResponse<Array<{
    id: string;
    name: string;
    description: string;
    targetRule: string;
    expectedResult: string;
  }>>> => {
    const response = await api.get('/ontology/test-data/scenarios');
    return response.data;
  },

  // 테스트 데이터 상태 조회
  getStatus: async (): Promise<ApiResponse<{
    scenarios: Array<{ id: string; name: string; loaded: boolean }>;
    dataStatus: {
      lowHealthEquipment: number;
      anomalyObservations: number;
      trendingObservations: number;
      testEquipment: number;
      flowSensors: number;
      inferredNodes: number;
      inferredRelationships: number;
    };
  }>> => {
    const response = await api.get('/ontology/test-data/status');
    return response.data;
  },

  // 모든 시나리오 로드
  loadAll: async (): Promise<ApiResponse<{
    message: string;
    results: Array<{
      scenario: string;
      name: string;
      status: string;
      message: string;
      data: any;
    }>;
  }>> => {
    const response = await api.post('/ontology/test-data/load');
    return response.data;
  },

  // 특정 시나리오 로드
  loadScenario: async (scenarioId: string): Promise<ApiResponse<{
    scenario: string;
    name: string;
    status: string;
    message: string;
    data: any;
  }>> => {
    const response = await api.post(`/ontology/test-data/load/${scenarioId}`);
    return response.data;
  },

  // 테스트 데이터 초기화
  reset: async (): Promise<ApiResponse<{ message: string }>> => {
    const response = await api.post('/ontology/test-data/reset');
    return response.data;
  },

  // 추론 결과만 삭제
  clearInferred: async (): Promise<ApiResponse<{
    message: string;
    deletedNodes: number;
    deletedRelationships: number;
  }>> => {
    const response = await api.post('/ontology/test-data/clear-inferred');
    return response.data;
  },
};

export default api;
