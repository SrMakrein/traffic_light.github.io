# 🚦 GitHub Dynamic Query Tool - Traffic Light

Una herramienta web moderna para monitorear y consultar el estado de múltiples repositorios de GitHub en diferentes entornos simultáneamente, proporcionando una vista matriz centralizada de versiones y estados.

---

## 📋 Características Principales

### 🔍 Monitoreo Multi-Repositorio
- Consulta y monitorea **29 repositorios** en paralelo
- Soporta filtrado parcial de repositorios en tiempo real
- Busca palabras clave específicas (ej: `config.json`) en múltiples ramas

### 🌍 Soporte Multi-Entorno
- **QA** (rama `qa`)
- **UAT** (rama `uat`)
- **PRO** (rama `master`)
- Matriz completa de estados mostrada en tiempo real

### 📊 Interfaz Intuitiva
- **Tab de Monitor**: Vista matriz de repositorios y versiones
- **Tab de Estadísticas**: Panel reservado para métricas (en desarrollo)
- **Tab Extra**: Panel extensible para funcionalidades futuras
- Botón de configuración (tuerca) en la esquina superior derecha

### 🔐 Seguridad
- Token de acceso personal de GitHub configurable
- Configuración almacenada localmente en `localStorage`
- No expone credenciales en la URL

### 🛠️ Herramientas de Desarrollo
- **Consola de Debug**: Panel lateral deslizante con logs en tiempo real
- Categorización de logs: `info`, `success`, `error`, `warn`, `system`
- Sincronización de estados de bloqueo desde GitHub

### 🎨 Diseño Moderno
- Interfaz glassmorphism con efectos blur
- Animaciones suaves y transiciones fluidas
- Tema oscuro profesional
- Totalmente responsivo

---

## 🚀 Funcionalidades Principales

### 1. Escaneo de Repositorios
```
1. Configura tu GitHub Personal Access Token (PAT)
2. Define la palabra clave a buscar
3. Filtra repositorios (opcional)
4. Selecciona el entorno objetivo
5. Haz clic en "Iniciar Escaneo de Monitor"
```

**Resultado**: Matriz interactiva mostrando:
- Nombre del repositorio
- Entorno (QA, UAT, PRO)
- Versión encontrada
- Acciones disponibles

### 2. Sincronización de Estados
- La herramienta sincroniza automáticamente los estados de bloqueo desde `status.json` del repositorio propio
- Permite bloquear/desbloquear repositorios desde la interfaz
- Los cambios se persisten en GitHub

### 3. Configuración Persistente
- El token y preferencias se guardan automáticamente
- Se restauran al recargar la página
- Búsqueda reactiva con debounce (800ms)

### 4. Consola de Debug
- Acceso mediante botón flotante en esquina inferior derecha
- Visualización de todos los eventos y logs
- Funcionalidad de limpiar logs
- Timestamps en cada entrada

---

## 📦 Estructura del Proyecto

```
Proyecto TRAFFIC LIGHT/
├── index.html           # Estructura HTML
├── app.js              # Lógica de aplicación
├── style.css           # Estilos y animaciones
├── status.json         # Estado compartido de bloqueos
└── README.md          # Este archivo
```

---

## 🔧 Configuración

### Requisitos Previos
- Navegador web moderno (Chrome, Firefox, Edge, Safari)
- Token de acceso personal de GitHub ([Generar PAT](https://github.com/settings/tokens))

### Pasos de Configuración

1. **Obtener GitHub PAT**:
   - Ve a [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)
   - Crea un nuevo token con permisos:
     - `repo` (acceso a repositorios públicos y privados)
     - `read:user` (información de usuario)

2. **Ejecutar la Aplicación**:
   - Abre `index.html` en tu navegador
   - O sirve desde un servidor HTTP local

3. **Configuración Inicial**:
   - Haz clic en el botón de tuerca (⚙️) en la esquina superior derecha
   - Ingresa tu GitHub PAT
   - Define la palabra clave a buscar
   - Guarda la configuración

---

## 🎯 Casos de Uso

### Monitoreo de Versiones
Verifica qué versión de una librería o configuración está desplegada en cada entorno

### Auditoría de Repositorios
Busca archivos específicos (`config.json`, `package.json`, etc.) en todos los repos

### Gestión de Deployments
Sincroniza y controla el estado de múltiples deployments simultáneamente

### Integración Continua
Integra la herramienta en dashboards de CI/CD para visualización centralizada

---

## 📱 Componentes de la Interfaz

### Barra de Navegación Superior
- **Botón Configuración** (Tuerca): Accede a credenciales y palabras clave
- **Tabs de Contenido**: Monitor, Estadísticas, Extra

### Sección Monitor
- **Panel de Filtros**: Entrada de repositorios y selector de entorno
- **Botón Escaneo**: Inicia la búsqueda en todos los repos
- **Matriz de Resultados**: Tabla interactiva de resultados

### Consola de Debug
- **Panel Flotante**: Deslizable desde la derecha
- **Logs Categorizados**: Colores según tipo de mensaje
- **Timestamps**: Hora exacta de cada evento

---

## 🔄 Flujo de Datos

```
Usuario Input
    ↓
Validación de Token
    ↓
Sincronización de Estados (status.json)
    ↓
Búsqueda Paralela en Repositorios
    ↓
Procesamiento de Resultados
    ↓
Renderizado de Matriz
    ↓
Visualización Interactiva
```

---

## 📊 Repositorios Soportados (29 Total)

```javascript
[
  'core.sb.ege.fr',
  'sb.core',
  'core.sb.esd.com',
  'core.sb.unie.es',
  'core.sb.planetafp.es',
  'core.sb.eaebarcelona.com',
  'core.sb.universidadviu.com',
  'core.sb.universitatcarlemany.com',
  'core.sb.sportsmanagementschool.fr',
  'core.sb.supdeluxe.com',
  'core.sb.planetaformacion.com',
  'core.sb.obsbusiness.school',
  'core.sb.eslsca.ma',
  'core.sb.ifp.es',
  'core.sb.eslsca.fr',
  'core.sb.eae.es',
  'core.sb.edumed.ma',
  'core.sb.edcparis.edu',
  'core.sb.eaemadrid.com',
  'core.sb.biu.us',
  'core.sb.bch.com',
  'api.captacion.leads',
  'n2php',
  'sbetl',
  'pubsubscriber',
  'sce-php',
  'sb.development.core',
  'sb.development.site',
  'sb.eaemadrid.com'
]
```

---

## 🎨 Temas y Colores

- **Primario**: `#6366f1` (Indigo)
- **Acento**: `#10b981` (Emerald)
- **Fondo**: `#0f172a` (Navy)
- **Texto Principal**: `#f8fafc` (Slate Light)
- **Texto Secundario**: `#94a3b8` (Slate)

---

## 🚦 Estado del Proyecto

| Función | Estado |
|---------|--------|
| Escaneo de Repositorios | ✅ Completado |
| Sincronización de Estados | ✅ Completado |
| Interfaz Multi-Tab | ✅ Completado |
| Configuración Persistente | ✅ Completado |
| Consola de Debug | ✅ Completado |
| Panel de Estadísticas | 🔄 En Desarrollo |
| Exportar Reportes | 📋 Planificado |
| Notificaciones | 📋 Planificado |

---

## 📝 Notas Técnicas

### APIs Utilizadas
- **GitHub REST API v3**: Búsqueda de contenidos en repositorios
- **GitHub GraphQL**: Consultas avanzadas (opcional)
- **Web Storage API**: Almacenamiento local de configuración

### Limitaciones Conocidas
- Rate limiting de GitHub: 60 solicitudes/hora sin autenticación, 5000/hora con PAT
- Búsqueda limitada a nombres de archivos (no contenido de archivos)
- Requiere acceso público o privado a los repositorios

### Performance
- Debounce de 800ms en búsqueda reactiva
- Carga paralela de repositorios
- Almacenamiento en caché local de configuración

---

## 👨‍💻 Desarrollo Futuro

- [ ] Integración con webhooks de GitHub
- [ ] Exportar resultados a CSV/JSON
- [ ] Gráficos de estadísticas avanzadas
- [ ] Alertas y notificaciones automáticas
- [ ] Sistema de permisos y roles
- [ ] API propia para integración externa

---

## 📄 Licencia

Este proyecto está disponible para uso interno. Contacta con el administrador para más información.

---

## 👥 Autor

**SrMakrein** - Traffic Light Monitor Tool

---

## 📞 Soporte y Contribuciones

Para reportar bugs, sugerencias o contribuciones:
1. Abre un issue en el repositorio
2. Envía un pull request con tus cambios
3. Contacta directamente con el equipo de desarrollo

---

**Última actualización**: Marzo 2026
