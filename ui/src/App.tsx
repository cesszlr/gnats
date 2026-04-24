import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Connections from './pages/Connections';
import Core from './pages/Core';
import JetStream from './pages/JetStream';
import KV from './pages/KV';
import ObjectStore from './pages/ObjectStore';
import Services from './pages/Services';
import Dashboard from './pages/Dashboard';
import { ConnectionProvider } from './contexts/ConnectionContext';

function App() {
  return (
    <ConnectionProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/connections" element={<Connections />} />
            <Route path="/core" element={<Core />} />
            <Route path="/jetstream" element={<JetStream />} />
            <Route path="/kv" element={<KV />} />
            <Route path="/object-store" element={<ObjectStore />} />
            <Route path="/services" element={<Services />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ConnectionProvider>
  );
}

export default App;
