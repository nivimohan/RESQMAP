import Navbar from './components/Navbar';
import CesiumViewer from './components/CesiumViewer';
import MetricsSidebar from './components/MetricsSidebar';

export default function App() {
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-white">
      {/* Top Navigation */}
      <Navbar />

      {/* Main Workspace: Split Screen */}
      <div className="flex flex-1 min-h-0">
        {/* 3D Globe — 70% */}
        <main className="flex-[7] relative min-w-0">
          <CesiumViewer />
        </main>

        {/* Telemetry Sidebar — 30% */}
        <div className="flex-[3] min-w-[320px] max-w-[440px]">
          <MetricsSidebar />
        </div>
      </div>
    </div>
  );
}
