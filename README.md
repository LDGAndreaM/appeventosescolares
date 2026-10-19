# Aforo · Registro de eventos escolares

Plataforma para dar de alta eventos escolares, su programa (talleres, conferencias, conciertos, comidas…),
participantes con paquetes y abonos, asistencia por QR y constancias. Implementa el diseño
**Plataforma Eventos v2** de Claude Design.

**Stack:** React 19 + Vite + TypeScript · Supabase (Postgres, Auth, Storage, Edge Functions) · React Query.

## Pantallas

| Diseño | Ruta | Qué hace |
| --- | --- | --- |
| 1a | `/entrar` | Iniciar sesión / crear cuenta / recuperar contraseña |
| 1b | `/eventos` | Mis eventos (como creador/a o administrador/a) |
| 1c | `/eventos/nuevo`, `…/ajustes` | Datos, logo, paleta (6 + HEX), fechas, horario por día, registro público |
| 1d | `/evento/:id/resumen` | Personas, recaudado, saldos, ocupación de talleres, perfil de participantes |
| 1e | `…/administradores` | Invitar con contraseña temporal, permiso *Acceso completo* o *Registro y pagos* |
| 1f | `…/paquetes` | Paquetes con precio, beneficios y número de talleres a elegir |
| 1g | `…/programa` | Alta de actividades con cupo, aviso de simultáneas y paquetes que las incluyen |
| 1h–1j | `…/calendario?vista=itinerario\|dia\|semana\|mes` | Itinerario, día, semana con carriles y mes |
| 1k / 1l | `…/participantes`, `…/participantes/:id` | Roles, perfil escolar (carrera/semestre), paquete, abonos y talleres simultáneos |
| 1m / 1p | `…/pagos` | Abonos con fecha y método; fecha de liquidación automática |
| 1n | `/r/:slug` | Registro público en 3 pasos (datos, paquete, talleres) |
| 1o | `/r/:slug/itinerario` | Itinerario público por día |
| 2a | `…/asistencia/:actividad` | QR por actividad, descarga PNG/JPG, proyección, horario del QR, marcar a mano |
| 2b | (diálogo) | Aviso de cupo lleno con alternativas del mismo horario o lista de espera |
| 2c | `/a/:codigo` | El asistente escanea el QR y confirma con su correo |
| 3a | `…/constancias` | Por actividad o general (solo a quien asistió) y **por rol** (organizadores, colaboradores, staff, talleristas, ponentes…); plantilla, firmas, PDF y correo |
| 3b | `…/exportar` | Participantes, pagos, asistencia y constancias en Excel (.xlsx) o CSV |
| — | `/c/:folio` | Verificación pública de la constancia (destino de su QR) y descarga en PDF |

Las reglas importantes viven en la base de datos: el cupo se valida con un trigger (`ACTIVITY_FULL`),
la fecha de liquidación se calcula con los abonos, y las políticas RLS separan eventos y permisos
(*Registro y pagos* no puede editar programa, paquetes ni paleta; solo quien creó el evento lo elimina o quita administradores).

## Puesta en marcha

1. Crea un proyecto en [Supabase](https://supabase.com) y aplica la migración:
   ```bash
   npx supabase link --project-ref <tu-ref>
   npx supabase db push        # aplica supabase/migrations/*.sql
   ```
2. Despliega las funciones (invitar administradores y enviar correos):
   ```bash
   npx supabase functions deploy invite-admin
   npx supabase functions deploy send-mail
   npx supabase secrets set RESEND_API_KEY=re_xxx MAIL_FROM="Aforo <no-reply@tu-dominio.mx>" APP_URL=https://tu-app.mx
   ```
   Sin `RESEND_API_KEY` todo funciona excepto el envío de correos: al invitar a un administrador la app
   muestra los datos de acceso para compartirlos a mano, y las constancias se pueden descargar en PDF.
3. En Supabase → Authentication → URL Configuration agrega `https://tu-app.mx/restablecer` como URL de redirección.
4. Front-end:
   ```bash
   cp .env.example .env.local   # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_PUBLIC_URL
   npm install
   npm run dev
   ```
   `npm run build` genera `dist/` (sitio estático; configura el hosting para redirigir todas las rutas a `index.html`).

## Estructura

```
supabase/migrations/   esquema, RLS, triggers y funciones públicas (registro, check-in, verificación)
supabase/functions/    invite-admin, send-mail (Resend)
src/lib/               cliente, consultas, formato, calendario, QR, constancias (canvas → PDF), exportación
src/pages/             auth/, events/, event/ (panel del evento), public/ (registro, itinerario, QR, verificación)
design/                exportación de Claude Design usada como referencia
```

## Notas

- El color del evento tiñe su panel, el formulario público, el check-in, los carteles QR, las constancias y los correos.
- La hora del QR se evalúa en la zona horaria del evento (`America/Hermosillo` por defecto).
- Quien asiste sin estar inscrito queda como «sin inscripción» (salvo que se active *Solo inscritos*) y también recibe constancia.
