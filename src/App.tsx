import { MapView } from './components/MapView'
import { RobotDetail } from './components/RobotDetail'
import { RobotList } from './components/RobotList'
import { StatCards } from './components/StatCards'
import { TopBar } from './components/TopBar'
import { TrendChart } from './components/TrendChart'

export function App() {
  return (
    <div className="flex h-full flex-col bg-slate-100">
      <TopBar />
      <main className="grid flex-1 gap-3 overflow-auto p-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* left column: map + trend */}
        <div className="flex min-w-0 flex-col gap-3">
          <MapView />
          <TrendChart />
        </div>

        {/* right column: current values + find + detail */}
        <div className="flex min-h-0 flex-col gap-3">
          <StatCards />
          <div className="min-h-[240px] flex-1">
            <RobotList />
          </div>
          <RobotDetail />
        </div>
      </main>
    </div>
  )
}
