import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import { ConnectionProvider } from './contexts/ConnectionContext';
import { ToastProvider } from './components/Toast';

// Lazy load pages
const Connections = lazy(() => import('./pages/Connections'));
const Core = lazy(() => import('./pages/Core'));
const JetStream = lazy(() => import('./pages/JetStream'));
const KV = lazy(() => import('./pages/KV'));
const ObjectStore = lazy(() => import('./pages/ObjectStore'));
const Services = lazy(() => import('./pages/Services'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Cluster = lazy(() => import('./pages/Cluster'));

const LoadingFallback = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.5 }}>
    <div className="skeleton" style={{ width: '100%', height: '100%', borderRadius: 'var(--radius)' }} />
  </div>
);

function App() {
  return (
    <ConnectionProvider>
      <ToastProvider>
        <BrowserRouter>
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/connections" element={<Connections />} />
                <Route path="/cluster" element={<Cluster />} />
                <Route path="/core" element={<Core />} />
                <Route path="/jetstream" element={<JetStream />} />
                <Route path="/kv" element={<KV />} />
                <Route path="/object-store" element={<ObjectStore />} />
                <Route path="/services" element={<Services />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ToastProvider>
    </ConnectionProvider>
  );
}

export default App;
