/**
 * Axiom and Constraint Types
 */

export interface Axiom {
  axiomId: string;
  type: string;
  name: string;
  description: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  [key: string]: any;
}

export interface AxiomViolation {
  nodeId: string | null;
  description: string;
  details: Record<string, any>;
}

export interface AxiomCheckResult {
  axiomId: string;
  axiomName: string;
  passed: boolean;
  violationCount: number;
  violations: AxiomViolation[];
  checkedAt: string;
}

export interface AxiomCheckAllResult {
  status: string;
  totalAxioms: number;
  passedAxioms: number;
  failedAxioms: number;
  totalViolations: number;
  results: Array<{
    axiomId: string;
    axiomName: string;
    passed: boolean;
    violationCount: number;
    violations: AxiomViolation[];
  }>;
  checkedAt: string;
}
