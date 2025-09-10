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

// Función para crear el rol administrador y asignarlo al usuario admin
function fixAdminRole() {
    console.log('👔 Creando rol administrador...');
    
    // Crear el rol de administrador
    db.run(
        `INSERT INTO roles (nombre, descripcion, permisos, salario_base) 
         VALUES ('Administrador', 'Acceso completo al sistema', 'admin', 0)`,
        function(err) {
            if (err) {
                console.error('❌ Error al crear rol administrador:', err.message);
                db.close();
                process.exit(1);
            } else {
                const rolId = this.lastID;
                console.log(`✅ Rol administrador creado con ID: ${rolId}`);
                
                // Actualizar el usuario admin para asignarle el rol
                updateAdminUser(rolId);
            }
        }
    );
}

// Función para actualizar el usuario admin con el rol
function updateAdminUser(rolId) {
    console.log('👤 Asignando rol administrador al usuario admin...');
    
    db.run(
        `UPDATE empleados SET rol_id = ? WHERE email = 'admin@sistema.com'`,
        [rolId],
        function(err) {
            if (err) {
                console.error('❌ Error al actualizar usuario admin:', err.message);
            } else {
                console.log('✅ Usuario admin actualizado con rol administrador');
                
                // Verificar que todo quedó correcto
                verifyAdminSetup();
            }
        }
    );
}

// Función para verificar que el admin tiene el rol correcto
function verifyAdminSetup() {
    console.log('🔍 Verificando configuración del administrador...');
    
    db.get(
        `SELECT e.id, e.nombre, e.apellido, e.email, e.rol_id, r.nombre as rol_nombre, r.permisos
         FROM empleados e 
         LEFT JOIN roles r ON e.rol_id = r.id 
         WHERE e.email = 'admin@sistema.com'`,
        (err, admin) => {
            if (err) {
                console.error('❌ Error al verificar admin:', err.message);
            } else if (admin) {
                console.log('✅ Administrador verificado:');
                console.log(`   ID: ${admin.id}`);
                console.log(`   Nombre: ${admin.nombre} ${admin.apellido}`);
                console.log(`   Email: ${admin.email}`);
                console.log(`   Rol ID: ${admin.rol_id}`);
                console.log(`   Rol: ${admin.rol_nombre}`);
                console.log(`   Permisos: ${admin.permisos}`);
            } else {
                console.log('❌ No se encontró el administrador');
            }
            
            // Mostrar resumen final
            showFinalSummary();
        }
    );
}

// Función para mostrar resumen final
function showFinalSummary() {
    console.log('\n📊 Resumen de la configuración:');
    
    // Contar empleados
    db.get('SELECT COUNT(*) as total FROM empleados', (err, empleadosCount) => {
        if (err) {
            console.error('❌ Error al contar empleados:', err.message);
        } else {
            console.log(`   👥 Empleados: ${empleadosCount.total}`);
        }
        
        // Contar roles
        db.get('SELECT COUNT(*) as total FROM roles', (err, rolesCount) => {
            if (err) {
                console.error('❌ Error al contar roles:', err.message);
            } else {
                console.log(`   👔 Roles: ${rolesCount.total}`);
            }
            
            // Cerrar la conexión
            db.close((err) => {
                if (err) {
                    console.error('❌ Error al cerrar la base de datos:', err.message);
                } else {
                    console.log('🔒 Conexión a la base de datos cerrada');
                    console.log('🎯 Configuración del administrador completada exitosamente');
                    console.log('\n📝 Credenciales del administrador:');
                    console.log('   Email: admin@sistema.com');
                    console.log('   Contraseña: admin123');
                    console.log('   Rol: Administrador (permisos completos)');
                    process.exit(0);
                }
            });
        });
    });
}

// Ejecutar la corrección
fixAdminRole();
