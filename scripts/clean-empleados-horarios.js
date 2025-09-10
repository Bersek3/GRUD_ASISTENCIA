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

// Función para limpiar empleados y horarios
function cleanEmpleadosYHorarios() {
    console.log('🧹 Iniciando limpieza de empleados y horarios...');
    
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
        'roles'
    ];
    
    let completedTables = 0;
    
    // Limpiar tablas relacionadas primero
    tablesToClean.forEach((table) => {
        db.run(`DELETE FROM ${table}`, (err) => {
            if (err) {
                console.error(`❌ Error al limpiar tabla ${table}:`, err.message);
            } else {
                console.log(`✅ Tabla ${table} limpiada correctamente`);
            }
            
            completedTables++;
            
            // Cuando se completen todas las tablas relacionadas
            if (completedTables === tablesToClean.length) {
                // Ahora eliminar empleados excepto el admin
                deleteEmpleadosExceptAdmin();
            }
        });
    });
}

// Función para eliminar empleados excepto el admin
function deleteEmpleadosExceptAdmin() {
    console.log('👥 Eliminando empleados excepto el administrador...');
    
    // Eliminar todos los empleados excepto el que tiene email 'admin@sistema.com'
    db.run(
        `DELETE FROM empleados WHERE email != 'admin@sistema.com'`,
        (err) => {
            if (err) {
                console.error('❌ Error al eliminar empleados:', err.message);
            } else {
                console.log('✅ Empleados eliminados correctamente (excepto admin)');
            }
            
            // Verificar que el admin sigue existiendo
            verifyAdminExists();
        }
    );
}

// Función para verificar que el admin existe
function verifyAdminExists() {
    console.log('🔍 Verificando que el administrador existe...');
    
    db.get(
        `SELECT id, nombre, apellido, email FROM empleados WHERE email = 'admin@sistema.com'`,
        (err, admin) => {
            if (err) {
                console.error('❌ Error al verificar admin:', err.message);
            } else if (admin) {
                console.log('✅ Administrador verificado:');
                console.log(`   ID: ${admin.id}`);
                console.log(`   Nombre: ${admin.nombre} ${admin.apellido}`);
                console.log(`   Email: ${admin.email}`);
            } else {
                console.log('⚠️  No se encontró el administrador, recreando...');
                recreateAdminUser();
                return;
            }
            
            // Mostrar resumen final
            showFinalSummary();
        }
    );
}

// Función para recrear el usuario administrador si no existe
function recreateAdminUser() {
    console.log('👤 Recreando usuario administrador...');
    
    const bcrypt = require('bcryptjs');
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    
    // Primero crear el rol de administrador
    db.run(
        `INSERT INTO roles (nombre, descripcion, permisos, salario_base) 
         VALUES ('Administrador', 'Acceso completo al sistema', 'admin', 0)`,
        (err) => {
            if (err) {
                console.error('❌ Error al crear rol administrador:', err.message);
            } else {
                console.log('✅ Rol administrador creado');
                
                // Ahora crear el usuario administrador
                db.run(
                    `INSERT INTO empleados (nombre, apellido, email, password_hash, rol_id, activo) 
                     VALUES ('Admin', 'Sistema', 'admin@sistema.com', ?, 1, 1)`,
                    [hashedPassword],
                    (err) => {
                        if (err) {
                            console.error('❌ Error al crear usuario administrador:', err.message);
                        } else {
                            console.log('✅ Usuario administrador recreado');
                        }
                        
                        showFinalSummary();
                    }
                );
            }
        }
    );
}

// Función para mostrar resumen final
function showFinalSummary() {
    console.log('\n📊 Resumen de la limpieza:');
    
    // Contar empleados restantes
    db.get('SELECT COUNT(*) as total FROM empleados', (err, empleadosCount) => {
        if (err) {
            console.error('❌ Error al contar empleados:', err.message);
        } else {
            console.log(`   👥 Empleados restantes: ${empleadosCount.total}`);
        }
        
        // Contar horarios restantes
        db.get('SELECT COUNT(*) as total FROM horarios', (err, horariosCount) => {
            if (err) {
                console.error('❌ Error al contar horarios:', err.message);
            } else {
                console.log(`   ⏰ Horarios restantes: ${horariosCount.total}`);
            }
            
            // Contar roles restantes
            db.get('SELECT COUNT(*) as total FROM roles', (err, rolesCount) => {
                if (err) {
                    console.error('❌ Error al contar roles:', err.message);
                } else {
                    console.log(`   👔 Roles restantes: ${rolesCount.total}`);
                }
            
                // Cerrar la conexión
                db.close((err) => {
                    if (err) {
                        console.error('❌ Error al cerrar la base de datos:', err.message);
                    } else {
                        console.log('🔒 Conexión a la base de datos cerrada');
                        console.log('🎯 Limpieza completada exitosamente');
                        console.log('\n📝 Credenciales del administrador:');
                        console.log('   Email: admin@sistema.com');
                        console.log('   Contraseña: admin123');
                        process.exit(0);
                    }
                });
            });
        });
    });
}

// Ejecutar limpieza
cleanEmpleadosYHorarios();
