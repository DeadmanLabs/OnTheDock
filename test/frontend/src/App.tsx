import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { SocketProvider } from './contexts/SocketContext';
import { DockerProvider } from './contexts/DockerContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Containers from './pages/Containers';
import ContainerDetail from './pages/ContainerDetail';
import Images from './pages/Images';
import CreateContainer from './pages/CreateContainer';

function App() {
  return (
    <Router>
      <SocketProvider>
        <DockerProvider>
          <Toaster 
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#363636',
                color: '#fff',
              },
            }}
          />
          <Layout>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/containers" element={<Containers />} />
              <Route path="/containers/:id" element={<ContainerDetail />} />
              <Route path="/containers/create" element={<CreateContainer />} />
              <Route path="/images" element={<Images />} />
            </Routes>
          </Layout>
        </DockerProvider>
      </SocketProvider>
    </Router>
  );
}

export default App;