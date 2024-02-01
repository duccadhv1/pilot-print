/* eslint-disable import/order */
import { Route, MemoryRouter as Router, Routes } from 'react-router-dom';
import icon from '../../assets/icon.svg';
import './App.css';

function Hello() {
  return (
    <div id="print-iframe">
      <div className="Hello">
        <img width="200" alt="icon" src={icon} />
      </div>
      <h1>OtterSg Printer Proxy</h1>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Hello />} />
      </Routes>
    </Router>
  );
}
