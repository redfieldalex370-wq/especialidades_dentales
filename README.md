# Especialidades Dentales · Frontend operativo

Base en Vite + React + TypeScript para extender el portal existente de Green Chimp.

## Ejecutar

```bash
npm install
npm run dev
```

Abre la URL que muestre Vite, normalmente `http://localhost:5173`.

## Conectar Supabase

1. Copia `.env.example` a `.env`.
2. En Supabase abre **Connect / API Keys**.
3. Coloca Project URL y Publishable key:

```env
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxx
```

4. Reinicia `npm run dev` después de editar `.env`.
5. En la app entra a **Automatización** y pulsa **Probar Supabase**.

No uses `service_role` ni secret keys en variables `VITE_*`.

## CRM real de Especialidades Dentales

El frontend ya queda fijado a la estructura vigente:

- `company_key = 'especialidades-dentales'`
- `crm_leads`: pacientes/leads.
- `crm_pipeline_stages`: columnas del kanban.
- `crm_company_members`: permisos/usuarios de la empresa.

Toda búsqueda de pacientes agrega el filtro `company_key` además de `wa_id`.

### Pipeline confirmado

1. `contactos_nuevos` · Contactos nuevos · automático
2. `preguntaron_fechas` · Preguntaron por fechas · automático
3. `valoracion_agendada` · Valoración agendada · automático
4. `asistio_valoracion` · Asistió a valoración · manual
5. `canalizado_especialista` · Canalizado con especialista · manual
6. `tratamiento_agendado` · Tratamiento agendado · manual
7. `cita_cancelada` · Cita cancelada / seguimiento · automático

La lista anterior vive en `src/services/crm.ts` como fallback confirmado. La fuente primaria en ejecución es `crm_pipeline_stages`.

## Archivos clave

- `src/lib/supabase.ts`: cliente único de Supabase.
- `src/services/crm.ts`: configuración real del CRM, búsquedas por `wa_id`, listado de leads y pipeline.
- `src/services/supabase.ts`: prueba individual de acceso a las tres tablas.
- `src/services/n8n.ts`: integración aislada con el agendador n8n.

## Siguiente integración

El proyecto todavía usa pacientes demo en las vistas operativas. Para reemplazarlos con datos reales necesitamos mapear las columnas vivas de `crm_leads` que representan nombre, teléfono, etapa y cualquier timestamp relevante; no se usa la versión vieja de `schema.sql` como fuente para ese mapeo.
