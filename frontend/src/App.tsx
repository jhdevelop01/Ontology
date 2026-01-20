import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import EquipmentList from './pages/EquipmentList';
import AnomalyMonitor from './pages/AnomalyMonitor';
import EnergyPrediction from './pages/EnergyPrediction';
import OntologyExplorer from './pages/OntologyExplorer';
import './App.css';

const NavLink: React.FC<{ to: string; children: React.ReactNode }> = ({ to, children }) => {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Link
      to={to}
      className={`nav-link ${isActive ? 'active' : ''}`}
    >
      {children}
    </Link>
  );
};

const Navigation: React.FC = () => {
  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <Link to="/" className="brand-link">
          UPW Predictive Maintenance
        </Link>
      </div>
      <div className="navbar-menu">
        <NavLink to="/">Dashboard</NavLink>
        <NavLink to="/equipment">Equipment</NavLink>
        <NavLink to="/anomaly">Anomaly Monitor</NavLink>
        <NavLink to="/energy">Energy Prediction</NavLink>
        <NavLink to="/ontology">Ontology Explorer</NavLink>
      </div>
    </nav>
  );
};

const App: React.FC = () => {
  return (
    <Router>
      <div className="app">
        <Navigation />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/equipment" element={<EquipmentList />} />
            <Route path="/anomaly" element={<AnomalyMonitor />} />
            <Route path="/energy" element={<EnergyPrediction />} />
            <Route path="/ontology" element={<OntologyExplorer />} />
          </Routes>
        </main>
        <footer className="footer">
          <p>UPW Predictive Maintenance System - Powered by Ontology</p>
        </footer>
      </div>
    </Router>
  );
};

export default App;
