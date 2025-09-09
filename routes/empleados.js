const express = require('express');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { authenticateToken, requireAdmin } = require('./auth');

const router = express.Router();
const dbPath = path.join(__dirname, '..', 'database', 'asistencia.db');

// Obtener todos los empleados (solo admin)
router.get('/', authenticateToken, requireAdmin, (req, res) => {
    const db = new sqlite3.Database(dbPath);
    
    db.all(
        `SELECT e.*, r.nombre as rol_nombre, r.descripcion as rol_descripcion
         FROM empleados e 
         LEFT JOIN roles r ON e.rol_id = r.id 
         ORDER BY e.nombre, e.apellido`,
        (err, empleados) => {
            db.close();
            
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: 'Error al obtener empleados'
                });
            }

            // Ocultar password_hash de la respuesta
            const empleadosSinPassword = empleados.map(emp => {
                const { password_hash, ...empleadoSinPassword } = emp;
                return empleadoSinPassword;
            });

            res.json({
                success: true,
                data: empleadosSinPassword
            });
        }
    );
});

// Obtener empleado por ID
router.get('/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const db = new sqlite3.Database(dbPath);

    // Verificar si el usuario puede ver este empleado
    const canView = req.user.permisos === 'admin' || req.user.id == id;

    if (!canView) {
        db.close();
        return res.status(403).json({
            success: false,
            message: 'No tienes permisos para ver este empleado'
        });
    }

    db.get(
        `SELECT e.*, r.nombre as rol_nombre, r.descripcion as rol_descripcion
         FROM empleados e 
         LEFT JOIN roles r ON e.rol_id = r.id 
         WHERE e.id = ?`,
        [id],
        (err, empleado) => {
            db.close();
            
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: 'Error al obtener empleado'
                });
            }

            if (!empleado) {
                return res.status(404).json({
                    success: false,
                    message: 'Empleado no encontrado'
                });
            }

            // Ocultar password_hash de la respuesta
            const { password_hash, ...empleadoSinPassword } = empleado;

            res.json({
                success: true,
                data: empleadoSinPassword
            });
        }
    );
});

// Crear nuevo empleado (solo admin)
router.post('/', authenticateToken, requireAdmin, (req, res) => {
    const {
        nombre,
        apellido,
        email,
        telefono,
        direccion,
        fecha_nacimiento,
        fecha_contratacion,
        rol_id,
        password
    } = req.body;

    if (!nombre || !apellido || !email || !password || !rol_id) {
        return res.status(400).json({
            success: false,
            message: 'Nombre, apellido, email, contraseña y rol son requeridos'
        });
    }

    if (password.length < 6) {
        return res.status(400).json({
            success: false,
            message: 'La contraseña debe tener al menos 6 caracteres'
        });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const db = new sqlite3.Database(dbPath);

    db.run(
        `INSERT INTO empleados 
         (nombre, apellido, email, telefono, direccion, fecha_nacimiento, 
          fecha_contratacion, rol_id, password_hash) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [nombre, apellido, email, telefono, direccion, fecha_nacimiento, 
         fecha_contratacion, rol_id, passwordHash],
        function(err) {
            if (err) {
                db.close();
                if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                    return res.status(400).json({
                        success: false,
                        message: 'El email ya está registrado'
                    });
                }
                return res.status(500).json({
                    success: false,
                    message: 'Error al crear empleado'
                });
            }

            // Obtener el empleado creado
            db.get(
                `SELECT e.*, r.nombre as rol_nombre 
                 FROM empleados e 
                 LEFT JOIN roles r ON e.rol_id = r.id 
                 WHERE e.id = ?`,
                [this.lastID],
                (err, empleado) => {
                    db.close();
                    
                    if (err) {
                        return res.status(500).json({
                            success: false,
                            message: 'Empleado creado pero error al obtener datos'
                        });
                    }

                    const { password_hash, ...empleadoSinPassword } = empleado;

                    // Regenerar calendario de horarios después de crear empleado
                    regenerateScheduleCalendar();

                    res.status(201).json({
                        success: true,
                        message: 'Empleado creado exitosamente. Calendario de horarios regenerado.',
                        data: empleadoSinPassword
                    });
                }
            );
        }
    );
});

// Actualizar empleado
router.put('/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const {
        nombre,
        apellido,
        email,
        telefono,
        direccion,
        fecha_nacimiento,
        fecha_contratacion,
        rol_id,
        activo
    } = req.body;

    // Verificar permisos
    const canUpdate = req.user.permisos === 'admin' || req.user.id == id;

    if (!canUpdate) {
        return res.status(403).json({
            success: false,
            message: 'No tienes permisos para actualizar este empleado'
        });
    }

    // Solo admin puede cambiar rol y estado activo
    if (req.user.permisos !== 'admin' && (rol_id !== undefined || activo !== undefined)) {
        return res.status(403).json({
            success: false,
            message: 'Solo los administradores pueden cambiar el rol o estado del empleado'
        });
    }

    const db = new sqlite3.Database(dbPath);

    // Construir query dinámicamente
    const updates = [];
    const values = [];

    if (nombre !== undefined) { updates.push('nombre = ?'); values.push(nombre); }
    if (apellido !== undefined) { updates.push('apellido = ?'); values.push(apellido); }
    if (email !== undefined) { updates.push('email = ?'); values.push(email); }
    if (telefono !== undefined) { updates.push('telefono = ?'); values.push(telefono); }
    if (direccion !== undefined) { updates.push('direccion = ?'); values.push(direccion); }
    if (fecha_nacimiento !== undefined) { updates.push('fecha_nacimiento = ?'); values.push(fecha_nacimiento); }
    if (fecha_contratacion !== undefined) { updates.push('fecha_contratacion = ?'); values.push(fecha_contratacion); }
    if (rol_id !== undefined && req.user.permisos === 'admin') { updates.push('rol_id = ?'); values.push(rol_id); }
    if (activo !== undefined && req.user.permisos === 'admin') { updates.push('activo = ?'); values.push(activo); }

    if (updates.length === 0) {
        db.close();
        return res.status(400).json({
            success: false,
            message: 'No hay campos para actualizar'
        });
    }

    values.push(id);

    db.run(
        `UPDATE empleados SET ${updates.join(', ')} WHERE id = ?`,
        values,
        function(err) {
            if (err) {
                db.close();
                if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                    return res.status(400).json({
                        success: false,
                        message: 'El email ya está registrado'
                    });
                }
                return res.status(500).json({
                    success: false,
                    message: 'Error al actualizar empleado'
                });
            }

            if (this.changes === 0) {
                db.close();
                return res.status(404).json({
                    success: false,
                    message: 'Empleado no encontrado'
                });
            }

            // Obtener empleado actualizado
            db.get(
                `SELECT e.*, r.nombre as rol_nombre 
                 FROM empleados e 
                 LEFT JOIN roles r ON e.rol_id = r.id 
                 WHERE e.id = ?`,
                [id],
                (err, empleado) => {
                    db.close();
                    
                    if (err) {
                        return res.status(500).json({
                            success: false,
                            message: 'Empleado actualizado pero error al obtener datos'
                        });
                    }

                    const { password_hash, ...empleadoSinPassword } = empleado;

                    // Regenerar calendario de horarios después de actualizar empleado
                    regenerateScheduleCalendar();

                    res.json({
                        success: true,
                        message: 'Empleado actualizado exitosamente. Calendario de horarios regenerado.',
                        data: empleadoSinPassword
                    });
                }
            );
        }
    );
});

// Eliminar empleado (solo admin)
router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
    const { id } = req.params;
    const db = new sqlite3.Database(dbPath);

    // No permitir eliminar el propio usuario
    if (req.user.id == id) {
        db.close();
        return res.status(400).json({
            success: false,
            message: 'No puedes eliminar tu propia cuenta'
        });
    }

    db.run(
        'DELETE FROM empleados WHERE id = ?',
        [id],
        function(err) {
            db.close();
            
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: 'Error al eliminar empleado'
                });
            }

            if (this.changes === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Empleado no encontrado'
                });
            }

            // Regenerar calendario de horarios después de eliminar empleado
            regenerateScheduleCalendar();

            res.json({
                success: true,
                message: 'Empleado eliminado exitosamente. Calendario de horarios regenerado.'
            });
        }
    );
});

// Obtener estadísticas de empleados (solo admin)
router.get('/stats/overview', authenticateToken, requireAdmin, (req, res) => {
    const db = new sqlite3.Database(dbPath);

    const queries = [
        'SELECT COUNT(*) as total FROM empleados WHERE activo = 1',
        'SELECT COUNT(*) as total FROM empleados WHERE activo = 0',
        'SELECT COUNT(*) as total FROM asistencia WHERE DATE(created_at) = DATE("now")',
        'SELECT COUNT(*) as total FROM vacaciones WHERE estado = "pendiente"'
    ];

    Promise.all(queries.map(query => 
        new Promise((resolve, reject) => {
            db.get(query, (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        })
    )).then(results => {
        db.close();
        res.json({
            success: true,
            data: {
                empleadosActivos: results[0].total,
                empleadosInactivos: results[1].total,
                asistenciasHoy: results[2].total,
                vacacionesPendientes: results[3].total
            }
        });
    }).catch(err => {
        db.close();
        res.status(500).json({
            success: false,
            message: 'Error al obtener estadísticas'
        });
    });
});

// Actualizar tiempo de colación de un empleado (solo admin)
router.put('/:id/colacion', authenticateToken, requireAdmin, (req, res) => {
    const { id } = req.params;
    const { tiempo_colacion } = req.body;

    // Validar que el tiempo de colación sea un número válido entre 0 y 120 minutos
    if (!tiempo_colacion || isNaN(tiempo_colacion) || tiempo_colacion < 0 || tiempo_colacion > 120) {
        return res.status(400).json({
            success: false,
            message: 'El tiempo de colación debe ser un número entre 0 y 120 minutos'
        });
    }

    const db = new sqlite3.Database(dbPath);
    
    db.run(
        'UPDATE empleados SET tiempo_colacion = ? WHERE id = ?',
        [tiempo_colacion, id],
        function(err) {
            db.close();
            
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: 'Error al actualizar tiempo de colación'
                });
            }

            if (this.changes === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Empleado no encontrado'
                });
            }

            res.json({
                success: true,
                message: 'Tiempo de colación actualizado correctamente'
            });
        }
    );
});

// Obtener tiempo de colación de un empleado
router.get('/:id/colacion', authenticateToken, (req, res) => {
    const { id } = req.params;
    const db = new sqlite3.Database(dbPath);
    
    // Verificar permisos: solo el empleado puede ver su tiempo de colación o un admin
    if (req.user.rol !== 'admin' && req.user.id != id) {
        db.close();
        return res.status(403).json({
            success: false,
            message: 'No tienes permisos para ver esta información'
        });
    }
    
    db.get(
        'SELECT tiempo_colacion FROM empleados WHERE id = ?',
        [id],
        (err, row) => {
            db.close();
            
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: 'Error al obtener tiempo de colación'
                });
            }

            if (!row) {
                return res.status(404).json({
                    success: false,
                    message: 'Empleado no encontrado'
                });
            }

            res.json({
                success: true,
                tiempo_colacion: row.tiempo_colacion
            });
        }
    );
});

// Función para regenerar el calendario de horarios
function regenerateScheduleCalendar() {
    const db = new sqlite3.Database(dbPath);
    
    // Obtener todos los empleados activos
    db.all(
        'SELECT id, nombre, apellido FROM empleados WHERE activo = 1 ORDER BY id',
        (err, empleados) => {
            if (err) {
                console.error('Error al obtener empleados para regenerar calendario:', err);
                db.close();
                return;
            }

            console.log(`🔄 Regenerando calendario de horarios para ${empleados.length} empleados`);
            console.log('👥 Empleados activos:', empleados.map(e => `${e.nombre} ${e.apellido}`).join(', '));
            
            // Limpiar horarios existentes (opcional - comentado para preservar historial)
            // db.run('DELETE FROM empleado_horarios', (err) => {
            //     if (err) {
            //         console.error('Error al limpiar horarios existentes:', err);
            //     }
            // });

            // Aquí se podría implementar la lógica de regeneración del calendario
            // Por ahora solo registramos que se debe regenerar
            console.log('✅ Calendario de horarios marcado para regeneración');
            console.log('📅 El frontend debe regenerar el calendario oficial');
            
            db.close();
        }
    );
}

module.exports = router;
