const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Ruta a la base de datos
const dbPath = path.join(__dirname, '..', 'database', 'asistencia.db');

// Crear conexión a la base de datos
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Error al conectar con la base de datos:', err.message);
        process.exit(1);
    }
    console.log('✅ Conectado a la base de datos SQLite');
});

// Función para limpiar todas las tablas
function cleanDatabase() {
    console.log('🧹 Iniciando limpieza completa de la base de datos...');
    
    // Lista de tablas a limpiar (en orden para respetar foreign keys)
    const tablesToClean = [
        'asistencia',
        'vacaciones',
        'notificaciones',
        'reportes',
        'dias_libres',
        'turnos_especiales',
        'liquidaciones',
        'empleado_horarios',
        'horarios',
        'empleados',
        'roles'
    ];
    
    let completedTables = 0;
    
    tablesToClean.forEach((table, index) => {
        db.run(`DELETE FROM ${table}`, (err) => {
            if (err) {
                console.error(`❌ Error al limpiar tabla ${table}:`, err.message);
            } else {
                console.log(`✅ Tabla ${table} limpiada correctamente`);
            }
            
            completedTables++;
            
            // Cuando se completen todas las tablas
            if (completedTables === tablesToClean.length) {
                console.log('🎉 Limpieza completa de la base de datos finalizada');
                
                // Recrear el usuario administrador por defecto
                recreateAdminUser();
            }
        });
    });
}

// Función para recrear el usuario administrador
function recreateAdminUser() {
    console.log('👤 Recreando usuario administrador...');
    
    // Insertar rol de administrador
    db.run(`INSERT INTO roles (nombre, descripcion) VALUES ('Administrador', 'Acceso completo al sistema')`, (err) => {
        if (err) {
            console.error('❌ Error al crear rol administrador:', err.message);
        } else {
            console.log('✅ Rol administrador creado');
        }
    });
    
    // Insertar usuario administrador
    const bcrypt = require('bcryptjs');
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    
    db.run(`INSERT INTO empleados (nombre, apellido, email, password_hash, rol_id, activo) VALUES ('Admin', 'Sistema', 'admin@sistema.com', ?, 1, 1)`, [hashedPassword], (err) => {
        if (err) {
            console.error('❌ Error al crear usuario administrador:', err.message);
        } else {
            console.log('✅ Usuario administrador creado');
        }
        
        // Cerrar la conexión
        db.close((err) => {
            if (err) {
                console.error('❌ Error al cerrar la base de datos:', err.message);
            } else {
                console.log('🔒 Conexión a la base de datos cerrada');
                console.log('🎯 Base de datos completamente limpia y lista para usar');
                process.exit(0);
            }
        });
    });
}

// Ejecutar limpieza
cleanDatabase();
