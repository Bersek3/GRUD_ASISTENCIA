# Sistema de Asistencia de Turnos

Un sistema completo de gestión de asistencia y turnos para empresas, desarrollado con Node.js, Express, SQLite y una interfaz web moderna.

## 🚀 Características

### Funcionalidades Principales
- **Gestión de Empleados**: Agregar, editar, eliminar y gestionar empleados
- **Sistema de Roles**: Administrador, Supervisor, Empleado con diferentes permisos
- **Gestión de Horarios**: Crear y asignar horarios de trabajo flexibles
- **Registro de Asistencia**: Entrada y salida con geolocalización
- **Gestión de Vacaciones**: Solicitar, aprobar y gestionar vacaciones
- **Reportes**: Generar reportes detallados de asistencia y horas trabajadas
- **Notificaciones**: Sistema de notificaciones en tiempo real
- **Dashboard**: Panel de control con estadísticas y métricas

### Características Técnicas
- **Backend**: Node.js con Express
- **Base de Datos**: SQLite (fácil de configurar y usar)
- **Autenticación**: JWT (JSON Web Tokens)
- **Seguridad**: Helmet, CORS, Rate Limiting
- **Interfaz**: HTML5, CSS3, JavaScript vanilla
- **Responsive**: Diseño adaptable a dispositivos móviles

## 📋 Requisitos

- Node.js (versión 14 o superior)
- npm (Node Package Manager)

## 🛠️ Instalación

1. **Clonar o descargar el proyecto**
   ```bash
   cd /ruta/del/proyecto
   ```

2. **Instalar dependencias**
   ```bash
   npm install
   ```

3. **Inicializar la base de datos**
   ```bash
   npm run init-db
   ```

4. **Iniciar el servidor**
   ```bash
   npm start
   ```

   Para desarrollo con recarga automática:
   ```bash
   npm run dev
   ```

5. **Acceder al sistema**
   - Abrir navegador en: `http://localhost:3000`
   - Usar las credenciales de demostración

## 👥 Usuarios por Defecto

### Administrador
- **Email**: admin@sistema.com
- **Contraseña**: admin123
- **Permisos**: Acceso completo al sistema

### Empleados de Prueba
- **Empleado 1**: empleado1@empresa.com - empleado123
- **Empleado 2**: empleado2@empresa.com - empleado123
- **Empleado 3**: empleado3@empresa.com - empleado123
- **Empleado 4**: empleado4@empresa.com - empleado123
- **Empleado 5**: empleado5@empresa.com - empleado123
- **Permisos**: Acceso de empleado regular

## 🎯 Uso del Sistema

### Para Administradores

1. **Gestión de Empleados**
   - Agregar nuevos empleados
   - Asignar roles y horarios
   - Editar información personal
   - Activar/desactivar empleados

2. **Gestión de Roles**
   - Crear nuevos roles
   - Definir permisos específicos
   - Asignar salarios base

3. **Gestión de Horarios**
   - Crear horarios de trabajo
   - Asignar horarios a empleados
   - Gestionar turnos

4. **Supervisión de Asistencia**
   - Ver registros de asistencia
   - Marcar ausencias
   - Generar reportes

5. **Gestión de Vacaciones**
   - Aprobar/rechazar solicitudes
   - Ver historial de vacaciones
   - Generar reportes

### Para Empleados

1. **Registro de Asistencia**
   - Marcar entrada y salida
   - Ver historial personal
   - Consultar estadísticas

2. **Solicitud de Vacaciones**
   - Crear solicitudes
   - Ver estado de solicitudes
   - Consultar días disponibles

3. **Perfil Personal**
   - Ver información personal
   - Cambiar contraseña
   - Actualizar datos

## 📊 Estructura de la Base de Datos

### Tablas Principales

- **empleados**: Información de empleados
- **roles**: Roles y permisos
- **horarios**: Horarios de trabajo
- **empleado_horarios**: Asignación de horarios
- **asistencia**: Registros de asistencia
- **vacaciones**: Solicitudes de vacaciones
- **notificaciones**: Sistema de notificaciones
- **reportes**: Historial de reportes generados

## 🔧 Configuración

### Variables de Entorno
Crear archivo `.env` en la raíz del proyecto:
```env
PORT=3000
JWT_SECRET=tu_clave_secreta_muy_segura
NODE_ENV=development
```

### Personalización
- **Colores**: Modificar variables CSS en los archivos HTML
- **Logo**: Reemplazar iconos Font Awesome por tu logo
- **Configuración de email**: Configurar nodemailer para notificaciones

## 📱 Características Móviles

- Diseño responsive
- Menú lateral deslizable
- Botones táctiles optimizados
- Interfaz adaptada a pantallas pequeñas

## 🔒 Seguridad

- Autenticación JWT
- Protección contra ataques CSRF
- Rate limiting
- Validación de entrada
- Sanitización de datos

## 📈 Reportes Disponibles

1. **Reporte de Asistencia**
   - Por empleado o global
   - Por rango de fechas
   - Estadísticas detalladas

2. **Reporte de Horas Trabajadas**
   - Horas totales por empleado
   - Promedios y comparativas
   - Análisis de productividad

3. **Reporte de Vacaciones**
   - Solicitudes por estado
   - Días utilizados
   - Tendencias anuales

## 🚀 Despliegue en Producción

1. **Configurar variables de entorno**
2. **Usar base de datos PostgreSQL o MySQL**
3. **Configurar HTTPS**
4. **Implementar backup automático**
5. **Configurar monitoreo**

## 🤝 Contribución

1. Fork el proyecto
2. Crear rama para nueva funcionalidad
3. Commit los cambios
4. Push a la rama
5. Crear Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Ver archivo `LICENSE` para más detalles.

## 🆘 Soporte

Para soporte técnico o consultas:
- Crear un issue en el repositorio
- Documentar el problema detalladamente
- Incluir logs de error si es necesario

## 🔄 Actualizaciones Futuras

- [ ] Integración con sistemas de nómina
- [ ] App móvil nativa
- [ ] Integración con dispositivos biométricos
- [ ] Dashboard avanzado con gráficos
- [ ] Sistema de turnos rotativos
- [ ] Integración con calendarios externos

---

**Desarrollado con ❤️ para facilitar la gestión de asistencia empresarial**
