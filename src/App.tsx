import { useEffect, useMemo, useState } from 'react'
import { Sidebar, type ViewKey } from './components/Sidebar'
import { initialPatients } from './data/mockData'
import { AutomationView } from './views/AutomationView'
import { DashboardView } from './views/DashboardView'
import { PatientView } from './views/PatientView'
import { WaitingRoomView } from './views/WaitingRoomView'
import type { CrmLead, CrmLeadDetail, CrmStage, Patient } from './types'
import {
  DENTAL_PIPELINE_FALLBACK,
  getDentalLeadDetail,
  getDentalPipelineStages,
  listDentalCrmLeads,
  updateDentalLeadStage,
} from './services/crm'

export default function App() {
  const [view, setView] = useState<ViewKey>('dashboard')
  const [patients, setPatients] = useState<Patient[]>(initialPatients)
  const [crmLeads, setCrmLeads] = useState<CrmLead[]>([])
  const [crmStages, setCrmStages] = useState<CrmStage[]>(DENTAL_PIPELINE_FALLBACK)
  const [selectedLeadId, setSelectedLeadId] = useState('')
  const [crmLoading, setCrmLoading] = useState(true)
  const [crmError, setCrmError] = useState('')
  const [pipelineSource, setPipelineSource] = useState<'supabase' | 'fallback'>('fallback')
  const [pipelineWarning, setPipelineWarning] = useState('')
  const [movingLeadId, setMovingLeadId] = useState('')
  const [leadDetail, setLeadDetail] = useState<CrmLeadDetail | null>(null)
  const [leadDetailLoading, setLeadDetailLoading] = useState(false)
  const [leadDetailError, setLeadDetailError] = useState('')

  async function loadCrm() {
    setCrmLoading(true)
    setCrmError('')

    try {
      const [leadRows, pipeline] = await Promise.all([listDentalCrmLeads(200), getDentalPipelineStages()])
      setCrmLeads(leadRows)
      setCrmStages(pipeline.stages)
      setPipelineSource(pipeline.source)
      setPipelineWarning(pipeline.warning ?? '')
    } catch (error) {
      setCrmError(error instanceof Error ? error.message : 'No se pudo cargar el CRM desde Supabase.')
      setCrmStages(DENTAL_PIPELINE_FALLBACK)
      setPipelineSource('fallback')
    } finally {
      setCrmLoading(false)
    }
  }

  useEffect(() => {
    void loadCrm()
  }, [])

  const selectedLead = useMemo(
    () => crmLeads.find((lead) => lead.id === selectedLeadId) ?? null,
    [crmLeads, selectedLeadId],
  )

  useEffect(() => {
    if (!selectedLeadId) {
      setLeadDetail(null)
      setLeadDetailError('')
      return
    }

    let cancelled = false

    async function loadLeadDetail() {
      setLeadDetailLoading(true)
      setLeadDetailError('')

      try {
        const detail = await getDentalLeadDetail(selectedLeadId)
        if (!cancelled) setLeadDetail(detail)
      } catch (error) {
        if (!cancelled) {
          setLeadDetail(null)
          setLeadDetailError(error instanceof Error ? error.message : 'No se pudo cargar la ficha del paciente.')
        }
      } finally {
        if (!cancelled) setLeadDetailLoading(false)
      }
    }

    void loadLeadDetail()
    return () => {
      cancelled = true
    }
  }, [selectedLeadId])

  async function handleMoveLead(leadId: string, stageKey: string) {
    const lead = crmLeads.find((item) => item.id === leadId)
    const stage = crmStages.find((item) => item.stage_key === stageKey)
    if (!lead || !stage || lead.stageKey === stageKey) return

    const previous = lead
    const optimistic: CrmLead = {
      ...lead,
      stageKey,
      stageLocked: stage.movement_mode === 'manual',
      stageOrigin: 'admin',
      updatedAt: new Date().toISOString(),
    }

    setMovingLeadId(leadId)
    setCrmLeads((current) => current.map((item) => (item.id === leadId ? optimistic : item)))

    try {
      const saved = await updateDentalLeadStage({
        leadId,
        stageKey,
        movementMode: stage.movement_mode,
      })
      setCrmLeads((current) => current.map((item) => (item.id === leadId ? saved : item)))
      setCrmError('')
    } catch (error) {
      setCrmLeads((current) => current.map((item) => (item.id === leadId ? previous : item)))
      setCrmError(error instanceof Error ? error.message : 'No se pudo mover la tarjeta.')
    } finally {
      setMovingLeadId('')
    }
  }

  function openLead(leadId: string) {
    setSelectedLeadId(leadId)
    setView('patient')
  }

  const topbarLabel = crmLoading
    ? 'Sincronizando'
    : `${crmLeads.length} pacientes en CRM`

  return (
    <div className="app-shell">
      <Sidebar active={view} onChange={setView} />
      <main className="main-area">
        <header className="topbar">
          <div>
            <span className="topbar-kicker">Especialidades Dentales</span>
            <strong>CRM de citas y seguimiento</strong>
          </div>
          <div className="topbar-actions">
            <button className="date-chip date-chip-button" onClick={() => void loadCrm()} disabled={crmLoading}>
              {topbarLabel}
            </button>
            <div className="user-avatar">ED</div>
          </div>
        </header>

        <div className="content-wrap">
          {view === 'dashboard' && (
            <DashboardView
              leads={crmLeads}
              stages={crmStages}
              loading={crmLoading}
              error={crmError}
              pipelineSource={pipelineSource}
              pipelineWarning={pipelineWarning}
              movingLeadId={movingLeadId}
              onMoveLead={handleMoveLead}
              onOpenLead={openLead}
              onRefresh={() => void loadCrm()}
            />
          )}
          {view === 'waiting' && <WaitingRoomView patients={patients} setPatients={setPatients} />}
          {view === 'patient' && (
            <PatientView
              lead={selectedLead}
              leads={crmLeads}
              detail={leadDetail}
              detailLoading={leadDetailLoading}
              detailError={leadDetailError}
              stages={crmStages}
              movingLeadId={movingLeadId}
              onMoveLead={handleMoveLead}
              onOpenLead={openLead}
              onBackToCrm={() => setView('dashboard')}
            />
          )}
          {view === 'automation' && <AutomationView />}
        </div>
      </main>
    </div>
  )
}
