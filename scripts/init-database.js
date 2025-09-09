const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database', 'asistencia.db');

// Crear directorio de base de datos si no existe
const fs = require('fs');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath);

// Crear tablas
db.serialize(() => {
    // Tabla de roles
    db.run(`
        CREATE TABLE IF NOT EXISTS roles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT UNIQUE NOT NULL,
            descripcion TEXT,
            permisos TEXT,
            salario_base REAL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Tabla de empleados
    db.run(`
        CREATE TABLE IF NOT EXISTS empleados (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            apellido TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            telefono TEXT,
            direccion TEXT,
            fecha_nacimiento DATE,
            fecha_contratacion DATE DEFAULT CURRENT_DATE,
            rol_id INTEGER,
            activo BOOLEAN DEFAULT 1,
            password_hash TEXT NOT NULL,
            foto TEXT,
            tiempo_colacion INTEGER DEFAULT 30,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (rol_id) REFERENCES roles (id)
        )
    `);

    // Tabla de horarios
    db.run(`
        CREATE TABLE IF NOT EXISTS horarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            hora_entrada TIME NOT NULL,
            hora_salida TIME NOT NULL,
            dias_semana TEXT NOT NULL,
            descripcion TEXT,
            activo BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Tabla de asignación de horarios a empleados
    db.run(`
        CREATE TABLE IF NOT EXISTS empleado_horarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            empleado_id INTEGER NOT NULL,
            horario_id INTEGER NOT NULL,
            fecha_inicio DATE NOT NULL,
            fecha_fin DATE,
            activo BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (empleado_id) REFERENCES empleados (id),
            FOREIGN KEY (horario_id) REFERENCES horarios (id)
        )
    `);

    // Tabla de asistencia
    db.run(`
        CREATE TABLE IF NOT EXISTS asistencia (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            empleado_id INTEGER NOT NULL,
            fecha DATE NOT NULL,
            hora_entrada TIME,
            hora_salida TIME,
            horas_trabajadas REAL,
            estado TEXT DEFAULT 'presente',
            observaciones TEXT,
            ip_address TEXT,
            ubicacion TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (empleado_id) REFERENCES empleados (id)
        )
    `);

    // Tabla de vacaciones
    db.run(`
        CREATE TABLE IF NOT EXISTS vacaciones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            empleado_id INTEGER NOT NULL,
            fecha_inicio DATE NOT NULL,
            fecha_fin DATE NOT NULL,
            dias_solicitados INTEGER NOT NULL,
            estado TEXT DEFAULT 'pendiente',
            motivo TEXT,
            aprobado_por INTEGER,
            fecha_aprobacion DATETIME,
            observaciones TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (empleado_id) REFERENCES empleados (id),
            FOREIGN KEY (aprobado_por) REFERENCES empleados (id)
        )
    `);

    // Tabla de notificaciones
    db.run(`
        CREATE TABLE IF NOT EXISTS notificaciones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            empleado_id INTEGER,
            titulo TEXT NOT NULL,
            mensaje TEXT NOT NULL,
            tipo TEXT DEFAULT 'info',
            leida BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (empleado_id) REFERENCES empleados (id)
        )
    `);

    // Tabla de reportes
    db.run(`
        CREATE TABLE IF NOT EXISTS reportes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            empleado_id INTEGER,
            tipo_reporte TEXT NOT NULL,
            fecha_inicio DATE NOT NULL,
            fecha_fin DATE NOT NULL,
            datos TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (empleado_id) REFERENCES empleados (id)
        )
    `);

    // Tabla de días libres y permisos especiales
    db.run(`
        CREATE TABLE IF NOT EXISTS dias_libres (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            empleado_id INTEGER NOT NULL,
            fecha DATE NOT NULL,
            tipo TEXT NOT NULL,
            motivo TEXT,
            aprobado_por INTEGER,
            estado TEXT DEFAULT 'pendiente',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (empleado_id) REFERENCES empleados (id),
            FOREIGN KEY (aprobado_por) REFERENCES empleados (id)
        )
    `);

    // Tabla de turnos especiales
    db.run(`
        CREATE TABLE IF NOT EXISTS turnos_especiales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            empleado_id INTEGER NOT NULL,
            fecha DATE NOT NULL,
            hora_entrada TIME,
            hora_salida TIME,
            motivo TEXT,
            aprobado_por INTEGER,
            estado TEXT DEFAULT 'pendiente',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (empleado_id) REFERENCES empleados (id),
            FOREIGN KEY (aprobado_por) REFERENCES empleados (id)
        )
    `);

    // Tabla de liquidaciones de sueldo
    db.run(`
        CREATE TABLE IF NOT EXISTS liquidaciones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            empleado_id INTEGER NOT NULL,
            periodo_mes INTEGER NOT NULL,
            periodo_ano INTEGER NOT NULL,
            archivo_path TEXT NOT NULL,
            nombre_archivo TEXT NOT NULL,
            tipo_archivo TEXT NOT NULL,
            tamaño_archivo INTEGER NOT NULL,
            subido_por INTEGER NOT NULL,
            fecha_subida DATETIME DEFAULT CURRENT_TIMESTAMP,
            observaciones TEXT,
            activo BOOLEAN DEFAULT 1,
            FOREIGN KEY (empleado_id) REFERENCES empleados (id),
            FOREIGN KEY (subido_por) REFERENCES empleados (id),
            UNIQUE(empleado_id, periodo_mes, periodo_ano)
        )
    `);

    // Insertar datos iniciales
    const insertInitialData = () => {
        // Roles iniciales
        const roles = [
            { nombre: 'Administrador', descripcion: 'Acceso completo al sistema', permisos: 'admin', salario_base: 0 },
            { nombre: 'Supervisor', descripcion: 'Supervisión de empleados', permisos: 'supervisor', salario_base: 0 },
            { nombre: 'Empleado', descripcion: 'Empleado regular', permisos: 'empleado', salario_base: 0 }
        ];

        roles.forEach(rol => {
            db.run(
                'INSERT OR IGNORE INTO roles (nombre, descripcion, permisos, salario_base) VALUES (?, ?, ?, ?)',
                [rol.nombre, rol.descripcion, rol.permisos, rol.salario_base]
            );
        });

        // Horarios iniciales
        const horarios = [
            { nombre: 'Turno Mañana', hora_entrada: '08:00', hora_salida: '16:00', dias_semana: '1,2,3,4,5' },
            { nombre: 'Turno Tarde', hora_entrada: '16:00', hora_salida: '00:00', dias_semana: '1,2,3,4,5' },
            { nombre: 'Turno Noche', hora_entrada: '00:00', hora_salida: '08:00', dias_semana: '1,2,3,4,5' },
            { nombre: 'Fin de Semana', hora_entrada: '09:00', hora_salida: '17:00', dias_semana: '6,7' }
        ];

        horarios.forEach(horario => {
            db.run(
                'INSERT OR IGNORE INTO horarios (nombre, hora_entrada, hora_salida, dias_semana) VALUES (?, ?, ?, ?)',
                [horario.nombre, horario.hora_entrada, horario.hora_salida, horario.dias_semana]
            );
        });

        // Crear administrador por defecto
        const adminPassword = bcrypt.hashSync('admin123', 10);
        db.run(
            `INSERT OR IGNORE INTO empleados 
             (nombre, apellido, email, rol_id, password_hash, activo) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            ['Admin', 'Sistema', 'admin@sistema.com', 1, adminPassword, 1]
        );

        // Crear empleados de prueba
        const employeePassword = bcrypt.hashSync('empleado123', 10);
        const empleadosPrueba = [
            { nombre: 'IVAN', apellido: 'VIDAL', email: 'ivan.vidal@empresa.com', telefono: '+1234567891' },
            { nombre: 'JOSE', apellido: 'PAILLACAR', email: 'jose.paillacar@empresa.com', telefono: '+1234567892' },
            { nombre: 'MARCOS', apellido: 'PAILLACAR', email: 'marcos.paillacar@empresa.com', telefono: '+1234567893' },
            { nombre: 'MATIAS', apellido: 'VILLANUEVA', email: 'matias.villanueva@empresa.com', telefono: '+1234567894' },
            { nombre: 'ANGELICA', apellido: 'CHAVEZ', email: 'angelica.chavez@empresa.com', telefono: '+1234567895' },
            { nombre: 'MATIAS', apellido: 'IGOR', email: 'matias.igor@empresa.com', telefono: '+1234567896' }
        ];

        empleadosPrueba.forEach(empleado => {
            db.run(
                `INSERT OR IGNORE INTO empleados 
                 (nombre, apellido, email, telefono, rol_id, password_hash, activo) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [empleado.nombre, empleado.apellido, empleado.email, empleado.telefono, 3, employeePassword, 1]
            );
        });

        console.log('✅ Base de datos inicializada correctamente');
        console.log('👤 Usuarios creados:');
        console.log('   Administrador:');
        console.log('     Email: admin@sistema.com');
        console.log('     Contraseña: admin123');
        console.log('   Empleados del Sistema:');
        empleadosPrueba.forEach((emp, index) => {
            console.log(`     ${emp.nombre} ${emp.apellido}: ${emp.email} - Contraseña: empleado123`);
        });
    };

    // Ejecutar inserción de datos después de un pequeño delay
    setTimeout(() => {
        insertInitialData();
        db.close((err) => {
            if (err) {
                console.error('❌ Error al cerrar la base de datos:', err.message);
            } else {
                console.log('🔒 Conexión a la base de datos cerrada');
            }
        });
    }, 1000);
});
