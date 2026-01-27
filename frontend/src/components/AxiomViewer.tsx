import React, { useState } from 'react';
import { Axiom } from '../types/axiom.types';

interface CheckResult {
  passed: boolean;
  violationCount: number;
  violations: Array<{
    nodeId: string | null;
    description: string;
    details: Record<string, any>;
  }>;
  checkedAt: string;
}

interface AxiomViewerProps {
  axiom: Axiom;
  onCheck: (axiomId: string) => void;
  isLoading?: boolean;
  checkResult?: CheckResult | null;
}

const AxiomViewer: React.FC<AxiomViewerProps> = ({ axiom, onCheck, isLoading = false, checkResult }) => {
  const [showViolations, setShowViolations] = useState(false);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'Critical':
        return '#d32f2f';
      case 'High':
        return '#f57c00';
      case 'Medium':
        return '#fbc02d';
      case 'Low':
        return '#388e3c';
      default:
        return '#757575';
    }
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'DisjointClasses': '분리 클래스',
      'PropertyDomain': '속성 도메인',
      'InverseProperty': '역속성',
      'TransitiveProperty': '전이적 속성',
      'FunctionalProperty': '함수적 속성',
      'PropertyRange': '속성 범위'
    };
    return labels[type] || type;
  };

  return (
    <div
      style={{
        border: `2px solid ${checkResult ? (checkResult.passed ? '#4caf50' : '#f44336') : getSeverityColor(axiom.severity)}`,
        borderRadius: '8px',
        padding: '15px',
        backgroundColor: '#ffffff',
        transition: 'border-color 0.3s ease'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
        <div>
          <span
            style={{
              display: 'inline-block',
              padding: '3px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 'bold',
              backgroundColor: getSeverityColor(axiom.severity),
              color: '#ffffff',
              marginRight: '8px'
            }}
          >
            {axiom.severity}
          </span>
          <span
            style={{
              display: 'inline-block',
              padding: '3px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              backgroundColor: '#e3f2fd',
              color: '#1976d2'
            }}
          >
            {getTypeLabel(axiom.type)}
          </span>
        </div>
        <span style={{ fontSize: '12px', color: '#666', fontFamily: 'monospace' }}>{axiom.axiomId}</span>
      </div>

      <h4 style={{ margin: '10px 0', fontSize: '16px', color: '#333' }}>{axiom.name}</h4>
      <p style={{ fontSize: '13px', color: '#666', lineHeight: '1.5', marginBottom: '15px' }}>{axiom.description}</p>

      {/* Check Result Display */}
      {checkResult && (
        <div
          style={{
            padding: '12px',
            borderRadius: '6px',
            marginBottom: '15px',
            backgroundColor: checkResult.passed ? '#e8f5e9' : '#ffebee',
            border: `1px solid ${checkResult.passed ? '#4caf50' : '#f44336'}`
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '20px', marginRight: '8px' }}>
              {checkResult.passed ? '✓' : '✗'}
            </span>
            <span style={{
              fontWeight: 'bold',
              color: checkResult.passed ? '#2e7d32' : '#c62828',
              fontSize: '14px'
            }}>
              {checkResult.passed ? '검증 통과' : `위반 ${checkResult.violationCount}건 발견`}
            </span>
          </div>

          {!checkResult.passed && checkResult.violations.length > 0 && (
            <>
              <button
                onClick={() => setShowViolations(!showViolations)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#c62828',
                  cursor: 'pointer',
                  fontSize: '13px',
                  padding: '4px 0',
                  textDecoration: 'underline'
                }}
              >
                {showViolations ? '위반 상세 숨기기 ▲' : '위반 상세 보기 ▼'}
              </button>

              {showViolations && (
                <div style={{ marginTop: '10px' }}>
                  {checkResult.violations.slice(0, 5).map((violation, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '8px',
                        backgroundColor: '#ffffff',
                        borderLeft: '3px solid #f44336',
                        marginBottom: '6px',
                        fontSize: '12px'
                      }}
                    >
                      <div style={{ marginBottom: '4px' }}>
                        <strong>노드:</strong> {violation.nodeId || 'N/A'}
                      </div>
                      <div style={{ color: '#666' }}>{violation.description}</div>
                      {violation.details && Object.keys(violation.details).length > 0 && (
                        <div style={{ marginTop: '4px', fontSize: '11px', color: '#888' }}>
                          {Object.entries(violation.details)
                            .filter(([key]) => key !== 'nodeId')
                            .slice(0, 3)
                            .map(([key, value]) => (
                              <div key={key}>
                                <strong>{key}:</strong> {JSON.stringify(value)}
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {checkResult.violations.length > 5 && (
                    <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                      ... 외 {checkResult.violations.length - 5}건
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <div style={{ fontSize: '11px', color: '#888', marginTop: '8px' }}>
            검증 시간: {new Date(checkResult.checkedAt).toLocaleString('ko-KR')}
          </div>
        </div>
      )}

      <button
        onClick={() => onCheck(axiom.axiomId)}
        disabled={isLoading}
        style={{
          width: '100%',
          padding: '10px',
          backgroundColor: isLoading ? '#999' : '#1976d2',
          color: '#ffffff',
          border: 'none',
          borderRadius: '4px',
          cursor: isLoading ? 'not-allowed' : 'pointer',
          fontSize: '14px',
          fontWeight: 'bold',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px'
        }}
        onMouseOver={(e) => !isLoading && (e.currentTarget.style.backgroundColor = '#1565c0')}
        onMouseOut={(e) => !isLoading && (e.currentTarget.style.backgroundColor = '#1976d2')}
      >
        {isLoading ? (
          <>
            <span style={{
              display: 'inline-block',
              width: '14px',
              height: '14px',
              border: '2px solid #fff',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
            검증 중...
          </>
        ) : (
          checkResult ? '재검증' : '검증'
        )}
      </button>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default AxiomViewer;
