// Equipment Types
export interface Equipment {
  uri: string;
  equipmentId: string;
  name: string;
  manufacturer?: string;
  modelNumber?: string;
  installDate?: string;
  ratedPower?: number;
  operatingHours?: number;
  healthScore?: number;
  healthStatus?: string;
  sensors?: string[];
  failureModes?: string[];
}

// Sensor Types
export interface Sensor {
  uri: string;
  sensorId: string;
  name: string;
  minValue?: number;
  maxValue?: number;
  normalRangeMin?: number;
  normalRangeMax?: number;
  warningThreshold?: number;
  criticalThreshold?: number;
  equipmentId?: string;
}

// Observation Types
export interface Observation {
  uri: string;
  value: number;
  timestamp: string;
  unit?: string;
}

// Anomaly Types
export interface Anomaly {
  uri: string;
  detectedAt: string;
  severity: number;
  anomalyScore: number;
  equipmentId: string;
  equipmentName?: string;
  anomalyType: string;
}

export interface AnomalyResult {
  is_anomaly: boolean;
  anomaly_type: string;
  severity: number;
  anomaly_score: number;
  details: {
    equipment_type: string;
    anomalies_detected: AnomalyDetail[];
  };
}

export interface AnomalyDetail {
  type: string;
  indicator: string;
  value: number;
  threshold: number;
  severity: number;
}

// Energy Prediction Types
export interface EnergyPrediction {
  interval: number;
  time: string;
  value: number;
  confidence: number;
  unit: string;
}

export interface EnergyPredictionResult {
  targetDate: string;
  predictions: EnergyPrediction[];
  savedCount: number;
  intervalMinutes: number;
  totalIntervals: number;
}

// Maintenance Types
export interface MaintenanceSchedule {
  uri: string;
  scheduledDate: string;
  completedDate?: string;
  equipmentId: string;
  equipmentName?: string;
  failureMode?: string;
}

export interface MaintenanceRecommendation {
  equipmentId: string;
  equipmentName: string;
  currentHealthScore: number;
  maintenanceType: string;
  scheduledDate: string;
  priority: 'high' | 'medium' | 'low';
  reasoning: string;
}

// Ontology Types
export interface OntologyClass {
  uri: string;
  name: string;
}

export interface GraphNode {
  id: string;
  uri: string;
  labels: string[];
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// API Response Types
export interface ApiResponse<T> {
  status: 'success' | 'error';
  data?: T;
  message?: string;
  count?: number;
}

// Stats Types
export interface OntologyStats {
  totalEquipment: number;
  totalSensors: number;
  totalAnomalies: number;
  averageHealthScore: number;
  equipmentByType: Record<string, number>;
  sensorByType: Record<string, number>;
  healthDistribution: {
    Normal: number;
    Warning: number;
    Critical: number;
  };
}

// Process Flow Types
export interface ProcessFlowNode {
  id: string;
  name: string;
  nameKo?: string;
  type: string;
  healthScore?: number;
  status?: string;
  areaId?: string;
}

export interface ProcessFlowEdge {
  source: string;
  target: string;
  type: string;
}

export interface ProcessFlowData {
  nodes: ProcessFlowNode[];
  edges: ProcessFlowEdge[];
}

export interface ProcessArea {
  areaId: string;
  name: string;
  nameKo: string;
  order: number;
}

// Health Status Type
export type HealthStatus = 'Normal' | 'Warning' | 'Critical';
