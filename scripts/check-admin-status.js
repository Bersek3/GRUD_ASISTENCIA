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

// Verificar estado del administrador
function checkAdminStatus() {
    console.log('🔍 Verificando estado del administrador...');
    
    // Verificar empleados
    db.get('SELECT COUNT(*) as total FROM empleados', (err, empleadosCount) => {
        if (err) {
            console.error('❌ Error al contar empleados:', err.message);
        } else {
            console.log(`👥 Total empleados: ${empleadosCount.total}`);
        }
        
        // Verificar roles
        db.get('SELECT COUNT(*) as total FROM roles', (err, rolesCount) => {
            if (err) {
                console.error('❌ Error al contar roles:', err.message);
            } else {
                console.log(`👔 Total roles: ${rolesCount.total}`);
            }
            
            // Verificar detalles del admin
            db.get(
                `SELECT e.id, e.nombre, e.apellido, e.email, e.rol_id, r.nombre as rol_nombre, r.permisos
                 FROM empleados e 
                 LEFT JOIN roles r ON e.rol_id = r.id 
                 WHERE e.email = 'admin@sistema.com'`,
                (err, admin) => {
                    if (err) {
                        console.error('❌ Error al verificar admin:', err.message);
                    } else if (admin) {
                        console.log('\n👤 Estado del administrador:');
                        console.log(`   ID: ${admin.id}`);
                        console.log(`   Nombre: ${admin.nombre} ${admin.apellido}`);
                        console.log(`   Email: ${admin.email}`);
                        console.log(`   Rol ID: ${admin.rol_id || 'SIN ROL'}`);
                        console.log(`   Rol: ${admin.rol_nombre || 'SIN ROL'}`);
                        console.log(`   Permisos: ${admin.permisos || 'SIN PERMISOS'}`);
                        
                        if (!admin.rol_id) {
                            console.log('\n⚠️  El administrador no tiene rol asignado. Ejecutando corrección...');
                            fixAdminRole();
                        } else {
                            console.log('\n✅ El administrador tiene rol asignado correctamente');
                            db.close();
                            process.exit(0);
                        }
                    } else {
                        console.log('❌ No se encontró el administrador');
                        db.close();
                        process.exit(1);
                    }
                }
            );
        });
    });
}

// Función para corregir el rol del admin
function fixAdminRole() {
    console.log('👔 Creando rol administrador...');
    
    // Crear el rol de administrador
    db.run(
        `INSERT INTO roles (nombre, descripcion, permisos, salario_base) 
         VALUES ('Administrador', 'Acceso completo al sistema', 'admin', 0)`,
        function(err) {
            if (err) {
                console.error('❌ Error al crear rol administrador:', err.message);
            } else {
                const rolId = this.lastID;
                console.log(`✅ Rol administrador creado con ID: ${rolId}`);
                
                // Actualizar el usuario admin para asignarle el rol
                db.run(
                    `UPDATE empleados SET rol_id = ? WHERE email = 'admin@sistema.com'`,
                    [rolId],
                    function(err) {
                        if (err) {
                            console.error('❌ Error al actualizar usuario admin:', err.message);
                        } else {
                            console.log('✅ Usuario admin actualizado con rol administrador');
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
                    }
                );
            }
        }
    );
}

// Ejecutar verificación
checkAdminStatus();
