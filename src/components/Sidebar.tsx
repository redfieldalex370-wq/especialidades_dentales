export type ViewKey = 'dashboard' | 'waiting' | 'patient' | 'automation'

interface SidebarProps {
  active: ViewKey
  onChange: (view: ViewKey) => void
}

const items: Array<{ key: ViewKey; label: string; icon: string }> = [
  { key: 'dashboard', label: 'CRM', icon: '⌂' },
  { key: 'waiting', label: 'Sala de espera', icon: '◷' },
  { key: 'patient', label: 'Ficha paciente', icon: '▤' },
  { key: 'automation', label: 'Automatizacion', icon: '⚙' },
]

export function Sidebar({ active, onChange }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">GC</div>
        <div>
          <strong>Green Chimp</strong>
          <span>Dental Ops</span>
        </div>
      </div>

      <nav className="nav-list" aria-label="Navegacion principal">
        {items.map((item) => (
          <button
            key={item.key}
            className={active === item.key ? 'nav-item active' : 'nav-item'}
            onClick={() => onChange(item.key)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="doctor-chip">
          <span className="presence-dot" />
          <div>
            <strong>Consultorio</strong>
            <span>Operacion activa</span>
          </div>
        </div>
      </div>
    </aside>
  )
}
