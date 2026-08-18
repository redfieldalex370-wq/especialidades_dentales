import { useEffect, useMemo, useState } from 'react'
import { Sidebar, type ViewKey } from './components/Sidebar'
import { AutomationView } from './views/AutomationView'
import { DashboardView } from './views/DashboardView'
import { PatientView } from './views/PatientView'
import { WaitingRoomView } from './views/WaitingRoomView'
import type { CalendarAppointment, CrmLead, CrmLeadDetail, CrmStage, DentalLeadDetailUpdate, KioskFlow, KioskLeadStatus } from './types'
import {
  createDentalWalkInLead,
  DENTAL_PIPELINE_FALLBACK,
  getDentalLeadDetail,
  getDentalPipelineStages,
  listDentalCrmLeads,
  updateDentalLeadDetail,
  updateDentalLeadKioskState,
  updateDentalLeadStage,
} from './services/crm'
import { isGoogleCalendarConfigured, listCalendarAppointments } from './services/googleCalendar'

export default function App() {
  const [view, setView] = useState<ViewKey>('dashboard')
  const companyKey = 'especialidades-dentales'
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
  const [calendarAppointments, setCalendarAppointments] = useState<CalendarAppointment[]>([])
  const [calendarLoading, setCalendarLoading] = useState(false)
  const [calendarError, setCalendarError] = useState('')

  async function loadLeadDetail(leadId: string) {
    setLeadDetailLoading(true)
    setLeadDetailError('')

    try {
      const detail = await getDentalLeadDetail(leadId, companyKey)
      setLeadDetail(detail)
    } catch (error) {
      setLeadDetail(null)
      setLeadDetailError(error instanceof Error ? error.message : 'No se pudo cargar la ficha del paciente.')
    } finally {
      setLeadDetailLoading(false)
    }
  }

  async function loadCrm() {
    setCrmLoading(true)
    setCrmError('')

    try {
      const [leadRows, pipeline] = await Promise.all([listDentalCrmLeads(200, companyKey), getDentalPipelineStages(companyKey)])
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

  async function loadCalendar(leads: CrmLead[]) {
    if (!isGoogleCalendarConfigured) {
      setCalendarAppointments([])
      setCalendarError('Google Calendar no está configurado todavía.')
      return
    }

    setCalendarLoading(true)
    setCalendarError('')

    try {
      const items = await listCalendarAppointments(leads)
      setCalendarAppointments(items)
    } catch (error) {
      setCalendarAppointments([])
      setCalendarError(error instanceof Error ? error.message : 'No se pudo leer Google Calendar.')
    } finally {
      setCalendarLoading(false)
    }
  }

  useEffect(() => {
    void loadCrm()
  }, [])

  useEffect(() => {
    if (crmLeads.length > 0) {
      void loadCalendar(crmLeads)
    } else if (isGoogleCalendarConfigured) {
      void loadCalendar([])
    }
  }, [crmLeads])

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadCrm()
      void loadCalendar(crmLeads)
      if (selectedLeadId) {
        void loadLeadDetail(selectedLeadId)
      }
    }, 30_000)

    return () => window.clearInterval(timer)
  }, [selectedLeadId, crmLeads])

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

    async function run() {
      setLeadDetailLoading(true)
      setLeadDetailError('')

      try {
        const detail = await getDentalLeadDetail(selectedLeadId, companyKey)
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

    void run()
    return () => {
      cancelled = true
    }
  }, [selectedLeadId])

  async function handleSaveLeadDetail(leadId: string, input: DentalLeadDetailUpdate) {
    const lead = crmLeads.find((item) => item.id === leadId)
    if (!lead) throw new Error('No encontramos el lead que quieres editar.')

    await updateDentalLeadDetail(lead, input)
    await Promise.all([loadCrm(), loadLeadDetail(leadId)])
  }

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
        companyKey,
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

  async function handleUpdateKioskStatus(leadId: string, kioskStatus: KioskLeadStatus, kioskFlow?: KioskFlow) {
    const lead = crmLeads.find((item) => item.id === leadId)
    if (!lead) throw new Error('No encontramos al paciente que quieres mover en kiosko.')

    const saved = await updateDentalLeadKioskState({
      lead,
      companyKey,
      kioskStatus,
      kioskFlow,
      arrivalAt: kioskStatus === 'pendiente' ? '' : lead.arrivalAt || new Date().toISOString(),
    })

    setCrmLeads((current) => current.map((item) => (item.id === leadId ? saved : item)))

    if (selectedLeadId === leadId) {
      await loadLeadDetail(leadId)
    }
  }

  async function handleRegisterWalkIn(name: string, phone: string) {
    const digits = phone.replace(/\D/g, '')
    const existing = crmLeads.find((item) => {
      const haystack = `${item.phone} ${item.waId}`.replace(/\D/g, '')
      return digits && haystack.includes(digits)
    })

    if (existing) {
      const saved = await updateDentalLeadKioskState({
        lead: existing,
        companyKey,
        kioskStatus: 'en_espera',
        kioskFlow: 'sin_cita',
      })
      setCrmLeads((current) => current.map((item) => (item.id === existing.id ? saved : item)))
      return saved
    }

    const created = await createDentalWalkInLead({
      companyKey,
      name,
      phone,
    })

    setCrmLeads((current) => [created, ...current])
    return created
  }

  function openLead(leadId: string) {
    setSelectedLeadId(leadId)
    setView('patient')
  }

  const topbarLabel = crmLoading ? 'Sincronizando' : `${crmLeads.length} pacientes en CRM`

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
              calendarAppointments={calendarAppointments}
              calendarLoading={calendarLoading}
              calendarError={calendarError}
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
          {view === 'waiting' && (
            <WaitingRoomView
              leads={crmLeads}
              calendarAppointments={calendarAppointments}
              calendarLoading={calendarLoading}
              loading={crmLoading}
              onRefresh={() => void loadCrm()}
              onOpenLead={openLead}
              onRegisterWalkIn={handleRegisterWalkIn}
              onUpdateLeadStatus={handleUpdateKioskStatus}
            />
          )}
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
              onSaveDetail={handleSaveLeadDetail}
              onUpdateKioskStatus={handleUpdateKioskStatus}
            />
          )}
          {view === 'automation' && <AutomationView />}
        </div>
      </main>
    </div>
  )
}
