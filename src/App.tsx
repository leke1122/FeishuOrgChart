import { Navigate, Route, Routes } from 'react-router-dom'
import { DiagnosisPage } from './pages/DiagnosisPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<DiagnosisPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
