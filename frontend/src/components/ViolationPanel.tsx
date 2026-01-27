import React, { useState } from 'react';
import { AxiomCheckAllResult } from '../types/axiom.types';
import { ConstraintCheckAllResult } from '../types/constraint.types';

interface ViolationPanelProps {
  axiomResults: AxiomCheckAllResult | null;
  constraintResults: ConstraintCheckAllResult | null;
}

const ViolationPanel: React.FC<ViolationPanelProps> = ({ axiomResults, constraintResults }) => {
  const [expandedAxioms, setExpandedAxioms] = useState<Set<string>>(new Set());
  const [expandedConstraints, setExpandedConstraints] = useState<Set<string>>(new Set());

  if (!axiomResults && !constraintResults) {
    return null;
  }

  const totalViolations = (axiomResults?.totalViolations || 0) + (constraintResults?.totalViolations || 0);

  const toggleAxiom = (axiomId: string) => {
    setExpandedAxioms(prev => {
      const newSet = new Set(prev);
      if (newSet.has(axiomId)) {
        newSet.delete(axiomId);
      } else {
        newSet.add(axiomId);
      }
      return newSet;
    });
  };

  const toggleConstraint = (constraintId: string) => {
    setExpandedConstraints(prev => {
      const newSet = new Set(prev);
      if (newSet.has(constraintId)) {
        newSet.delete(constraintId);
      } else {
        newSet.add(constraintId);
      }
      return newSet;
    });
  };

  return (
    <div style={{ marginTop: '30px', padding: '20px', backgroundColor: '#f9f9f9', borderRadius: '12px' }}>
      <h3 style={{ marginBottom: '20px', color: '#333', fontSize: '1.25rem', fontWeight: 600 }}>
        검증 결과 요약
      </h3>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '25px' }}>
        {axiomResults && (
          <>
            <div style={{
              padding: '15px',
              backgroundColor: '#e3f2fd',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#1976d2' }}>
                {axiomResults.totalAxioms}
              </div>
              <div style={{ fontSize: '13px', color: '#1565c0' }}>총 공리</div>
            </div>
            <div style={{
              padding: '15px',
              backgroundColor: axiomResults.passedAxioms > 0 ? '#e8f5e9' : '#f5f5f5',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#4caf50' }}>
                {axiomResults.passedAxioms}
              </div>
              <div style={{ fontSize: '13px', color: '#388e3c' }}>통과</div>
            </div>
            <div style={{
              padding: '15px',
              backgroundColor: axiomResults.failedAxioms > 0 ? '#ffebee' : '#f5f5f5',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: axiomResults.failedAxioms > 0 ? '#f44336' : '#999' }}>
                {axiomResults.failedAxioms}
              </div>
              <div style={{ fontSize: '13px', color: axiomResults.failedAxioms > 0 ? '#c62828' : '#666' }}>실패</div>
            </div>
          </>
        )}

        {constraintResults && (
          <>
            <div style={{
              padding: '15px',
              backgroundColor: '#f3e5f5',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#7b1fa2' }}>
                {constraintResults.totalConstraints}
              </div>
              <div style={{ fontSize: '13px', color: '#6a1b9a' }}>총 제약조건</div>
            </div>
            <div style={{
              padding: '15px',
              backgroundColor: constraintResults.passedConstraints > 0 ? '#e8f5e9' : '#f5f5f5',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#4caf50' }}>
                {constraintResults.passedConstraints}
              </div>
              <div style={{ fontSize: '13px', color: '#388e3c' }}>통과</div>
            </div>
            <div style={{
              padding: '15px',
              backgroundColor: constraintResults.failedConstraints > 0 ? '#ffebee' : '#f5f5f5',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: constraintResults.failedConstraints > 0 ? '#f44336' : '#999' }}>
                {constraintResults.failedConstraints}
              </div>
              <div style={{ fontSize: '13px', color: constraintResults.failedConstraints > 0 ? '#c62828' : '#666' }}>실패</div>
            </div>
          </>
        )}
      </div>

      {totalViolations === 0 ? (
        <div
          style={{
            padding: '30px',
            backgroundColor: '#e8f5e9',
            border: '2px solid #4caf50',
            borderRadius: '8px',
            textAlign: 'center'
          }}
        >
          <div style={{ fontSize: '48px', marginBottom: '10px' }}>✓</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#2e7d32' }}>모든 검증 통과!</div>
          <div style={{ fontSize: '14px', color: '#558b2f', marginTop: '8px' }}>
            공리 위반: 0건 | 제약조건 위반: 0건
          </div>
        </div>
      ) : (
        <>
          {/* Total Violations Alert */}
          <div
            style={{
              padding: '20px',
              backgroundColor: '#ffebee',
              border: '2px solid #f44336',
              borderRadius: '8px',
              marginBottom: '25px'
            }}
          >
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#c62828', marginBottom: '10px' }}>
              총 {totalViolations}건의 위반 발견
            </div>
            <div style={{ fontSize: '14px', color: '#d32f2f' }}>
              {axiomResults && `공리 위반: ${axiomResults.totalViolations}건`}
              {axiomResults && constraintResults && ' | '}
              {constraintResults && `제약조건 위반: ${constraintResults.totalViolations}건`}
            </div>
          </div>

          {/* Axiom Violations */}
          {axiomResults && axiomResults.totalViolations > 0 && (
            <div style={{ marginBottom: '25px' }}>
              <h4 style={{ marginBottom: '15px', color: '#1976d2', fontSize: '1.1rem', display: 'flex', alignItems: 'center' }}>
                <span style={{ marginRight: '8px' }}>📋</span>
                공리 위반 상세 ({axiomResults.failedAxioms}개 공리)
              </h4>
              {axiomResults.results
                .filter((r) => !r.passed)
                .map((result) => (
                  <div
                    key={result.axiomId}
                    style={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #ffcdd2',
                      borderRadius: '8px',
                      marginBottom: '12px',
                      overflow: 'hidden'
                    }}
                  >
                    <div
                      style={{
                        padding: '15px',
                        backgroundColor: '#fff3e0',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                      onClick={() => toggleAxiom(result.axiomId)}
                    >
                      <div>
                        <span style={{ fontWeight: 'bold', color: '#e65100', marginRight: '10px' }}>
                          {result.axiomId}
                        </span>
                        <span style={{ color: '#333' }}>{result.axiomName}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <span style={{
                          backgroundColor: '#f44336',
                          color: '#fff',
                          padding: '4px 12px',
                          borderRadius: '12px',
                          fontSize: '13px',
                          fontWeight: 'bold'
                        }}>
                          {result.violationCount}건 위반
                        </span>
                        <span style={{ color: '#666' }}>
                          {expandedAxioms.has(result.axiomId) ? '▲' : '▼'}
                        </span>
                      </div>
                    </div>

                    {expandedAxioms.has(result.axiomId) && (
                      <div style={{ padding: '15px' }}>
                        {result.violations.slice(0, 10).map((violation, vIdx) => (
                          <div
                            key={vIdx}
                            style={{
                              padding: '12px',
                              backgroundColor: '#fafafa',
                              borderLeft: '4px solid #ff9800',
                              marginBottom: '10px',
                              borderRadius: '0 4px 4px 0'
                            }}
                          >
                            <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center' }}>
                              <span style={{
                                backgroundColor: '#e3f2fd',
                                color: '#1976d2',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '12px',
                                fontWeight: 'bold',
                                marginRight: '10px'
                              }}>
                                노드
                              </span>
                              <code style={{ backgroundColor: '#f5f5f5', padding: '2px 6px', borderRadius: '3px', fontSize: '13px' }}>
                                {violation.nodeId || 'N/A'}
                              </code>
                            </div>
                            <div style={{ fontSize: '13px', color: '#666', marginBottom: '8px' }}>
                              {violation.description}
                            </div>
                            {violation.details && Object.keys(violation.details).length > 0 && (
                              <div style={{
                                backgroundColor: '#f5f5f5',
                                padding: '10px',
                                borderRadius: '4px',
                                fontSize: '12px'
                              }}>
                                <div style={{ fontWeight: 'bold', marginBottom: '6px', color: '#666' }}>상세 정보:</div>
                                {Object.entries(violation.details)
                                  .filter(([key]) => key !== 'nodeId')
                                  .map(([key, value]) => (
                                    <div key={key} style={{ marginBottom: '4px' }}>
                                      <span style={{ color: '#888' }}>{key}:</span>{' '}
                                      <span style={{ color: '#333' }}>
                                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                      </span>
                                    </div>
                                  ))}
                              </div>
                            )}
                          </div>
                        ))}
                        {result.violations.length > 10 && (
                          <div style={{
                            textAlign: 'center',
                            padding: '10px',
                            color: '#666',
                            fontSize: '13px',
                            backgroundColor: '#f5f5f5',
                            borderRadius: '4px'
                          }}>
                            ... 외 {result.violations.length - 10}건의 위반이 더 있습니다
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}

          {/* Constraint Violations */}
          {constraintResults && constraintResults.totalViolations > 0 && (
            <div>
              <h4 style={{ marginBottom: '15px', color: '#7b1fa2', fontSize: '1.1rem', display: 'flex', alignItems: 'center' }}>
                <span style={{ marginRight: '8px' }}>🔒</span>
                제약조건 위반 상세 ({constraintResults.failedConstraints}개 제약조건)
              </h4>
              {constraintResults.results
                .filter((r) => !r.passed)
                .map((result) => (
                  <div
                    key={result.constraintId}
                    style={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e1bee7',
                      borderRadius: '8px',
                      marginBottom: '12px',
                      overflow: 'hidden'
                    }}
                  >
                    <div
                      style={{
                        padding: '15px',
                        backgroundColor: '#f3e5f5',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                      onClick={() => toggleConstraint(result.constraintId)}
                    >
                      <div>
                        <span style={{ fontWeight: 'bold', color: '#7b1fa2', marginRight: '10px' }}>
                          {result.constraintId}
                        </span>
                        <span style={{ color: '#333' }}>{result.constraintName}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <span style={{
                          backgroundColor: '#9c27b0',
                          color: '#fff',
                          padding: '4px 12px',
                          borderRadius: '12px',
                          fontSize: '13px',
                          fontWeight: 'bold'
                        }}>
                          {result.violationCount}건 위반
                        </span>
                        <span style={{ color: '#666' }}>
                          {expandedConstraints.has(result.constraintId) ? '▲' : '▼'}
                        </span>
                      </div>
                    </div>

                    {expandedConstraints.has(result.constraintId) && (
                      <div style={{ padding: '15px' }}>
                        {result.violations.slice(0, 10).map((violation, vIdx) => (
                          <div
                            key={vIdx}
                            style={{
                              padding: '12px',
                              backgroundColor: '#fafafa',
                              borderLeft: '4px solid #9c27b0',
                              marginBottom: '10px',
                              borderRadius: '0 4px 4px 0'
                            }}
                          >
                            <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center' }}>
                              <span style={{
                                backgroundColor: '#f3e5f5',
                                color: '#7b1fa2',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '12px',
                                fontWeight: 'bold',
                                marginRight: '10px'
                              }}>
                                노드
                              </span>
                              <code style={{ backgroundColor: '#f5f5f5', padding: '2px 6px', borderRadius: '3px', fontSize: '13px' }}>
                                {violation.nodeId || 'N/A'}
                              </code>
                            </div>
                            <div style={{ fontSize: '13px', color: '#666', marginBottom: '8px' }}>
                              {violation.description}
                            </div>
                            {violation.details && Object.keys(violation.details).length > 0 && (
                              <div style={{
                                backgroundColor: '#f5f5f5',
                                padding: '10px',
                                borderRadius: '4px',
                                fontSize: '12px'
                              }}>
                                <div style={{ fontWeight: 'bold', marginBottom: '6px', color: '#666' }}>상세 정보:</div>
                                {Object.entries(violation.details)
                                  .filter(([key]) => key !== 'nodeId')
                                  .map(([key, value]) => (
                                    <div key={key} style={{ marginBottom: '4px' }}>
                                      <span style={{ color: '#888' }}>{key}:</span>{' '}
                                      <span style={{ color: '#333' }}>
                                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                      </span>
                                    </div>
                                  ))}
                              </div>
                            )}
                          </div>
                        ))}
                        {result.violations.length > 10 && (
                          <div style={{
                            textAlign: 'center',
                            padding: '10px',
                            color: '#666',
                            fontSize: '13px',
                            backgroundColor: '#f5f5f5',
                            borderRadius: '4px'
                          }}>
                            ... 외 {result.violations.length - 10}건의 위반이 더 있습니다
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}

          {/* Validation Time */}
          {(axiomResults?.checkedAt || constraintResults?.checkedAt) && (
            <div style={{
              marginTop: '20px',
              padding: '10px 15px',
              backgroundColor: '#f5f5f5',
              borderRadius: '6px',
              fontSize: '12px',
              color: '#666',
              textAlign: 'right'
            }}>
              검증 완료: {new Date(axiomResults?.checkedAt || constraintResults?.checkedAt || '').toLocaleString('ko-KR')}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ViolationPanel;
