/**
 * Constraint Types
 */

export interface Constraint {
  constraintId: string;
  type: string;
  name: string;
  description: string;
  nodeType?: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  [key: string]: any;
}

export interface ConstraintViolation {
  nodeId: string | null;
  description: string;
  details: Record<string, any>;
}

export interface ConstraintCheckResult {
  constraintId: string;
  constraintName: string;
  passed: boolean;
  violationCount: number;
  violations: ConstraintViolation[];
  checkedAt: string;
}

export interface ConstraintCheckAllResult {
  status: string;
  totalConstraints: number;
  passedConstraints: number;
  failedConstraints: number;
  totalViolations: number;
  results: Array<{
    constraintId: string;
    constraintName: string;
    passed: boolean;
    violationCount: number;
    violations: ConstraintViolation[];
  }>;
  checkedAt: string;
}
